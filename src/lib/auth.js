import { getFunctionsUrl, isSupabaseConfigured } from './supabase'
import {
  normalizeAuthUser,
  validateChangePinForm,
  validateLoginPin,
  validateSetupOwnerFields,
} from './loginOps'

const SESSION_KEY = 'marugen_session'

export function isInstalledPwa() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

export function getAuthHeaders(extraHeaders = {}) {
  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    ...extraHeaders,
  }
  const token = getSessionToken()
  if (token) {
    // Supabase gateway reliably forwards Authorization; custom x-session-token does not.
    headers.Authorization = `Session ${token}`
  }
  return headers
}

function formatFetchError(err, fallback = 'Network request failed') {
  const msg = err?.message || fallback
  if (/load failed|failed to fetch|networkerror/i.test(msg)) {
    return 'Cannot reach Supabase. Check internet connection, then refresh and try again.'
  }
  return msg
}

export function cloudFetch(url, options = {}) {
  const useCookies = options.credentials === 'include'
  return fetch(url, {
    ...options,
    credentials: useCookies ? 'include' : 'omit',
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  }).catch((err) => {
    throw new Error(formatFetchError(err))
  })
}

function mirrorSessionStorage(raw) {
  if (!raw) return
  try {
    sessionStorage.setItem(SESSION_KEY, raw)
  } catch {
    /* private mode */
  }
}

function mirrorLocalStorage(raw) {
  if (!raw) return
  try {
    localStorage.setItem(SESSION_KEY, raw)
  } catch {
    /* quota or private mode */
  }
}

function readSessionRaw() {
  if (isSupabaseConfigured) {
    const fromLocal = localStorage.getItem(SESSION_KEY)
    const fromSession = sessionStorage.getItem(SESSION_KEY)
    const raw = fromLocal || fromSession
    if (raw) {
      mirrorSessionStorage(raw)
      mirrorLocalStorage(raw)
    }
    return raw
  }
  const fromLocal = localStorage.getItem(SESSION_KEY)
  if (fromLocal) return fromLocal
  const fromSession = sessionStorage.getItem(SESSION_KEY)
  if (fromSession) mirrorLocalStorage(fromSession)
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
  mirrorSessionStorage(json)
  mirrorLocalStorage(json)
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

/** True when user is stored but mobile/PWA auth token is missing (needs one re-login or bootstrap). */
export function sessionNeedsRefresh() {
  if (!isSupabaseConfigured) return false
  const session = getSession()
  return Boolean(session?.user && !session?.token)
}

function applyAuthBootstrap(data) {
  if (!data?.authenticated || !data?.user || !data?.sessionToken) return false
  const user = normalizeAuthUser(data.user)
  if (!user?.active) return false
  setSession({ user, token: data.sessionToken })
  return true
}

export async function bootstrapCloudSession() {
  if (!isSupabaseConfigured) return false
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Auth status failed')
  return applyAuthBootstrap(data)
}

export async function authStatus() {
  if (!isSupabaseConfigured) return { needsSetup: false, hasUsers: true, cloud: false }
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Auth status failed')
  applyAuthBootstrap(data)
  return { ...data, cloud: true }
}

export async function loginWithPin(pin) {
  if (!isSupabaseConfigured) return null
  const check = validateLoginPin(pin)
  if (!check.ok) throw new Error(check.message)

  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', pin: check.pin }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')

  const user = normalizeAuthUser(data.user)
  if (!user?.active) {
    clearSession()
    throw new Error('This account is inactive. Contact the farm owner.')
  }

  setSession({ user, token: data.sessionToken })
  return { ...data, user }
}

export async function fetchPublicUsers() {
  if (!isSupabaseConfigured) return []
  const status = await authStatus()
  return status.hasUsers ? [{ id: 'cloud', name: 'Team member', role: 'staff', active: true }] : []
}

export async function setupOwner({ name, pin, confirmPin, setupSecret }) {
  if (!isSupabaseConfigured) return null
  const check = validateSetupOwnerFields({ name, pin, confirmPin: confirmPin ?? pin })
  if (!check.ok) throw new Error(check.message)

  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(setupSecret ? { 'x-setup-secret': setupSecret } : {}),
    },
    body: JSON.stringify({
      action: 'setup',
      name: check.name,
      pin: check.pin,
      setupSecret,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Setup failed')

  const user = normalizeAuthUser(data.user)
  setSession({ user, token: data.sessionToken })
  return { ...data, user }
}

export async function changeMyPin({ currentPin, newPin, confirmPin }) {
  if (!isSupabaseConfigured) {
    return { local: true }
  }
  const check = validateChangePinForm({ currentPin, newPin, confirmPin: confirmPin ?? newPin })
  if (!check.ok) throw new Error(check.message)

  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'change_pin',
      currentPin: check.currentPin,
      newPin: check.newPin,
    }),
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
  const normalized = normalizeAuthUser(user)
  if (!normalized) return null
  return {
    ...normalized,
    displayName: normalized.role === 'owner' ? `🐟 ${normalized.name}` : `👤 ${normalized.name}`,
  }
}
