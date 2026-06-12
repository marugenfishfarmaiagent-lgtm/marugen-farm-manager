import { sortInvoices } from './invoiceDesign'
import { KOI_STATUS } from '../data/constants'
import { pickPersistedImageRef } from './farmImage'
import { normalizeReminderRecord } from './pondOps'

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

const PRODUCT_CATALOG_FIELDS = ['name', 'category', 'sku', 'price', 'unit', 'description', 'trackStock', 'minStock']

function productCatalogFieldsDiffer(a, b) {
  return PRODUCT_CATALOG_FIELDS.some((key) => {
    const av = a?.[key]
    const bv = b?.[key]
    if (key === 'price' || key === 'minStock') return Number(av) !== Number(bv)
    if (key === 'trackStock') return Boolean(av) !== Boolean(bv)
    return String(av ?? '') !== String(bv ?? '')
  })
}

/** Prefer local catalog edits during close-timestamp races with stock sync pulls. */
export function resolveProductConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  if (lt >= rt) return local
  if (rt - lt < 5000 && productCatalogFieldsDiffer(local, remote)) {
    return { ...remote, ...pickProductCatalogFields(local), updatedAt: local.updatedAt }
  }
  return remote
}

function pickProductCatalogFields(product) {
  const picked = {}
  for (const key of PRODUCT_CATALOG_FIELDS) {
    if (product?.[key] !== undefined) picked[key] = product[key]
  }
  return picked
}

export function mergeProducts(local = [], remote = [], pendingDeleteIds = []) {
  return mergeRecords(local, remote, pendingDeleteIds, resolveProductConflict)
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

function mergeKoiRow(local, remote) {
  const picked = resolveKoiConflict(local, remote)
  const other = picked === local ? remote : local
  return mergeImageFields(picked, other)
}

function mergeImageFields(picked, other) {
  return {
    ...picked,
    photo: pickPersistedImageRef(picked.photo, other.photo),
    deathPhoto: pickPersistedImageRef(picked.deathPhoto, other.deathPhoto),
  }
}

export function mergeCustomerKoi(local = [], remote = [], pendingDeleteIds = []) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map((local || []).map((r) => [String(r.id), r]))
  const remoteMap = new Map((remote || []).map((r) => [String(r.id), r]))
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()])

  const merged = []
  for (const id of ids) {
    if (delSet.has(id)) continue
    const l = localMap.get(id)
    const r = remoteMap.get(id)
    if (l && r) {
      const picked = ts(l) >= ts(r) ? l : r
      const other = picked === l ? r : l
      merged.push(mergeImageFields(picked, other))
    } else {
      merged.push(l || r)
    }
  }
  return merged
}

export function mergeKoiFish(local = [], remote = [], pendingDeleteIds = []) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map((local || []).map((r) => [String(r.id), r]))
  const remoteMap = new Map((remote || []).map((r) => [String(r.id), r]))
  const ids = new Set([...localMap.keys(), ...remoteMap.keys()])

  const merged = []
  for (const id of ids) {
    if (delSet.has(id)) continue
    const l = localMap.get(id)
    const r = remoteMap.get(id)
    if (l && r) merged.push(mergeKoiRow(l, r))
    else merged.push(l || r)
  }
  return merged
}

function reminderIsDone(row) {
  if (!row) return false
  return String(row.status || 'pending').toLowerCase() === 'done'
}

function mergePondRecords(local = [], remote = [], { preferDone = false } = {}) {
  const map = new Map()
  const pick = (a, b) => {
    if (preferDone) {
      const aDone = reminderIsDone(a)
      const bDone = reminderIsDone(b)
      if (aDone && !bDone) return a
      if (bDone && !aDone) return b
    }
    return ts(a) >= ts(b) ? a : b
  }

  for (const row of remote || []) {
    if (row?.id == null) continue
    map.set(String(row.id), row)
  }
  for (const row of local || []) {
    if (row?.id == null) continue
    const id = String(row.id)
    const existing = map.get(id)
    map.set(id, existing ? pick(row, existing) : row)
  }
  const merged = [...map.values()]
  return preferDone ? merged.map(normalizeReminderRecord) : merged
}

/** Merge pond blob field-by-field so reminder "done" and log edits are not wiped by cloud pull. */
export function mergePondData(local, remote) {
  if (!remote || typeof remote !== 'object') return local
  if (!local || typeof local !== 'object') return remote
  const localNewer = ts(local) >= ts(remote)
  const mergedReminders = mergePondRecords(local.reminders, remote.reminders, { preferDone: true })
  const localDoneWins = (local.reminders || []).some((row) => {
    const remoteRow = (remote.reminders || []).find((r) => String(r.id) === String(row.id))
    return reminderIsDone(row) && !reminderIsDone(remoteRow)
  })
  return {
    ...(localNewer ? local : remote),
    ponds: mergePondRecords(local.ponds, remote.ponds),
    maintenanceLogs: mergePondRecords(local.maintenanceLogs, remote.maintenanceLogs),
    treatmentLogs: mergePondRecords(local.treatmentLogs, remote.treatmentLogs),
    reminders: mergedReminders,
    treatmentGuides: mergePondRecords(local.treatmentGuides, remote.treatmentGuides),
    updatedAt: localDoneWins || localNewer ? local.updatedAt : remote.updatedAt,
  }
}
