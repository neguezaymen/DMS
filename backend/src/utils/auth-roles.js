/**
 * Règles de rôle pures (sans JWT ni DB) — utilisables par le middleware auth
 * et par document-access.service sans cycle require(middlewares/auth).
 */
function isAdmin(user) {
  if (!user) return false;
  return (user.roles || []).some((r) => String(r || "").toLowerCase().trim() === "admin");
}

function isManager(user) {
  if (!user || isAdmin(user)) return false;
  return (user.roles || []).some((r) => String(r || "").toLowerCase().trim() === "manager");
}

module.exports = { isAdmin, isManager };
