import { KOI_STATUS, normalizeKoiSizeCm, today } from '../data/constants'
import { touchUpdatedAt } from './syncMeta'

function normalizeBigintId(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const SELLABLE_STATUSES = new Set([KOI_STATUS.AVAILABLE, KOI_STATUS.SICK])
const VALID_STATUSES = new Set(Object.values(KOI_STATUS))

export function sameKoiId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

export function canSellKoiStatus(status) {
  return SELLABLE_STATUSES.has(status)
}

export function parseKoiPrice(value, fallback = 0) {
  if (value === '' || value == null) return fallback
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Validate add/edit koi form (not a sale).
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateKoiFormFields(fields) {
  if (!fields.variety?.trim()) {
    return { ok: false, message: 'Select a koi variety.' }
  }
  if (fields.price === '' || fields.price == null) {
    return { ok: false, message: 'Enter a selling price.' }
  }
  const price = parseKoiPrice(fields.price, null)
  if (price == null) {
    return { ok: false, message: 'Selling price must be zero or greater.' }
  }
  if (!fields.pondName?.trim()) {
    return { ok: false, message: 'Select or enter a pond name.' }
  }
  if (fields.size != null && fields.size !== '') {
    const sizeCm = normalizeKoiSizeCm(fields.size)
    if (sizeCm == null) {
      return { ok: false, message: 'Enter a valid size in cm, or leave blank.' }
    }
  }
  return { ok: true }
}

export function normalizeKoiSizeField(value) {
  if (value == null || value === '') return null
  return normalizeKoiSizeCm(value)
}

/** Validate sell-koi modal fields. */
export function validateKoiSaleForm({ customerId, disposition, keepPondName, soldPrice, soldDate, koi }) {
  if (!customerId) {
    return { ok: false, message: 'Select a customer to complete the sale.' }
  }
  if (!canSellKoiStatus(koi?.status)) {
    return { ok: false, message: `${koi?.id || 'This fish'} cannot be sold (status: ${koi?.status || 'unknown'}).` }
  }
  if (hasActiveKeepAtFarmSale(koi)) {
    return { ok: false, message: `${koi?.id || 'This fish'} has an active keep-at-farm sale. Use Reverse keep first.` }
  }
  const price = parseKoiPrice(soldPrice, koi?.price ?? 0)
  if (price == null) {
    return { ok: false, message: 'Sold price must be zero or greater.' }
  }
  if (!soldDate?.trim()) {
    return { ok: false, message: 'Choose the sold date.' }
  }
  if (disposition === 'keep' && !keepPondName?.trim()) {
    return { ok: false, message: 'Select which pond the koi will be kept in.' }
  }
  return { ok: true, soldPrice: price, soldDate: soldDate.trim() }
}

export function buildSoldKoiPatch(koi, { customerId, soldPrice, soldDate, disposition, keepPondName }) {
  const keep = disposition === 'keep'
  const soldTo = normalizeBigintId(customerId) ?? customerId
  const pond = keep ? (keepPondName?.trim() || koi.pondName || '') : koi.pondName
  return touchUpdatedAt({
    ...koi,
    status: keep ? KOI_STATUS.AVAILABLE : KOI_STATUS.SOLD,
    pondName: pond,
    soldTo,
    soldPrice: Number(soldPrice) || Number(koi.price) || 0,
    soldDate: soldDate || today(),
    sellDisposition: disposition || 'taken',
    keepPondName: keep ? pond : null,
  })
}

/** Clear keep-at-farm sale metadata while fish stays in farm stock. */
export function buildKeepAtFarmReversePatch(koi, reason = '') {
  const refundNote = reason.trim()
    ? `Keep-at-farm reversed ${today()}: ${reason.trim()}`
    : `Keep-at-farm reversed ${today()}`
  return touchUpdatedAt({
    ...koi,
    status: KOI_STATUS.AVAILABLE,
    soldTo: null,
    soldPrice: null,
    soldDate: null,
    sellDisposition: null,
    keepPondName: null,
    notes: koi.notes ? `${koi.notes}\n${refundNote}` : refundNote,
  })
}

export function hasActiveKeepAtFarmSale(koi) {
  if (!koi?.soldTo) return false
  if (koi.sellDisposition === 'keep') return true
  return koi.status === KOI_STATUS.AVAILABLE
}

export function buildDeceasedKoiPatch(koi, { deathDate, deathCause, deathPhoto, notes }) {
  return touchUpdatedAt({
    ...koi,
    status: KOI_STATUS.DECEASED,
    deathDate: deathDate || today(),
    deathCause: deathCause || 'Unknown',
    deathPhoto: deathPhoto || null,
    notes: notes?.trim() ? notes.trim() : koi.notes,
    soldTo: null,
    soldDate: null,
    soldPrice: null,
    sellDisposition: null,
    keepPondName: null,
  })
}

export function isValidKoiStatus(status) {
  return VALID_STATUSES.has(status)
}
