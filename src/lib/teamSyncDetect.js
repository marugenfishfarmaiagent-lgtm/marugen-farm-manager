import { applyCloudRetention } from './retention'
import { resolveCloudKoiPayload, resolveCloudWhatsappGroups } from './cloudData'
import { sanitizeInvoiceForSync } from './database'
import { countTombstoneDivergences } from './tombstones'

function recordTs(record) {
  if (!record?.updatedAt) return 0
  const t = new Date(record.updatedAt).getTime()
  return Number.isFinite(t) ? t : 0
}

function isTerminalInvoiceStatus(status) {
  const s = String(status || 'pending').toLowerCase()
  return s === 'paid' || s === 'cancelled'
}

/** Invoice accounts marks can diverge even when local updatedAt is newer (e.g. discount edit). */
function countInvoiceBookedDivergences(localList, remoteList, pendingDeleteIds) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map((localList || []).map((r) => [String(r.id), r]))
  let count = 0

  for (const remote of remoteList || []) {
    const id = String(remote.id)
    if (delSet.has(id)) continue
    const local = localMap.get(id)
    if (!local) continue
    if (Boolean(remote.booked) !== Boolean(local.booked)) {
      count += 1
      continue
    }
    const rbt = remote.bookedAt ? String(remote.bookedAt) : ''
    const lbt = local.bookedAt ? String(local.bookedAt) : ''
    if (rbt && rbt !== lbt) count += 1
  }

  return count
}

/** Paid/cancelled on server but stale pending on device — pull even if local updatedAt looks newer. */
function countInvoiceStatusDivergences(localList, remoteList, pendingDeleteIds) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map((localList || []).map((r) => [String(r.id), r]))
  let count = 0

  for (const remote of remoteList || []) {
    const id = String(remote.id)
    if (delSet.has(id)) continue
    const local = localMap.get(id)
    if (!local) continue
    const rs = String(remote.status || 'pending').toLowerCase()
    const ls = String(local.status || 'pending').toLowerCase()
    if (rs === ls) continue
    if (isTerminalInvoiceStatus(rs) || isTerminalInvoiceStatus(ls)) count += 1
  }

  return count
}

function countExpenseBookedDivergences(localList, remoteList, pendingDeleteIds) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map((localList || []).map((r) => [String(r.id), r]))
  let count = 0

  for (const remote of remoteList || []) {
    const id = String(remote.id)
    if (delSet.has(id)) continue
    const local = localMap.get(id)
    if (!local) continue
    if (Boolean(remote.booked) !== Boolean(local.booked)) count += 1
  }

  return count
}

const TERMINAL_KOI_STATUSES = new Set(['sold', 'deceased'])

function countKoiStatusDivergences(localList, remoteList, pendingDeleteIds) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map((localList || []).map((r) => [String(r.id), r]))
  let count = 0

  for (const remote of remoteList || []) {
    const id = String(remote.id)
    if (delSet.has(id)) continue
    const local = localMap.get(id)
    if (!local) continue
    const rs = String(remote.status || 'available').toLowerCase()
    const ls = String(local.status || 'available').toLowerCase()
    if (rs === ls) continue
    if (TERMINAL_KOI_STATUSES.has(rs) || TERMINAL_KOI_STATUSES.has(ls)) count += 1
  }

  return count
}

/** Count remote rows newer than local (another device likely saved). */
function countRemoteNewerRows(localList, remoteList, pendingDeleteIds) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  let count = 0
  const localMap = new Map((localList || []).map((r) => [String(r.id), r]))

  for (const remote of remoteList || []) {
    const id = String(remote.id)
    if (delSet.has(id)) continue
    const local = localMap.get(id)
    if (!local) {
      count += 1
      continue
    }
    if (recordTs(remote) > recordTs(local) + 500) count += 1
  }
  return count
}

