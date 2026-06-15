import { markDeleted, unmarkDeleted } from './syncDeletions.js'

/** Map record id → tombstone deleted_at for one entity. */
export function tombstoneMap(tombstones, entity) {
  const map = new Map()
  if (!Array.isArray(tombstones)) return map
  for (const row of tombstones) {
    if (row?.entity !== entity) continue
    const id = row.recordId ?? row.record_id
    if (id == null || id === '') continue
    map.set(String(id), String(row.deletedAt ?? row.deleted_at ?? ''))
  }
  return map
}

/** True when a live row was created/updated after the server tombstone (id reuse after SQL delete). */
export function isRowResurrectedAfterTombstone(row, tombDeletedAt) {
  if (!tombDeletedAt || !row) return false
  const rowAt = row.updatedAt ?? row.updated_at
  if (!rowAt) return false
  const delTs = new Date(tombDeletedAt).getTime()
  const rowTs = new Date(rowAt).getTime()
  if (!Number.isFinite(delTs) || !Number.isFinite(rowTs)) return false
  return rowTs > delTs
}

function liveRowForId(liveByEntity, entity, id) {
  const rows = liveByEntity?.[entity]
  if (!Array.isArray(rows)) return null
  return rows.find((row) => String(row?.id) === String(id)) || null
}

/**
 * Register server tombstones so merge + push ignore deleted rows.
 * Skips tombstones superseded by a live server row (re-created id after SQL delete).
 */
export function applyServerTombstones(tombstones, liveByEntity = {}) {
  if (!Array.isArray(tombstones)) return
  for (const row of tombstones) {
    if (!row?.entity) continue
    const entity = row.entity
    const id = row.recordId ?? row.record_id
    if (id == null || id === '') continue
    const deletedAt = row.deletedAt ?? row.deleted_at
    const live = liveRowForId(liveByEntity, entity, id)
    if (live && isRowResurrectedAfterTombstone(live, deletedAt)) {
      unmarkDeleted(entity, id)
      continue
    }
    markDeleted(entity, id)
  }
}

export function tombstoneIdSet(tombstones, entity, { liveRows = [] } = {}) {
  const tombs = tombstoneMap(tombstones, entity)
  if (!tombs.size) return new Set()
  const blocked = new Set()
  for (const [id, deletedAt] of tombs) {
    const live = (liveRows || []).find((row) => String(row?.id) === id)
    if (live && isRowResurrectedAfterTombstone(live, deletedAt)) continue
    blocked.add(id)
  }
  return blocked
}

export function stripTombstonedRows(rows, entity, tombstones) {
  const tombs = tombstoneMap(tombstones, entity)
  if (!tombs.size) return rows || []
  return (rows || []).filter((row) => {
    if (row?.id == null) return false
    const deletedAt = tombs.get(String(row.id))
    if (!deletedAt) return true
    return isRowResurrectedAfterTombstone(row, deletedAt)
  })
}

/** Count local rows that server has tombstoned (must pull to purge). */
export function countTombstoneDivergences(localList, tombstones, entity) {
  const tombs = tombstoneMap(tombstones, entity)
  if (!tombs.size) return 0
  let count = 0
  for (const row of localList || []) {
    const deletedAt = tombs.get(String(row.id))
    if (!deletedAt) continue
    if (isRowResurrectedAfterTombstone(row, deletedAt)) continue
    count += 1
  }
  return count
}

/** Build entity → live rows map for tombstone resurrection checks during cloud merge. */
export function buildLiveRowsByEntity(cleaned) {
  if (!cleaned) return {}
  return {
    invoices: cleaned.invoices || [],
    customers: cleaned.customers || [],
    products: cleaned.products || [],
    expenses: cleaned.expenses || [],
    deliveries: cleaned.deliveries || [],
    events: cleaned.events || [],
    stock_activity: cleaned.stockLog || [],
    koi_fish: cleaned.koiFishList || [],
    customer_koi: cleaned.customerKoiList || [],
    whatsapp_groups: cleaned.whatsappGroups || [],
  }
}

function rowUpdatedTs(row) {
  const raw = row?.updatedAt ?? row?.updated_at
  const t = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(t) ? t : 0
}

/** Prefer the newest copy when combining server pull rows with unsynced local rows. */
export function mergeLiveRows(serverRows = [], localRows = []) {
  const map = new Map()
  for (const row of serverRows) {
    if (row?.id == null) continue
    map.set(String(row.id), row)
  }
  for (const row of localRows) {
    if (row?.id == null) continue
    const id = String(row.id)
    const existing = map.get(id)
    if (!existing || rowUpdatedTs(row) >= rowUpdatedTs(existing)) {
      map.set(id, row)
    }
  }
  return [...map.values()]
}

/** Merge fetched cloud rows with in-flight local state for tombstone checks. */
export function mergeLiveByEntityWithLocal(cleaned, localState = {}) {
  const base = buildLiveRowsByEntity(cleaned)
  return {
    invoices: mergeLiveRows(base.invoices, localState.invoices),
    customers: mergeLiveRows(base.customers, localState.customers),
    products: mergeLiveRows(base.products, localState.products),
    expenses: mergeLiveRows(base.expenses, localState.expenses),
    deliveries: mergeLiveRows(base.deliveries, localState.deliveries),
    events: mergeLiveRows(base.events, localState.events),
    stock_activity: mergeLiveRows(base.stock_activity, localState.stockLog),
    koi_fish: mergeLiveRows(base.koi_fish, localState.koiFishList),
    customer_koi: mergeLiveRows(base.customer_koi, localState.customerKoiList),
    whatsapp_groups: mergeLiveRows(base.whatsapp_groups, localState.whatsappGroups),
  }
}

/** Drop pending delete ids superseded by a resurrected live row (SQL clear + re-create). */
export function filterMergeDeletions(entity, tombstones, localRows, remoteRows, pendingIds = []) {
  const tombs = tombstoneMap(tombstones, entity)
  return (pendingIds || []).filter((id) => {
    const deletedAt = tombs.get(String(id))
    if (!deletedAt) return true
    const live = [...(localRows || []), ...(remoteRows || [])].find(
      (row) => String(row?.id) === String(id),
    )
    if (live && isRowResurrectedAfterTombstone(live, deletedAt)) return false
    return true
  })
}
