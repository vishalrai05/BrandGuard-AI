import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import LoadingState from './LoadingState.jsx'

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState label="Restoring your session…" />
  if (!isAuthenticated) return <Navigate replace state={{ from: location }} to="/login" />
  return children
}

export function GuestRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <LoadingState label="Restoring your session…" />
  if (isAuthenticated) return <Navigate replace to="/" />
  return children
}
