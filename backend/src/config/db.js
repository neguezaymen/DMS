/**
 * Couche d'accès BD — PostgreSQL (Neon) avec shim de compatibilité MySQL.
 *
 * Le projet a été migré de MySQL vers PostgreSQL/Neon.
 * Pour éviter de réécrire ~300 requêtes brutes, ce module traduit
 * la syntaxe MySQL utilisée dans le code (`?`, `INSERT IGNORE`,
 * `ON DUPLICATE KEY UPDATE ... VALUES(col)`, `DATE_ADD/SUB(NOW(), INTERVAL ...)`,
 * `DATE_FORMAT`, `CURDATE`, `IF(cond,a,b)`, `IFNULL`, `GROUP_CONCAT`,
 * `LIMIT m, n`, backticks, `MATCH ... AGAINST`, etc.) vers PostgreSQL
 * au moment de l'exécution.
 *
 * L'API publique (`query`, `pool`, `pgPool`, `pgQuery`, `testConnection`)
 * reste identique à l'ancienne version.
 */
const { Pool } = require("pg");
const pgvectorModule = (() => {
  try {
    return require("pgvector/pg");
  } catch {
    return null;
  }
})();
require("dotenv").config();

const env = require("./env");

const DATABASE_URL = process.env.DATABASE_URL || env.databaseUrl;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL manquant — définissez la variable d'environnement dans backend/.env (ex. URL Neon)."
  );
}

const useSsl = /sslmode=require/i.test(DATABASE_URL) || /\.neon\.tech/i.test(DATABASE_URL);

const pgPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ---------------------------------------------------------------------------
// Mapping conflit pour ON DUPLICATE KEY UPDATE → ON CONFLICT (cols) DO UPDATE
// Chaque entrée doit refléter la PRIMARY KEY / UNIQUE INDEX cible côté Postgres.
// ---------------------------------------------------------------------------
const UPSERT_CONFLICT_TARGETS = {
  app_settings: "(key)",
  ai_quotas: "(user_id)",
  document_custom_values: "(document_id, field_id)",
  login_attempts: "(email)",
  notification_preferences: "(user_id, type)",
  permissions: "(name)",
  role_permissions: "(role_id, permission_id)",
  roles: "(name)",
  user_departments: "(user_id, department_id)",
  user_roles: "(user_id, role_id)",
};

// ---------------------------------------------------------------------------
// Helpers de traduction SQL MySQL → PostgreSQL
// ---------------------------------------------------------------------------

/** Remplace `?` (hors littéraux 'string') par `$1, $2, …`. */
function convertPlaceholders(sql) {
  let out = "";
  let i = 0;
  let placeholderIdx = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < sql.length) {
    const c = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";
    if (c === "'" && prev !== "\\" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && prev !== "\\" && !inSingle) inDouble = !inDouble;
    if (c === "?" && !inSingle && !inDouble) {
      placeholderIdx += 1;
      out += `$${placeholderIdx}`;
    } else {
      out += c;
    }
    i += 1;
  }
  return out;
}

/** Supprime les backticks d'identifiants MySQL — Postgres accepte les noms non réservés tels quels. */
function stripBackticks(sql) {
  return sql.replace(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g, "$1");
}

/** `LIMIT offset, limit` (MySQL) → `LIMIT limit OFFSET offset` (Postgres). */
function convertLimitOffset(sql) {
  return sql.replace(/\bLIMIT\s+(\d+)\s*,\s*(\d+)\b/gi, "LIMIT $2 OFFSET $1");
}

/**
 * Itère sur tous les appels `FN(...)` (insensible à la casse) avec parsing des
 * parenthèses imbriquées et des littéraux 'string'. Pour chaque appel, appelle
 * `transformer(args)` (args = liste de strings trimées). Si le transformer
 * renvoie une valeur falsy/null, l'appel d'origine est conservé tel quel.
 */
