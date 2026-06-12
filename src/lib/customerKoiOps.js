import { CUSTOMER_KOI_STATUS, normalizeKoiSizeCm, today } from '../data/constants'
import { sameKoiId } from './koiOps'
import { touchUpdatedAt } from './syncMeta'

const VALID_STATUSES = new Set(Object.values(CUSTOMER_KOI_STATUS))

export function sameRecordId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function parsePurchasePrice(value) {
  if (value === '' || value == null) return 0
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function findActiveCustomerKoiByKoiId(records, koiId, excludeRecordId = null) {
  if (!koiId) return null
  return (records || []).find((r) =>
    sameKoiId(r.koiId, koiId)
    && r.status !== CUSTOMER_KOI_STATUS.DECEASED
    && !sameRecordId(r.id, excludeRecordId),
  )
}

/**
 * @returns {{ ok: true, purchasePrice: number } | { ok: false, message: string }}
 */
export function validateCustomerKoiFields(fields, { requireCustomer = true } = {}) {
  if (requireCustomer && !fields.customerId) {
    return { ok: false, message: 'Select a customer.' }
  }
  if (!fields.variety?.trim()) {
    return { ok: false, message: 'Select a koi variety.' }
  }
  if (fields.size != null && fields.size !== '') {
    const sizeCm = normalizeKoiSizeCm(fields.size)
    if (sizeCm == null) {
      return { ok: false, message: 'Enter a valid size in cm, or leave blank.' }
    }
  }
  const price = parsePurchasePrice(fields.purchasePrice)
  if (price == null) {
    return { ok: false, message: 'Sale price must be zero or greater.' }
  }
  if (!fields.purchaseDate?.trim()) {
    return { ok: false, message: 'Choose the purchase / sold date.' }
  }
  if (fields.status === CUSTOMER_KOI_STATUS.IN_POND && !fields.pondName?.trim()) {
    return { ok: false, message: 'Enter which pond the koi is in.' }
  }
  if (fields.status === CUSTOMER_KOI_STATUS.COLLECTED) {
    const collected = String(fields.collectedDate || today()).trim()
    if (!collected) {
      return { ok: false, message: 'Choose the taken away date.' }
    }
  }
  return { ok: true, purchasePrice: price }
}

export function validateKoiLinkForCustomer({
  koiId, customerId, farmKoiList, records, excludeRecordId,
}) {
  if (!koiId) return { ok: true }
  const duplicate = findActiveCustomerKoiByKoiId(records, koiId, excludeRecordId)
  if (duplicate) {
    return { ok: false, message: `${koiId} is already tracked for ${duplicate.customerName}.` }
  }
  const farmKoi = (farmKoiList || []).find((k) => sameKoiId(k.id, koiId))
  if (farmKoi?.soldTo != null && customerId && !sameRecordId(farmKoi.soldTo, customerId)) {
    return {
      ok: false,
      message: `${koiId} was sold to a different customer. Select the correct buyer or clear the Koi Code link.`,
      farmKoi,
    }
  }
  return { ok: true, farmKoi }
}

export function normalizeCustomerKoiSizeField(value) {
  if (value == null || value === '') return null
  return normalizeKoiSizeCm(value)
}

export function buildCollectedCustomerKoiPatch(record, collectedDate) {
  const date = collectedDate?.trim() || today()
  return touchUpdatedAt({
    ...record,
    status: CUSTOMER_KOI_STATUS.COLLECTED,
    collectedDate: date,
  })
}

export function buildCustomerKoiDeathPatch(record, { deathDate, deathCause, deathPhoto, deathNotes }) {
  return touchUpdatedAt({
    ...record,
    status: CUSTOMER_KOI_STATUS.DECEASED,
    deathDate: deathDate?.trim() || today(),
    deathCause: deathCause || 'Unknown',
    deathPhoto: deathPhoto || null,
    deathNotes: deathNotes?.trim() || '',
    collectedDate: null,
  })
}

export function isValidCustomerKoiStatus(status) {
  return VALID_STATUSES.has(status)
}

/** Active customer-koi rows linked to a farm koi (for keep-at-farm refund path). */
export function getLinkedCustomerKoiForRefund(records, koiId) {
  if (!koiId) return []
  return (records || []).filter(
    (r) => sameKoiId(r.koiId, koiId) && r.status !== CUSTOMER_KOI_STATUS.DECEASED,
  )
}

export function hasLinkedCustomerKoiForRefund(records, koiId) {
  return getLinkedCustomerKoiForRefund(records, koiId).length > 0
}
