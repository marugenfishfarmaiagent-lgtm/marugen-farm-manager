import { sortInvoices } from './invoiceDesign'
import { KOI_STATUS } from '../data/constants'

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
  const ls = local?.status || 'pending'
  const rs = remote?.status || 'pending'
  if (isTerminalInvoiceStatus(ls) && !isTerminalInvoiceStatus(rs)) return local
  if (isTerminalInvoiceStatus(rs) && !isTerminalInvoiceStatus(ls)) return remote
  if (lt !== rt) return lt > rt ? local : remote
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
  return sortInvoices(mergeRecords(local, remote, pendingDeleteIds, resolveInvoiceConflict))
}

const TERMINAL_KOI_STATUSES = new Set([KOI_STATUS.SOLD, KOI_STATUS.DECEASED])

/** Prefer sold/deceased when timestamps tie — avoids cloud pull reverting a just-marked sale. */
export function resolveKoiConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  const ls = local?.status || KOI_STATUS.AVAILABLE
  const rs = remote?.status || KOI_STATUS.AVAILABLE
  if (TERMINAL_KOI_STATUSES.has(ls) && !TERMINAL_KOI_STATUSES.has(rs)) return local
  if (TERMINAL_KOI_STATUSES.has(rs) && !TERMINAL_KOI_STATUSES.has(ls)) return remote
  if (lt !== rt) return lt > rt ? local : remote
  return local
}

export function mergeKoiFish(local = [], remote = [], pendingDeleteIds = []) {
  return mergeRecords(local, remote, pendingDeleteIds, resolveKoiConflict)
}

export function mergePondData(local, remote) {
  if (!remote || typeof remote !== 'object') return local
  if (!local || typeof local !== 'object') return remote
  return ts(local) >= ts(remote) ? local : remote
}
