function ts(record) {
  if (!record?.updatedAt) return 0
  const t = new Date(record.updatedAt).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Merge remote cloud rows into local state; newer updatedAt wins per id. */
export function mergeRecords(local = [], remote = [], pendingDeleteIds = []) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const map = new Map()

  for (const row of remote) {
    const id = String(row.id)
    if (!delSet.has(id)) map.set(id, row)
  }

  for (const row of local) {
    const id = String(row.id)
    if (delSet.has(id)) continue
    const existing = map.get(id)
    if (!existing) {
      map.set(id, row)
      continue
    }
    map.set(id, ts(row) >= ts(existing) ? row : existing)
  }

  return [...map.values()]
}

export function mergePondData(local, remote) {
  if (!remote || typeof remote !== 'object') return local
  if (!local || typeof local !== 'object') return remote
  return ts(local) >= ts(remote) ? local : remote
}