function replaceFunctionCalls(sql, fnName, transformer) {
  const re = new RegExp(`\\b${fnName}\\s*\\(`, "gi");
  let result = "";
  let lastIndex = 0;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index;
    let i = re.lastIndex; // après "("
    let depth = 1;
    let inSingle = false;
    const argsStart = i;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      const prev = i > 0 ? sql[i - 1] : "";
      if (c === "'" && prev !== "\\") inSingle = !inSingle;
      if (!inSingle) {
        if (c === "(") depth += 1;
        else if (c === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      i += 1;
    }
    if (depth !== 0) {
      result += sql.slice(lastIndex, re.lastIndex);
      lastIndex = re.lastIndex;
      continue;
    }
    const argsRaw = sql.slice(argsStart, i);
    const args = splitTopLevelCommas(argsRaw).map((a) => a.trim());
    const replacement = transformer(args);
    if (replacement == null) {
      result += sql.slice(lastIndex, i + 1);
    } else {
      result += sql.slice(lastIndex, start) + replacement;
    }
    lastIndex = i + 1;
    re.lastIndex = lastIndex;
  }
  result += sql.slice(lastIndex);
  return result;
}

/**
 * Génère l'expression INTERVAL côté Postgres pour `DATE_ADD/DATE_SUB` :
 *  - Si `n` est une constante numérique → `INTERVAL 'n UNIT'`.
 *  - Si `n` est un placeholder (`?` ou `$X`) → `n * INTERVAL '1 UNIT'`
 *    (Postgres n'accepte pas `INTERVAL ? UNIT`).
 */
function buildIntervalExpr(expr, op, n, unit) {
  const isPlaceholder = n === "?" || /^\$\d+$/.test(n);
  // Cast l'expression de base en `timestamp` : Postgres ne fait pas la coercion
  // implicite (ex. `TO_CHAR(...) - INTERVAL` lève "operator does not exist:
  // text - interval"). NOW(), CURRENT_DATE, TIMESTAMP, et strings parsables
  // se castent toutes sans perte vers `timestamp`.
  const base = `(${expr})::timestamp`;
  if (isPlaceholder) {
    return `(${base} ${op} (${n} * INTERVAL '1 ${unit}'))`;
  }
  return `(${base} ${op} INTERVAL '${n} ${unit}')`;
}

/**
 * `DATE_ADD(expr, INTERVAL N UNIT)` → `((expr) + INTERVAL 'N UNIT')`.
 * `DATE_SUB(expr, INTERVAL N UNIT)` → `((expr) - INTERVAL 'N UNIT')`.
 * Parsing parens-aware : `expr` peut contenir des virgules (ex. `DATE_FORMAT(CURDATE(), '%Y-%m-01')`).
 */
function convertDateAddSub(sql) {
  const intervalRe = /^INTERVAL\s+(\S+)\s+([A-Za-z]+)$/i;
  let s = replaceFunctionCalls(sql, "DATE_ADD", (args) => {
    if (args.length !== 2) return null;
    const im = args[1].match(intervalRe);
    if (!im) return null;
    return buildIntervalExpr(args[0], "+", im[1], im[2]);
  });
  s = replaceFunctionCalls(s, "DATE_SUB", (args) => {
    if (args.length !== 2) return null;
    const im = args[1].match(intervalRe);
    if (!im) return null;
    return buildIntervalExpr(args[0], "-", im[1], im[2]);
  });
  return s;
}

/**
 * `DATABASE()` (MySQL) → `current_schema()` (PostgreSQL).
 * Utilisé typiquement dans `WHERE table_schema = DATABASE()` pour inspecter
 * `information_schema.columns` — en Postgres le filtre logique est sur le
 * *schema* (souvent `public`), pas sur le nom de la base.
 */
function convertDatabaseFn(sql) {
  return sql.replace(/\bDATABASE\s*\(\s*\)/gi, "current_schema()");
}

