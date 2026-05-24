import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

let refreshPromise = null

function readAuthUser() {
  try {
    const raw = localStorage.getItem('authUser')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getStoredAccessToken() {
  const direct = localStorage.getItem('accessToken')
  if (direct) return direct

  const legacy = localStorage.getItem('token')
  if (legacy) {
    localStorage.setItem('accessToken', legacy)
    localStorage.removeItem('token')
    return legacy
  }

  const authUser = readAuthUser()
  const embedded = authUser?.accessToken || authUser?.token || null
  if (embedded) {
    localStorage.setItem('accessToken', embedded)
    localStorage.removeItem('token')
  }
  return embedded
}

export function getStoredRefreshToken() {
  const direct = localStorage.getItem('refreshToken')
  if (direct) return direct
  const authUser = readAuthUser()
  return authUser?.refreshToken || null
}

export function hasStoredAuthSession() {
  return Boolean(getStoredAccessToken() || getStoredRefreshToken())
}

/** Normalise les chemins renvoyés par l'API (`/api/v1/...`) pour axios (baseURL déjà `/api/v1`). */
export function toApiRelativePath(pathOrUrl) {
  const p = String(pathOrUrl || '').trim()
  if (!p) return '/'
  return p.replace(/^\/api\/v1(?=\/)/i, '') || '/'
}

export async function parseAxiosBlobErrorMessage(error) {
  const data = error.response?.data
  if (data instanceof Blob) {
    try {
      const text = await data.text()
      const j = JSON.parse(text)
      return typeof j.message === 'string' ? j.message : text
    } catch {
      return error.message || 'Request failed'
    }
  }
  if (data && typeof data === 'object' && typeof data.message === 'string') return data.message
  return error.message || 'Request failed'
}

/**
 * GET authentifié puis enregistrement navigateur (blob). `relPath` : ex. `/documents/12/download`.
 */
export async function downloadBlobFromApi(relPath, fallbackFilename = 'download') {
  const path = relPath.startsWith('/') ? relPath : `/${relPath}`
  const res = await api.get(path, { responseType: 'blob' })
  const header = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'] || ''
  let filename = fallbackFilename
  const mUtf = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (mUtf?.[1]) {
    try {
      filename = decodeURIComponent(mUtf[1])
    } catch {
      filename = fallbackFilename
    }
  } else {
    const mQ = /filename="([^"]+)"/i.exec(header)
    if (mQ?.[1]) filename = mQ[1]
    else {
      const mPlain = /filename=([^;]+)/i.exec(header)
      if (mPlain?.[1]) filename = mPlain[1].trim().replace(/^"|"$/g, '')
    }
  }
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}

export function clearAuthStorage() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('token')
  localStorage.removeItem('authUser')
}

function persistTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem('accessToken', accessToken)
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
  localStorage.removeItem('token')
}

function isTokenExpired(token) {
  if (!token) return true
  try {
    const base64Url = token.split('.')[1] || ''
    const normalizedPayload = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    )
    const payload = JSON.parse(atob(paddedPayload))
    const exp = Number(payload?.exp || 0)
    if (!exp) return false
    const now = Math.floor(Date.now() / 1000)
    return exp - now < 30
  } catch {
    return false
  }
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return null
  refreshPromise = axios
    .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
    .then((refreshResponse) => {
      const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data.data || {}
      if (!accessToken) return null
      persistTokens({ accessToken, refreshToken: newRefreshToken })
      return accessToken
    })
    .catch(() => {
      clearAuthStorage()
      return null
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

api.interceptors.request.use(async (config) => {
  if (config.url?.includes('/auth/refresh')) return config
  let token = getStoredAccessToken()
  if (isTokenExpired(token)) {
    token = await refreshAccessToken()
  }
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const refreshToken = getStoredRefreshToken()

    if (error.response?.status === 401 && refreshToken && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true
      try {
        const accessToken = await refreshAccessToken()
        if (!accessToken) throw new Error('Refresh failed')
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return api(originalRequest)
      } catch {
        clearAuthStorage()
      }
    }
    return Promise.reject(error)
  },
)

export default api
