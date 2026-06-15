import { sortInvoices } from './invoiceDesign'
import { CUSTOMER_KOI_STATUS, KOI_STATUS } from '../data/constants'
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

/** Prefer manual calendar rows over pond-linked duplicates when timestamps tie. */
export function resolveEventConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  const localManual = !String(local?.pondReminderId || '').trim()
  const remoteManual = !String(remote?.pondReminderId || '').trim()
  if (localManual && !remoteManual) return local
  if (remoteManual && !localManual) return remote
  if (lt !== rt) return lt > rt ? local : remote
  return local
}

/** Prefer booked when timestamps tie — avoids cloud pull reverting a just-marked receipt. */
export function resolveExpenseConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  if (local?.booked && !remote?.booked) return local
  if (remote?.booked && !local?.booked) return remote
  if (lt !== rt) return lt > rt ? local : remote
  return local
}

function bookedTs(record) {
  if (!record?.bookedAt) return 0
  return ts({ updatedAt: record.bookedAt })
}

function terminalInvoiceRank(status) {
  const s = String(status || 'pending').toLowerCase()
  if (s === 'cancelled') return 2
  if (s === 'paid') return 1
  return 0
}

/** Prefer paid/cancelled when timestamps tie — cancelled beats paid (refund credit notes). */
export function resolveInvoiceConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  const ls = local?.status || 'pending'
  const rs = remote?.status || 'pending'
  if (isTerminalInvoiceStatus(ls) && !isTerminalInvoiceStatus(rs)) return local
  if (isTerminalInvoiceStatus(rs) && !isTerminalInvoiceStatus(ls)) return remote

  const lr = terminalInvoiceRank(ls)
  const rr = terminalInvoiceRank(rs)
  if (lr !== rr) return lr > rr ? local : remote

  const base = lt !== rt ? (lt > rt ? local : remote) : local

  if (Boolean(remote?.booked) === Boolean(local?.booked)) return base

  const lbt = bookedTs(local)
  const rbt = bookedTs(remote)
  if (lbt !== rbt) {
    const bookedSource = lbt > rbt ? local : remote
    return {
      ...base,
      booked: !!bookedSource.booked,
      bookedAt: bookedSource.bookedAt ?? null,
      bookedBy: bookedSource.bookedBy ?? '',
    }
  }

  if (remote?.booked) {
    return {
      ...base,
      booked: true,
      bookedAt: remote.bookedAt ?? null,
      bookedBy: remote.bookedBy ?? '',
    }
  }
  if (local?.booked) {
    return {
      ...base,
      booked: true,
      bookedAt: local.bookedAt ?? null,
      bookedBy: local.bookedBy ?? '',
    }
  }
  if (rt >= lt) {
    return { ...base, booked: false, bookedAt: null, bookedBy: '' }
  }
  return base
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

const TERMINAL_CUSTOMER_KOI_STATUSES = new Set([
  CUSTOMER_KOI_STATUS.COLLECTED,
  CUSTOMER_KOI_STATUS.DECEASED,
])

const CUSTOMER_KOI_EDIT_FIELDS = [
  'fishName', 'variety', 'size', 'pondName', 'purchasePrice', 'purchaseDate', 'notes', 'koiId',
  'customerId', 'customerName', 'collectedDate',
]

function customerKoiEditFieldsDiffer(a, b) {
  return CUSTOMER_KOI_EDIT_FIELDS.some((key) => {
    const av = a?.[key]
    const bv = b?.[key]
    if (key === 'purchasePrice' || key === 'size') return Number(av) !== Number(bv)
    return String(av ?? '') !== String(bv ?? '')
  })
}

function pickCustomerKoiEditFields(record) {
  const picked = {}
  for (const key of CUSTOMER_KOI_EDIT_FIELDS) {
    if (record?.[key] !== undefined) picked[key] = record[key]
  }
  return picked
}

/** Prefer taken-away / deceased over in-pond when cloud pull races a fresh status change. */
export function resolveCustomerKoiConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  const ls = local?.status || CUSTOMER_KOI_STATUS.IN_POND
  const rs = remote?.status || CUSTOMER_KOI_STATUS.IN_POND
  if (TERMINAL_CUSTOMER_KOI_STATUSES.has(ls) && rs === CUSTOMER_KOI_STATUS.IN_POND) return local
  if (TERMINAL_CUSTOMER_KOI_STATUSES.has(rs) && ls === CUSTOMER_KOI_STATUS.IN_POND) return remote
  if (lt >= rt) return local
  if (rt - lt < 5000 && ls !== rs) {
    return {
      ...remote,
      status: local.status,
      collectedDate: local.collectedDate,
      deathDate: local.deathDate,
      deathCause: local.deathCause,
      deathNotes: local.deathNotes,
      deathPhoto: local.deathPhoto,
      pondName: local.pondName,
      updatedAt: local.updatedAt,
    }
  }
  if (rt - lt < 15000 && customerKoiEditFieldsDiffer(local, remote)) {
    return { ...remote, ...pickCustomerKoiEditFields(local), updatedAt: local.updatedAt }
  }
  return remote
}

function mergeCustomerKoiRow(local, remote) {
  const picked = resolveCustomerKoiConflict(local, remote)
  const other = picked === local ? remote : local
  return mergeImageFields(picked, other)
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
    if (l && r) merged.push(mergeCustomerKoiRow(l, r))
    else merged.push(l || r)
  }
  return merged
}

export function mergeKoiFish(local = [], remote = [], pendingDeleteIds = []) {
  const delSet = new Set((pendingDeleteIds || []).map(String))
  const localMap = new Map()
  for (const row of local || []) {
    if (row?.id == null) continue
    const id = String(row.id)
    if (delSet.has(id)) continue
    const existing = localMap.get(id)
    if (!existing || ts(row) >= ts(existing)) localMap.set(id, row)
  }
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

const POND_RECORD_MERGE_GRACE_MS = 15000

function mergePondRecords(local = [], remote = [], { preferDone = false } = {}) {
  const map = new Map()
  const pick = (a, b) => {
    if (!a) return b
    if (!b) return a
    if (preferDone) {
      const aDone = reminderIsDone(a)
      const bDone = reminderIsDone(b)
      if (aDone && !bDone) return a
      if (bDone && !aDone) return b
    }
    const lt = ts(a)
    const rt = ts(b)
    if (lt >= rt) return a
    if (rt - lt < POND_RECORD_MERGE_GRACE_MS) return a
    return b
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