function prepareCleanedCloudData(data) {
  if (!data) return null
  const koi = resolveCloudKoiPayload(data)
  const whatsapp = resolveCloudWhatsappGroups(data.whatsappGroups)
  const { data: cleaned } = applyCloudRetention({
    users: data.users,
    customers: data.customers || [],
    products: data.products || [],
    invoices: (data.invoices || []).map(sanitizeInvoiceForSync),
    expenses: data.expenses || [],
    deliveries: data.deliveries || [],
    events: data.events || [],
    stockLog: data.stockActivity || [],
    koiFishList: koi.koiFish,
    customerKoiList: koi.customerKoi,
    pondData: koi.pondData,
    whatsappGroups: whatsapp.groups,
  })
  return {
    ...cleaned,
    whatsappGroups: cleaned.whatsappGroups || whatsapp.groups,
    syncTombstones: data.syncTombstones || [],
  }
}

/**
 * Estimate how many records on the server are newer than local state.
 * Used to show a subtle team-sync notification after background polls.
 */
export function countIncomingTeamChanges(localState, fetchedData, peekDeletionsFn) {
  if (!localState || !fetchedData) return 0
  const cleaned = prepareCleanedCloudData(fetchedData)
  if (!cleaned) return 0

  const peek = peekDeletionsFn || (() => [])
  const tombstones = cleaned.syncTombstones || []

  let total = 0
  total += countTombstoneDivergences(localState.invoices, tombstones, 'invoices')
  total += countTombstoneDivergences(localState.koiFishList, tombstones, 'koi_fish')
  total += countTombstoneDivergences(localState.customerKoiList, tombstones, 'customer_koi')
  total += countTombstoneDivergences(localState.expenses, tombstones, 'expenses')
  total += countTombstoneDivergences(localState.deliveries, tombstones, 'deliveries')
  total += countTombstoneDivergences(localState.customers, tombstones, 'customers')
  total += countTombstoneDivergences(localState.products, tombstones, 'products')
  total += countTombstoneDivergences(localState.events, tombstones, 'events')
  total += countTombstoneDivergences(localState.stockLog, tombstones, 'stock_activity')
  total += countTombstoneDivergences(localState.whatsappGroups, tombstones, 'whatsapp_groups')
  total += countRemoteNewerRows(localState.customers, cleaned.customers, peek('customers'))
  total += countRemoteNewerRows(localState.products, cleaned.products, peek('products'))
  total += countRemoteNewerRows(localState.invoices, cleaned.invoices, peek('invoices'))
  total += countInvoiceBookedDivergences(localState.invoices, cleaned.invoices, peek('invoices'))
  total += countInvoiceStatusDivergences(localState.invoices, cleaned.invoices, peek('invoices'))
  total += countRemoteNewerRows(localState.expenses, cleaned.expenses, peek('expenses'))
  total += countExpenseBookedDivergences(localState.expenses, cleaned.expenses, peek('expenses'))
  total += countRemoteNewerRows(localState.deliveries, cleaned.deliveries, peek('deliveries'))
  total += countRemoteNewerRows(localState.events, cleaned.events, peek('events'))
  total += countRemoteNewerRows(localState.stockLog, cleaned.stockLog, peek('stock_activity'))
  total += countRemoteNewerRows(localState.koiFishList, cleaned.koiFishList, peek('koi_fish'))
  total += countKoiStatusDivergences(localState.koiFishList, cleaned.koiFishList, peek('koi_fish'))
  total += countRemoteNewerRows(localState.customerKoiList, cleaned.customerKoiList, peek('customer_koi'))
  total += countRemoteNewerRows(localState.whatsappGroups, cleaned.whatsappGroups, peek('whatsapp_groups'))

  const localPond = localState.pondData
  const remotePond = cleaned.pondData
  if (remotePond && recordTs(remotePond) > recordTs(localPond) + 500) total += 1

  return total
}

/** Minimum ms between scheduled team polls (slightly under the 30s interval). */
export const TEAM_SYNC_POLL_INTERVAL_MS = 30_000

/** Throttle for poll-triggered pulls — allows steady 30s cadence. */
export const TEAM_SYNC_POLL_THROTTLE_MS = 28_000

/** Throttle for visibility / online / reconnect pulls. */
export const TEAM_SYNC_EVENT_THROTTLE_MS = 15_000

/** Skip background polls while the user interacted within this window. */
export const TEAM_SYNC_USER_IDLE_MS = 12_000
