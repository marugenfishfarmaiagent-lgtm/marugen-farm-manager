import { markDeleted } from './syncDeletions'

/** Register server tombstones so merge + push ignore deleted rows. */
export function applyServerTombstones(tombstones) {
  if (!Array.isArray(tombstones)) return
  for (const row of tombstones) {
    if (!row?.entity) continue
    const id = row.recordId ?? row.record_id
    if (id == null || id === '') continue
    markDeleted(row.entity, id)
  }
}

export function tombstoneIdSet(tombstones, entity) {
  const set = new Set()
  if (!Array.isArray(tombstones)) return set
  for (const row of tombstones) {
    if (row?.entity !== entity) continue
    const id = row.recordId ?? row.record_id
    if (id != null && id !== '') set.add(String(id))
  }
  return set
}

export function stripTombstonedRows(rows, entity, tombstones) {
  const ids = tombstoneIdSet(tombstones, entity)
  if (!ids.size) return rows || []
  return (rows || []).filter((row) => row?.id != null && !ids.has(String(row.id)))
}

/** Count local rows that server has tombstoned (must pull to purge). */
export function countTombstoneDivergences(localList, tombstones, entity) {
  const ids = tombstoneIdSet(tombstones, entity)
  if (!ids.size) return 0
  let count = 0
  for (const row of localList || []) {
    if (ids.has(String(row.id))) count += 1
  }
  return count
}
