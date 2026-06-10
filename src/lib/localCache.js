import { get, set, del } from 'idb-keyval'

const CACHE_VERSION = 'v1'
const ALL_DATA_KEY = `${CACHE_VERSION}:allData`
const TTL_MS = 24 * 60 * 60 * 1000

export async function cacheWriteAllData(data) {
  await set(ALL_DATA_KEY, {
    data,
    cachedAt: new Date().toISOString(),
  })
}

export async function cacheReadAllData() {
  try {
    const entry = await get(ALL_DATA_KEY)
    if (!entry) return null

    const age = Date.now() - new Date(entry.cachedAt).getTime()
    if (age > TTL_MS) {
      await del(ALL_DATA_KEY)
      return null
    }

    return { data: entry.data, cachedAt: entry.cachedAt, isCache: true }
  } catch {
    return null
  }
}

export async function cacheInvalidateAllData() {
  await del(ALL_DATA_KEY)
}

export async function getCacheStats() {
  const entry = await get(ALL_DATA_KEY)
  if (!entry) return []

  const counts = {}
  for (const [key, value] of Object.entries(entry.data || {})) {
    counts[key] = Array.isArray(value) ? value.length : value ? 1 : 0
  }

  return [{
    key: ALL_DATA_KEY,
    cachedAt: entry.cachedAt,
    recordCount: counts,
  }]
}
