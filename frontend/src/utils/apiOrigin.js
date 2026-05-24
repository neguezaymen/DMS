/** Origine HTTP du backend (sans /api/v1), pour les liens directs vers fichiers. */
export function getApiOrigin() {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
  return base.replace(/\/api\/v1\/?$/, '') || 'http://localhost:3000'
}