/** `DATE_FORMAT(x, '%Y-%m')` → `TO_CHAR(x, 'YYYY-MM')` (subset utilisé dans le code). */
function convertDateFormat(sql) {
  const map = {
    "%Y-%m-%d": "YYYY-MM-DD",
    "%Y-%m": "YYYY-MM",
    "%Y-%m-01": "YYYY-MM-01",
    "%Y": "YYYY",
    "%m": "MM",
    "%d": "DD",
    "%H:%i:%s": "HH24:MI:SS",
  };
  return sql.replace(
    /\bDATE_FORMAT\s*\(\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi,
    (_, expr, fmt) => {
      const pgFmt = map[fmt] || fmt.replace(/%Y/g, "YYYY").replace(/%m/g, "MM").replace(/%d/g, "DD");
      return `TO_CHAR(${expr}, '${pgFmt}')`;
    }
  );
}

/** `CURDATE()` → `CURRENT_DATE`. */
function convertCurDate(sql) {
  return sql.replace(/\bCURDATE\s*\(\s*\)/gi, "CURRENT_DATE");
}

/** `IFNULL(a, b)` → `COALESCE(a, b)`. */
function convertIfNull(sql) {
  return sql.replace(/\bIFNULL\s*\(/gi, "COALESCE(");
}

/**
 * `IF(cond, a, b)` (fonction MySQL) → `CASE WHEN cond THEN a ELSE b END`.
 * Parsing robuste pour gérer les parenthèses imbriquées.
 */
function convertIfFunction(sql) {
  const re = /\bIF\s*\(/gi;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const start = match.index;
    const openParen = re.lastIndex; // position juste après "("
    let depth = 1;
    const args = [""];
    let i = openParen;
    let inSingle = false;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      const prev = i > 0 ? sql[i - 1] : "";
      if (c === "'" && prev !== "\\") inSingle = !inSingle;
      if (!inSingle) {
        if (c === "(") depth += 1;
        else if (c === ")") {
          depth -= 1;
          if (depth === 0) break;
        } else if (c === "," && depth === 1) {
          args.push("");
          i += 1;
          continue;
        }
      }
      args[args.length - 1] += c;
      i += 1;
    }
    if (args.length === 3) {
      const [cond, a, b] = args.map((s) => s.trim());
      result += sql.slice(lastIndex, start);
      result += `(CASE WHEN ${cond} THEN ${a} ELSE ${b} END)`;
      lastIndex = i + 1;
      re.lastIndex = lastIndex;
    }
  }
  result += sql.slice(lastIndex);
  return result;
}

/**
 * `GROUP_CONCAT([DISTINCT] expr [ORDER BY ... [ASC|DESC] [, ...]] [SEPARATOR 's'])` →
 * `STRING_AGG([DISTINCT] expr::text, 's' [ORDER BY ...])`.
 * Parseur manuel pour supporter ORDER BY multi-colonnes et expressions complexes.
 */
function convertGroupConcat(sql) {
  const re = /\bGROUP_CONCAT\s*\(/gi;
  let result = "";
  let lastIndex = 0;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const start = m.index;
    let i = re.lastIndex; // après "("
    let depth = 1;
    let inSingle = false;
    const startInner = i;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      const prev = i > 0 ? sql[i - 1] : "";
      if (c === "'" && prev !== "\\") inSingle = !inSingle;
      if (!inSingle) {
        if (c === "(") depth += 1;
        else if (c === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      i += 1;
    }
    if (depth !== 0) {
      // parenthèse non fermée — on n'altère rien
      result += sql.slice(lastIndex, re.lastIndex);
      lastIndex = re.lastIndex;
      continue;
    }
    const inner = sql.slice(startInner, i); // contenu entre parenthèses
    let rest = inner.trim();
    let distinct = false;
    if (/^DISTINCT\b/i.test(rest)) {
      distinct = true;
      rest = rest.replace(/^DISTINCT\b/i, "").trim();
    }
    // Séparateur (optionnel)
    let separator = ",";
    const sepMatch = rest.match(/\s+SEPARATOR\s+'([^']*)'\s*$/i);
    if (sepMatch) {
      separator = sepMatch[1];
      rest = rest.slice(0, sepMatch.index).trim();
    }
    // ORDER BY (optionnel)
    let orderBy = "";
    const orderIdx = rest.search(/\bORDER\s+BY\b/i);
    if (orderIdx >= 0) {
      orderBy = rest.slice(orderIdx).trim();
      rest = rest.slice(0, orderIdx).trim();
    }
    const expr = rest;
    const d = distinct ? "DISTINCT " : "";
    // En Postgres, STRING_AGG(DISTINCT x::text ORDER BY y) exige que `y`
    // soit *strictement* la même expression que l'argument agrégé. On cast donc
    // également chaque item du ORDER BY pour matcher `(expr)::text`.
    let order = "";
    if (orderBy) {
      const m = orderBy.match(/^ORDER\s+BY\s+(.+)$/i);
      if (m) {
        const items = splitTopLevelCommas(m[1]).map((item) => {
          const trimmed = item.trim();
          const dirMatch = trimmed.match(/^(.+?)(\s+(?:ASC|DESC))\s*$/i);
          const itemExpr = dirMatch ? dirMatch[1].trim() : trimmed;
          const itemDir = dirMatch ? dirMatch[2] : "";
          return `(${itemExpr})::text${itemDir}`;
        });
        order = ` ORDER BY ${items.join(", ")}`;
      } else {
        order = ` ${orderBy}`;
      }
    }
    const replacement = `STRING_AGG(${d}(${expr})::text, '${separator}'${order})`;
    result += sql.slice(lastIndex, start) + replacement;
    lastIndex = i + 1;
    re.lastIndex = lastIndex;
  }
  result += sql.slice(lastIndex);
  return result;
}

/**
 * `MATCH(col1, col2, ...) AGAINST (? IN NATURAL LANGUAGE MODE)` (filter) →
 * `(col1 ILIKE '%'||?||'%' OR col2 ILIKE '%'||?||'%' OR ...)`.
 * Le `?` apparaît N fois → on duplique le placeholder pour chaque colonne.
 * Cette transformation s'effectue AVANT `convertPlaceholders`.
 */
function convertMatchAgainst(sql) {
  return sql.replace(
    /\bMATCH\s*\(([^)]+)\)\s*AGAINST\s*\(\s*\?\s*(?:IN\s+(?:NATURAL\s+LANGUAGE|BOOLEAN)\s+MODE)?\s*\)/gi,
    (_, colsRaw) => {
      const cols = colsRaw.split(",").map((c) => c.trim());
      const parts = cols.map((c) => `COALESCE(${c}, '') ILIKE '%' || ? || '%'`);
      return `(${parts.join(" OR ")})`;
    }
  );
}

