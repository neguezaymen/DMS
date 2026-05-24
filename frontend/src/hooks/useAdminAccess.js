import { useAuth } from '../state/AuthContext'

/** Aligné sur le backend : rôle « admin » uniquement. */
export function useAdminAccess() {
  const { isAdmin } = useAuth()
  return isAdmin
}
