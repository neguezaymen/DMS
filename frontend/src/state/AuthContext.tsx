/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import api, { clearAuthStorage, hasStoredAuthSession } from '../services/api/client'

type AuthUser = {
  id?: string | number
  email?: string
  fullName?: string
  roleIds?: any[]
  roles?: string[]
  [key: string]: any
} | null

type LoginPayload = { email: string; password: string }
type Verify2FAPayload = { twoFactorSessionToken: string; code: string }

type AuthContextValue = {
  user: AuthUser
  isAuthenticated: boolean
  isAdmin: boolean
  isManager: boolean
  login: (payload: LoginPayload) => Promise<any>
  verify2fa: (payload: Verify2FAPayload) => Promise<any>
  logout: () => Promise<void>
  applySession: (data: any) => void
  refreshProfile: () => Promise<any>
}

const AuthContext = createContext<AuthContextValue | null>(null)

let profileRefreshInflight: Promise<any> | null = null

function computeIsAdmin(user: AuthUser) {
  const roles = user?.roles || []
  return roles.some((r) => typeof r === 'string' && r.trim().toLowerCase() === 'admin')
}

function computeIsManager(user: AuthUser) {
  const names = user?.roles || []
  return names.some((r) => typeof r === 'string' && /^manager$/i.test(r.trim()))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser>(() => {
    if (!hasStoredAuthSession()) {
      clearAuthStorage()
      return null
    }
    const raw = localStorage.getItem('authUser')
    try {
      return raw ? JSON.parse(raw) : null
    } catch {
      clearAuthStorage()
      return null
    }
  })

  const refreshProfile = useCallback(async () => {
    if (!hasStoredAuthSession()) {
      setUser(null)
      clearAuthStorage()
      return null
    }
    if (profileRefreshInflight) return profileRefreshInflight

    profileRefreshInflight = (async () => {
      try {
        const response = await api.get('/auth/me')
        const u = response?.data?.data
        if (!u) return null
        setUser((prev) => {
          const merged = {
            ...(prev || {}),
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            roleIds: u.roleIds ?? [],
            roles: u.roles ?? [],
          }
          localStorage.setItem('authUser', JSON.stringify(merged))
          return merged
        })
        return u
      } catch (error: any) {
        if (error?.response?.status === 401) {
          clearAuthStorage()
          setUser(null)
        }
        return null
      } finally {
        profileRefreshInflight = null
      }
    })()

    return profileRefreshInflight
  }, [])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const applySession = useCallback(
    (data: any) => {
      const accessToken = data?.accessToken || data?.token
      const refreshToken = data?.refreshToken
      const userData = data?.user
      if (!accessToken || !refreshToken || !userData) {
        throw Object.assign(new Error('Invalid server response'), { statusCode: 502 })
      }
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.removeItem('token')
      localStorage.setItem('authUser', JSON.stringify(userData))
      setUser(userData)
      void refreshProfile()
    },
    [refreshProfile],
  )

  const login = useCallback(
    async ({ email, password }: LoginPayload) => {
      const response = await api.post('/auth/login', { email, password })
      const data = response?.data?.data
      if (!data) {
        throw Object.assign(new Error('Invalid server response'), { statusCode: 502 })
      }
      if (data.twoFactorRequired) {
        return data
      }
      applySession(data)
      return data
    },
    [applySession],
  )

  const verify2fa = useCallback(
    async ({ twoFactorSessionToken, code }: Verify2FAPayload) => {
      const response = await api.post('/auth/verify-2fa', { twoFactorSessionToken, code })
      const payload = response?.data?.data
      if (!payload) {
        throw Object.assign(new Error('Invalid server response'), { statusCode: 502 })
      }
      applySession(payload)
      return payload
    },
    [applySession],
  )

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken })
      }
    } catch {
      // no-op
    }
    clearAuthStorage()
    setUser(null)
  }, [])

  const isAdmin = useMemo(() => computeIsAdmin(user), [user])
  const isManager = useMemo(() => computeIsManager(user), [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin,
      isManager,
      login,
      verify2fa,
      logout,
      applySession,
      refreshProfile,
    }),
    [user, isAdmin, isManager, login, verify2fa, logout, applySession, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return {
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      isManager: false,
      login: async () => undefined,
      verify2fa: async () => undefined,
      logout: async () => undefined,
      applySession: () => undefined,
      refreshProfile: async () => null,
    }
  }
  return ctx
}
