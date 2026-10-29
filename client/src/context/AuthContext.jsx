import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, clearAuthToken, getAuthToken, setAuthToken } from '../api/client.js'

const AuthContext = createContext(null)

function safeUser(user) {
  return user ? { id: user.id ?? user._id, name: user.name, role: user.role } : null
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!getAuthToken()) {
      setLoading(false)
      return
    }
    let active = true
    api.me()
      .then((nextUser) => { if (active) setUser(safeUser(nextUser)) })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) clearAuthToken()
        setUser(null)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    function onSessionExpired() {
      setUser(null)
      setLoading(false)
      if (!['/login', '/register'].includes(location.pathname)) {
        navigate('/login', {
          replace: true,
          state: { message: 'Session expired. Please sign in again.', from: location },
        })
      }
    }
    window.addEventListener('brandguard:session-expired', onSessionExpired)
    return () => window.removeEventListener('brandguard:session-expired', onSessionExpired)
  }, [location, navigate])

  const login = useCallback(async (email, password) => {
    const result = await api.login(email, password)
    setAuthToken(result.token)
    setUser(safeUser(result.user))
    return safeUser(result.user)
  }, [])

  const register = useCallback(async (name, email, password) => {
    const result = await api.register(name, email, password)
    setAuthToken(result.token)
    setUser(safeUser(result.user))
    return safeUser(result.user)
  }, [])

  const logout = useCallback(() => {
    clearAuthToken()
    setUser(null)
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo(() => ({
    user, isAuthenticated: Boolean(user), loading, login, register, logout,
  }), [user, loading, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
