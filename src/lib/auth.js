import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

const SESSION_KEY = 'marugen_session'

function readSessionRaw() {
  // iOS Safari and Home Screen PWA use separate storage — prefer localStorage so login persists in standalone mode.
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
  const json = JSON.stringify({ token, user })
  try {
    localStorage.setItem(SESSION_KEY, json)
  } catch {
    /* quota or private mode */
  }
  sessionStorage.setItem(SESSION_KEY, json)
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

export function getSessionToken() {
  return getSession()?.token || null
}

export async function authStatus() {
  if (!isSupabaseConfigured) return { needsSetup: false, hasUsers: true, cloud: false }
  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Auth status failed')
  return { ...data, cloud: true }
}

export async function loginWithPin(pin) {
  if (!isSupabaseConfigured) return null
  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'login', pin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  setSession(data)
  return data
}

export async function fetchPublicUsers() {
  if (!isSupabaseConfigured) return []
  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load users')
  return data.users || []
}

export async function setupOwner({ name, pin }) {
  if (!isSupabaseConfigured) return null
  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: 'setup', name, pin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Setup failed')
  setSession(data)
  return data
}

export async function changeMyPin({ currentPin, newPin }) {
  if (!isSupabaseConfigured) {
    return { local: true }
  }
  const token = getSessionToken()
  if (!token) throw new Error('Not logged in')

  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Session ${token}`,
    },
    body: JSON.stringify({ action: 'change_pin', currentPin, newPin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to change PIN')
  return data
}

export async function logout() {
  const session = getSession()
  if (session?.token && isSupabaseConfigured) {
    await fetch(`${getFunctionsUrl()}/auth-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'logout', token: session.token }),
    }).catch(() => {})
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
