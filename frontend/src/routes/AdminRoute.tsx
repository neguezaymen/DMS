import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../state/AuthContext'

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}
