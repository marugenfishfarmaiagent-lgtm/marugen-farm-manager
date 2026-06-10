import { getFunctionsUrl, isSupabaseConfigured } from './supabase'
import { cloudFetch } from './auth'
import { logSyncEvent } from './syncAnalytics'

let _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
let _isApiReachable = !isSupabaseConfigured
let _offlineStart = null
let _listeners = []

export function getConnectionState() {
  const reachable = isSupabaseConfigured ? _isApiReachable : true
  return {
    isOnline: _isOnline,
    isApiReachable: reachable,
    isSupabaseReachable: reachable,
    mode: _isOnline && reachable ? 'cloud' : 'offline',
  }
}

export function onConnectionChange(callback) {
  _listeners.push(callback)
  callback(getConnectionState())
  return () => { _listeners = _listeners.filter((l) => l !== callback) }
}

function _notify() {
  const state = getConnectionState()
  _listeners.forEach((fn) => fn(state))
}

const TRANSIENT_RE = /load failed|failed to fetch|networkerror|network request failed|cannot reach supabase|aborted|timeout/i

export function isTransientSyncError(message) {
  const msg = String(message || '')
  if (!msg) return false
  if (/session expired|permission denied|401|403/i.test(msg)) return false
  return TRANSIENT_RE.test(msg)
}

export async function checkApiConnection() {
  if (!isSupabaseConfigured) {
    _isApiReachable = true
    _notify()
    return true
  }

  if (!_isOnline) {
    if (_isApiReachable) {
      _isApiReachable = false
      _notify()
    }
    return false
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)
    const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`, {
      credentials: 'include',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    const reachable = res.status > 0 && res.status < 500
    if (reachable !== _isApiReachable) {
      const wasReachable = _isApiReachable
      _isApiReachable = reachable
      _notify()
      if (reachable && !wasReachable) logSyncEvent('api_reconnected')
      if (!reachable && wasReachable) logSyncEvent('api_lost', { status: res.status })
    }
    return reachable
  } catch (err) {
    if (_isApiReachable) {
      _isApiReachable = false
      _notify()
      logSyncEvent('api_lost', { reason: err?.message || 'network' })
    }
    return false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    _isOnline = true
    const durationMs = _offlineStart ? Date.now() - _offlineStart : 0
    logSyncEvent('came_online', { durationMs })
    _offlineStart = null
    _notify()
    checkApiConnection()
  })

  window.addEventListener('offline', () => {
    const wasReachable = _isApiReachable
    _isOnline = false
    _isApiReachable = false
    logSyncEvent('went_offline', { wasApiReachable: wasReachable })
    _offlineStart = Date.now()
    _notify()
  })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkApiConnection()
  })

  checkApiConnection()
  setInterval(checkApiConnection, 30_000)
}
