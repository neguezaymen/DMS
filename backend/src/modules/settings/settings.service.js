const { query } = require("../../config/db");

const env = require("../../config/env");
const DEFAULT_MAX_BYTES = Number(env.uploads?.maxBytes || 10 * 1024 * 1024);

async function getMaxUploadBytes() {
  try {
    const r = await query("SELECT `value` FROM app_settings WHERE `key` = ?", ["max_upload_size_bytes"]);
    if (r.rows.length > 0) {
      const v = parseInt(r.rows[0].value, 10);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch {
    // table missing before migrate
  }
  return DEFAULT_MAX_BYTES;
}

async function setMaxUploadBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 1024 || n > 500 * 1024 * 1024) {
    throw Object.assign(new Error("Invalid max_upload_size_bytes"), { statusCode: 400 });
  }
  await query(
    `INSERT INTO app_settings (\`key\`, \`value\`) VALUES ('max_upload_size_bytes', ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
    [String(Math.floor(n))]
  );
  return n;
}

async function getAllSettings() {
  try {
    const r = await query("SELECT `key`, `value`, updated_at FROM app_settings ORDER BY `key`");
    const map = {};
    for (const row of r.rows) {
      map[row.key] = row.value;
    }
    return map;
  } catch {
    return {};
  }
}

module.exports = {
  getMaxUploadBytes,
  setMaxUploadBytes,
  getAllSettings,
  DEFAULT_MAX_BYTES,
};
