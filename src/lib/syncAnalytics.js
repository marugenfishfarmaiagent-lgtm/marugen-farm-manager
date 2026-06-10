const ANALYTICS_KEY = 'marugen_sync_analytics'
const MAX_ENTRIES = 500
const RETENTION_DAYS = 7

function loadLog() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY)
    if (!raw) return []
    const entries = JSON.parse(raw)
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    return entries.filter((e) => new Date(e.ts).getTime() > cutoff)
  } catch {
    return []
  }
}

function saveLog(entries) {
  const trimmed = entries.slice(-MAX_ENTRIES)
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(trimmed))
}

export function logSyncEvent(type, detail = {}) {
  const entries = loadLog()
  entries.push({
    ts: new Date().toISOString(),
    type,
    ...detail,
  })
  saveLog(entries)
}

export function getSyncReport() {
  const entries = loadLog()
  const now = Date.now()
  const last24h = entries.filter((e) => now - new Date(e.ts).getTime() < 86400000)

  const types = {}
  for (const e of entries) {
    types[e.type] = (types[e.type] || 0) + 1
  }

  const offlineEvents = entries.filter((e) => e.type === 'went_offline')
  const withDuration = offlineEvents.filter((e) => e.durationMs)
  const avgOfflineDuration = withDuration.reduce((sum, e) => sum + e.durationMs, 0) / (withDuration.length || 1)

  return {
    totalEvents: entries.length,
    last24h: last24h.length,
    eventBreakdown: types,
    offlineCount: offlineEvents.length,
    avgOfflineDurationSec: Math.round(avgOfflineDuration / 1000),
    recentEntries: entries.slice(-20).reverse(),
  }
}

export function clearSyncLog() {
  localStorage.removeItem(ANALYTICS_KEY)
}
