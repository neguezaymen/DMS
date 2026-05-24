import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { hasStoredAuthSession } from '../services/api/client'

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated || !hasStoredAuthSession()) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
