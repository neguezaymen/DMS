import { Navigate } from 'react-router-dom'

/** Redirige vers Paramètres → onglet Départements. */
export default function AdminDepartmentsPage() {
  return <Navigate to="/admin/settings?tab=departments" replace />
}
