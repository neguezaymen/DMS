import { Navigate } from 'react-router-dom'

/** Redirige vers Paramètres → onglet Champs personnalisés. */
export default function AdminCustomFieldsPage() {
  return <Navigate to="/admin/settings?tab=fields" replace />
}