/** Liste de colonnes d'un `INSERT INTO T (a, b, c) VALUES`. */
function extractInsertColumns(sql) {
  const m = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+[a-zA-Z_][a-zA-Z0-9_."]*\s*\(([^)]+)\)\s*VALUES/i);
  if (!m) return [];
  return m[1].split(",").map((c) => c.replace(/[`"]/g, "").trim());
}

/** Extrait la table cible d'un INSERT. */
function extractInsertTable(sql) {
  const m = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * `INSERT IGNORE INTO T ...` → `INSERT INTO T ... ON CONFLICT DO NOTHING`.
 */
function convertInsertIgnore(sql) {
  return sql.replace(
    /\bINSERT\s+IGNORE\s+INTO\b/gi,
    "INSERT INTO"
  );
}

/**
 * Détecte si un INSERT utilise `INSERT IGNORE` (avant suppression du mot-clé)
 * et ajoute `ON CONFLICT DO NOTHING`.
 */
function appendOnConflictForIgnore(originalSql, transformedSql) {
  if (!/\bINSERT\s+IGNORE\b/i.test(originalSql)) return transformedSql;
  if (/\bON\s+CONFLICT\b/i.test(transformedSql)) return transformedSql;
  // Évite de toucher des SELECT/UNION/etc. en s'appuyant sur la position du dernier ; ou de la fin
  const trimmed = transformedSql.replace(/;\s*$/g, "");
  return `${trimmed} ON CONFLICT DO NOTHING`;
}

/** Split d'une chaîne sur les virgules de niveau 0 (hors parenthèses et littéraux). */
function splitTopLevelCommas(s) {
  const parts = [];
  let cur = "";
  let depth = 0;
  let inSingle = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const prev = i > 0 ? s[i - 1] : "";
    if (c === "'" && prev !== "\\") inSingle = !inSingle;
    if (!inSingle) {
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      else if (c === "," && depth === 0) {
        parts.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/**
 * Préfixe avec `<table>.` toute référence "bare" à une colonne du INSERT dans
 * une expression du RHS d'un assignment ON CONFLICT, pour lever l'ambiguïté
 * MySQL/PostgreSQL : en MySQL `ON DUPLICATE KEY UPDATE c = c + 1` désigne la
 * valeur existante en base ; en Postgres `c` (sans préfixe) collide avec
 * `EXCLUDED.c`. Les littéraux 'string' et les identifiants déjà préfixés (`.`)
 * sont laissés intacts.
 */
function qualifyBareColumnsInExpr(expr, table, columns) {
  if (!expr || !table || !columns || columns.length === 0) return expr;
  const colSet = new Set(columns.map((c) => c.toLowerCase()));
  let result = "";
  let i = 0;
  let inSingle = false;
  while (i < expr.length) {
    const c = expr[i];
    const prev = i > 0 ? expr[i - 1] : "";
    if (c === "'" && prev !== "\\") {
      inSingle = !inSingle;
      result += c;
      i += 1;
      continue;
    }
    if (inSingle || !/[A-Za-z_]/.test(c)) {
      result += c;
      i += 1;
      continue;
    }
    let j = i;
    while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j += 1;
    const word = expr.slice(i, j);
    const charBefore = i > 0 ? expr[i - 1] : "";
    const charAfter = j < expr.length ? expr[j] : "";
    const isQualified = charBefore === ".";
    const isCallOrCast = charAfter === "(" || expr.slice(j, j + 2) === "::";
    if (!isQualified && !isCallOrCast && colSet.has(word.toLowerCase())) {
      result += `${table}.${word}`;
    } else {
      result += word;
    }
    i = j;
  }
  return result;
}

/**
 * `ON DUPLICATE KEY UPDATE a = VALUES(a), b = VALUES(b), c = c + 1`
 * → `ON CONFLICT (conflictCols) DO UPDATE SET a = EXCLUDED.a, b = EXCLUDED.b,
 *    c = <table>.c + 1`.
 * `conflictCols` provient de `UPSERT_CONFLICT_TARGETS` selon la table.
 * Les colonnes bare du RHS sont préfixées par `<table>.` pour éviter
 * l'erreur PostgreSQL "column reference is ambiguous".
 */
function convertOnDuplicateKey(sql) {
  const re = /\bON\s+DUPLICATE\s+KEY\s+UPDATE\s+([\s\S]+?)(?=(?:\s*;|\s*$))/i;
  const m = sql.match(re);
  if (!m) return sql;
  const table = extractInsertTable(sql);
  const conflict = table && UPSERT_CONFLICT_TARGETS[table];
  if (!conflict) {
    throw new Error(
      `Pas de mapping ON CONFLICT pour la table "${table}". Ajoutez-le dans UPSERT_CONFLICT_TARGETS (src/config/db.js).`
    );
  }
  const columns = extractInsertColumns(sql);
  const setClauseRaw = m[1].replace(
    /\bVALUES\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/gi,
    "EXCLUDED.$1"
  );
  const qualified = splitTopLevelCommas(setClauseRaw)
    .map((part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return part;
      const lhs = part.slice(0, eqIdx);
      const rhs = part.slice(eqIdx + 1);
      return `${lhs}=${qualifyBareColumnsInExpr(rhs, table, columns)}`;
    })
    .join(",");
  return sql.replace(re, `ON CONFLICT ${conflict} DO UPDATE SET ${qualified}`);
}

/**
 * Ajoute `RETURNING id` à un INSERT (pour récupérer `insertId`).
 * N'agit pas si la requête contient déjà RETURNING, n'est pas un INSERT,
 * ou comporte un `ON CONFLICT DO NOTHING` (RETURNING vide possible — on garde).
 */
function appendReturningId(sql) {
  if (!/^\s*INSERT\b/i.test(sql)) return sql;
  if (/\bRETURNING\b/i.test(sql)) return sql;
  return sql.replace(/;?\s*$/g, "") + " RETURNING id";
}

/** Détecte le type d'opération pour métadonnées (mysql2 compat). */
function detectOp(sql) {
  const s = sql.trim().toUpperCase();
  if (s.startsWith("INSERT")) return "INSERT";
  if (s.startsWith("UPDATE")) return "UPDATE";
  if (s.startsWith("DELETE")) return "DELETE";
  if (s.startsWith("SELECT")) return "SELECT";
  return "OTHER";
}

/** Pipeline complet de traduction MySQL → PostgreSQL. */
function translateSql(originalSql) {
  let s = originalSql;
  s = stripBackticks(s);
  s = convertMatchAgainst(s); // doit précéder convertPlaceholders (duplique des `?`)
  s = convertOnDuplicateKey(s);
  const hadInsertIgnore = /\bINSERT\s+IGNORE\b/i.test(s);
  s = convertInsertIgnore(s);
  s = convertGroupConcat(s);
  s = convertIfFunction(s);
  s = convertIfNull(s);
  s = convertDateAddSub(s);
  s = convertDateFormat(s);
  s = convertCurDate(s);
  s = convertDatabaseFn(s);
  s = convertLimitOffset(s);
  if (hadInsertIgnore) s = appendOnConflictForIgnore(originalSql, s);
  const op = detectOp(s);
  if (op === "INSERT") {
    // RETURNING id pour exposer insertId (sauf si pas de colonne id, ex. tables jointures)
    const table = extractInsertTable(s);
    const noIdTables = new Set([
      "user_roles",
      "role_permissions",
      "user_departments",
      "notification_preferences",
      "ai_quotas",
      "app_settings",
    ]);
    if (table && !noIdTables.has(table)) {
      s = appendReturningId(s);
    }
  }
  s = convertPlaceholders(s);
  return { sql: s, op };
}

let pgVectorTypesRegistered = false;
async function registerPgVectorTypes(client) {
  if (!pgvectorModule || pgVectorTypesRegistered) return;
  try {
    await pgvectorModule.registerTypes(client);
    pgVectorTypesRegistered = true;
  } catch (e) {
    // pgvector pas installé côté Neon : on logue mais on continue
    console.warn("[pgvector] registerTypes a échoué :", e?.message || e);
  }
}

/**
 * `query(sql, params)` — API publique compatible avec l'ancien wrapper MySQL.
 * Retourne `{ rows, rowCount, insertId, affectedRows, changedRows }`.
 */
const query = async (sql, params = []) => {
  const safeParams = Array.isArray(params)
    ? params.map((v) => (v === undefined ? null : v))
    : [];
  const { sql: pgSql, op } = translateSql(sql);
  try {
    const res = await pgPool.query(pgSql, safeParams);
    const rows = Array.isArray(res.rows) ? res.rows : [];
    const rowCount = typeof res.rowCount === "number" ? res.rowCount : rows.length;
    let insertId = 0;
    if (op === "INSERT" && rows.length > 0 && rows[0].id != null) {
      insertId = Number(rows[0].id);
    }
    // Compat mysql2 : le code legacy lit parfois `result.rows.insertId` / `.affectedRows`
    // (en MySQL le ResultSetHeader est ce qui apparaît en première position du destructuring).
    Object.defineProperties(rows, {
      insertId: { value: insertId, enumerable: false, configurable: true },
      affectedRows: { value: rowCount, enumerable: false, configurable: true },
      changedRows: { value: rowCount, enumerable: false, configurable: true },
    });
    return {
      rows,
      rowCount,
      insertId,
      affectedRows: rowCount,
      changedRows: rowCount,
    };
  } catch (error) {
    console.error("[DB ERROR] Original SQL:", sql);
    console.error("[DB ERROR] Translated SQL:", pgSql);
    console.error("[DB ERROR] Params:", safeParams);
    console.error("[DB ERROR] Message:", error?.message || error);
    throw error;
  }
};

/**
 * Shim `pool` qui imite l'API minimale de mysql2 utilisée dans les scripts
 * (`pool.query(sql, params)` retourne `[rows, fields]` et `pool.end()`).
 */
const pool = {
  query: async (sql, params = []) => {
    const r = await query(sql, params);
    return [r.rows, []];
  },
  end: () => pgPool.end(),
  getConnection: async () => {
    const client = await pgPool.connect();
    return {
      query: async (sql, params = []) => {
        const safeParams = Array.isArray(params)
          ? params.map((v) => (v === undefined ? null : v))
          : [];
        const { sql: pgSql } = translateSql(sql);
        const res = await client.query(pgSql, safeParams);
        return [res.rows || [], []];
      },
      release: () => client.release(),
      ping: async () => {
        await client.query("SELECT 1");
      },
    };
  },
};

const pgQuery = async (sql, params = []) => {
  const client = await pgPool.connect();
  try {
    await registerPgVectorTypes(client);
    const result = await client.query(sql, params);
    return { rows: result.rows, rowCount: result.rowCount || 0 };
  } finally {
    client.release();
  }
};

const isPgVectorEnabled = () => true;

const testConnection = async () => {
  const client = await pgPool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
};

const testPgConnection = testConnection;

module.exports = {
  pool,
  pgPool,
  query,
  pgQuery,
  isPgVectorEnabled,
  registerPgVectorTypes,
  testConnection,
  testPgConnection,
  pgvector: pgvectorModule,
  translateSql,
};
