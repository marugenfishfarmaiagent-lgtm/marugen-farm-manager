function ts(record) {
  if (!record?.updatedAt) return 0
  const t = new Date(record.updatedAt).getTime()
  return Number.isFinite(t) ? t : 0
}

function isTerminalInvoiceStatus(status) {
  return status === 'paid' || status === 'cancelled'
}

/** Prefer paid/cancelled when timestamps tie — avoids cloud pull reverting a just-marked invoice. */
export function resolveInvoiceConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  if (lt !== rt) return lt > rt ? local : remote
  const ls = local?.status || 'pending'
  const rs = remote?.status || 'pending'
  if (isTerminalInvoiceStatus(ls) && !isTerminalInvoiceStatus(rs)) return local
  if (isTerminalInvoiceStatus(rs) && !isTerminalInvoiceStatus(ls)) return remote
  return local
}

/** Merge remote cloud rows into local state; newer updatedAt wins per id. */
export function mergeRecords(local = [], remote = [], pendingDeleteIds = [], resolveConflict) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const map = new Map()
  const pick = resolveConflict || ((a, b) => (ts(a) >= ts(b) ? a : b))

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
    map.set(id, pick(row, existing))
  }

  return [...map.values()]
}

export function mergeInvoices(local = [], remote = [], pendingDeleteIds = []) {
  return mergeRecords(local, remote, pendingDeleteIds, resolveInvoiceConflict)
}

export function mergePondData(local, remote) {
  if (!remote || typeof remote !== 'object') return local
  if (!local || typeof local !== 'object') return remote
  return ts(local) >= ts(remote) ? local : remote
}
