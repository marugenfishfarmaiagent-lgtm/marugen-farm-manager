import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

const SESSION_KEY = 'marugen_session'

export function getAuthHeaders(extraHeaders = {}) {
  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    ...extraHeaders,
  }
  const token = getSessionToken()
  if (token) {
    headers['x-session-token'] = token
    headers.Authorization = `Session ${token}`
  }
  return headers
}

export function cloudFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  })
}

function readSessionRaw() {
  if (isSupabaseConfigured) {
    const fromSession = sessionStorage.getItem(SESSION_KEY)
    const fromLocal = localStorage.getItem(SESSION_KEY)
    if (fromLocal && !fromSession) {
      try {
        sessionStorage.setItem(SESSION_KEY, fromLocal)
      } catch {
        /* private mode */
      }
    }
    return fromSession || fromLocal
  }
  const fromLocal = localStorage.getItem(SESSION_KEY)
  if (fromLocal) return fromLocal
  const fromSession = sessionStorage.getItem(SESSION_KEY)
  if (fromSession) {
    try {
      localStorage.setItem(SESSION_KEY, fromSession)
    } catch {
      /* quota or private mode */
    }
  }
  return fromSession
}

export function getSession() {
  try {
    const raw = readSessionRaw()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession({ token, user }) {
  const payload = { user, ...(token ? { token } : {}) }
  const json = JSON.stringify(payload)
  sessionStorage.setItem(SESSION_KEY, json)
  try {
    localStorage.setItem(SESSION_KEY, json)
  } catch {
    /* quota or private mode */
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

export function getSessionToken() {
  return getSession()?.token || null
}

export function hasCloudSession() {
  if (!isSupabaseConfigured) return Boolean(getSessionToken())
  return Boolean(getSession()?.user)
}

export async function authStatus() {
  if (!isSupabaseConfigured) return { needsSetup: false, hasUsers: true, cloud: false }
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Auth status failed')
  return { ...data, cloud: true }
}

export async function loginWithPin(pin) {
  if (!isSupabaseConfigured) return null
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', pin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  setSession({ user: data.user, token: data.sessionToken })
  return data
}

export async function fetchPublicUsers() {
  if (!isSupabaseConfigured) return []
  const status = await authStatus()
  return status.hasUsers ? [{ id: 'cloud', name: 'Team member', role: 'staff', active: true }] : []
}

export async function setupOwner({ name, pin, setupSecret }) {
  if (!isSupabaseConfigured) return null
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}),
    },
    body: JSON.stringify({ action: 'setup', name, pin, setupSecret }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Setup failed')
  setSession({ user: data.user, token: data.sessionToken })
  return data
}

export async function changeMyPin({ currentPin, newPin }) {
  if (!isSupabaseConfigured) {
    return { local: true }
  }
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'change_pin', currentPin, newPin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to change PIN')
  return data
}

export async function logout() {
  if (isSupabaseConfigured) {
    await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    }).catch(() => {})
  } else {
    const session = getSession()
    if (session?.token) {
      await fetch(`${getFunctionsUrl()}/auth-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'logout', token: session.token }),
      }).catch(() => {})
    }
  }
  clearSession()
}

export function toAppUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    permissions: user.permissions,
    displayName: user.role === 'owner' ? `🐟 ${user.name}` : `👤 ${user.name}`,
  }
}
