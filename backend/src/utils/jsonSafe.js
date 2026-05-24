/**
 * Rend une valeur sérialisable en JSON (BigInt, Date, buffers binaires).
 * À utiliser sur les réponses sensibles si le driver renvoie encore des types exotiques.
 */
function jsonReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && typeof value.toJSON === "function") return value.toJSON();
  return value;
}

function toJsonSafeDeep(input) {
  try {
    return JSON.parse(JSON.stringify(input, jsonReplacer));
  } catch {
    return input;
  }
}

module.exports = { jsonReplacer, toJsonSafeDeep };
