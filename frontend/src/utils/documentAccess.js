/**
 * Droits d’interface dérivés de GET /documents/:id → data.access (et du propriétaire courant).
 * Ne remplace pas les contrôles serveur.
 *
 * @param {{ isAdmin: boolean, isOwner: boolean, access?: { role?: string, permission?: string|null, canDownload?: boolean, canManageVersion?: boolean } }} p
 * @returns {{ role: 'owner'|'share'|'none', canDownload: boolean, canManage: boolean, permission?: string|null }}
 */
export function resolveDocumentAccess({ isAdmin, isOwner, access }) {
  if (isAdmin || isOwner) {
    return { role: 'owner', canDownload: true, canManage: true }
  }
  if (access?.role === 'share') {
    return {
      role: 'share',
      canDownload: Boolean(access.canDownload),
      canManage: Boolean(access.canManageVersion),
      permission: access.permission ?? null,
    }
  }
  return { role: 'none', canDownload: false, canManage: false }
}
