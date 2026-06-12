import { fetchWithSessionRetry, getAuthHeaders } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search'
const lookupCache = new Map()
const CACHE_MAX = 200

function titleCaseWords(value) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase())
}

function pickOneMapRow(results) {
  if (!Array.isArray(results) || !results.length) return null
  const generic = results.find((row) => !row.BUILDING || row.BUILDING === 'NIL')
  return generic || results[0]
}

export function formatOneMapRow(row) {
  if (!row) return null
  const blk = String(row.BLK_NO || '').trim()
  const road = String(row.ROAD_NAME || '').trim()
  const building = String(row.BUILDING || '').trim()

  if (blk && blk !== 'NIL' && road) {
    let line = `Blk ${blk} ${titleCaseWords(road)}`
    if (building && building !== 'NIL') line += ` (${titleCaseWords(building)})`
    return line
  }
  if (road) return titleCaseWords(road)

  const full = String(row.ADDRESS || '').trim()
  if (!full) return null
  return full
    .replace(/\s+SINGAPORE\s+\d{6}$/i, '')
    .replace(/\s+\d{6}$/, '')
    .trim() || null
}

async function fetchOneMapDirect(code) {
  const url = new URL(ONEMAP_SEARCH_URL)
  url.searchParams.set('searchVal', code)
  url.searchParams.set('returnGeom', 'N')
  url.searchParams.set('getAddrDetails', 'Y')
  url.searchParams.set('pageNum', '1')

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) return null

  const data = await res.json()
  const row = pickOneMapRow(data?.results)
  const address = formatOneMapRow(row)
  if (!address) return null

  return { address, postalCode: code }
}

async function fetchOneMapViaProxy(code) {
  if (!isSupabaseConfigured) return null
  try {
    const res = await fetchWithSessionRetry(`${getFunctionsUrl()}/farm-api`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'lookup_postal', postalCode: code }),
    })
    const raw = await res.text()
    let data = {}
    if (raw) {
      try { data = JSON.parse(raw) } catch { return null }
    }
    if (!res.ok || !data?.ok || !data?.address) return null
    return { address: data.address, postalCode: data.postalCode || code }
  } catch {
    return null
  }
}

/** Look up Singapore street address from a 6-digit postal code (OneMap, with cloud proxy fallback). */
export async function lookupSingaporePostalAddress(postalCode) {
  const code = String(postalCode || '').replace(/\D/g, '').slice(0, 6)
  if (code.length !== 6) return null

  if (lookupCache.has(code)) return lookupCache.get(code)

  let result = await fetchOneMapDirect(code)
  if (!result) result = await fetchOneMapViaProxy(code)

  if (result) {
    if (lookupCache.size >= CACHE_MAX) lookupCache.delete(lookupCache.keys().next().value)
    lookupCache.set(code, result)
  }
  return result
}
