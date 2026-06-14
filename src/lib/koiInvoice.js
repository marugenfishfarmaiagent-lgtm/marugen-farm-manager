import { KOI_STATUS, formatKoiSize, getInvoiceStatus, today } from '../data/constants'
import { buildSoldKoiPatch, canSellKoiStatus, hasActiveKeepAtFarmSale, sameKoiId } from './koiOps'
import { touchUpdatedAt } from './syncMeta'
import { markDeleted } from './syncDeletions'

export function formatKoiInvoiceLineName(koi) {
  const label = koi.name?.trim() || koi.variety
  const size = koi.size != null && koi.size !== '' ? ` · ${formatKoiSize(koi.size)}` : ''
  return `${label}${size} (${koi.id})`
}

export function availableKoiForInvoice(koiList, excludeIds = []) {
  const exclude = new Set(excludeIds.map(String))
  return koiList.filter(
    (k) => [KOI_STATUS.AVAILABLE, KOI_STATUS.SICK].includes(k.status) && !exclude.has(String(k.id)),
  )
}

export function validateInvoiceKoiSales({ items, koiList, customerId, customers }) {
  const koiItems = (items || []).filter((it) => it.koiId && !it.koiAlreadySold)
  if (!koiItems.length) return { ok: true }

  if (!customerId || customerId === '') {
    return { ok: false, message: 'Select a registered customer for fish stock invoice lines.' }
  }
  if (!customers.find((c) => String(c.id) === String(customerId))) {
    return { ok: false, message: 'Selected customer is no longer in the list.' }
  }

  for (const it of koiItems) {
    const koi = koiList.find((k) => sameKoiId(k.id, it.koiId))
    if (!koi) return { ok: false, message: `Koi ${it.koiId} is no longer in stock.` }
    if (!canSellKoiStatus(koi.status)) {
      return { ok: false, message: `${koi.id} is not available (${koi.status}).` }
    }
    if (hasActiveKeepAtFarmSale(koi)) {
      return { ok: false, message: `${koi.id} is already sold (keep at farm). Refund the sale first.` }
    }
    if ((it.koiDisposition || 'taken') === 'keep' && !(it.keepPondName?.trim())) {
      return { ok: false, message: `Select a pond for ${formatKoiInvoiceLineName(koi)} (keep at farm).` }
    }
  }

  return { ok: true }
}

/** Mark fish stock as sold when an invoice with koi line items is created. */
export async function applyInvoiceKoiSales({
  items, koiList, setKoiList, customerId, customers, soldDate, onKoiSold, addNotification,
}) {
  const koiItems = (items || []).filter((it) => it.koiId)
  if (!koiItems.length) return { ok: true }

  const check = validateInvoiceKoiSales({ items: koiItems, koiList, customerId, customers })
  if (!check.ok) return check

  const customer = customers.find((c) => String(c.id) === String(customerId))

  const soldIds = new Set(
    koiItems.filter((it) => !it.koiAlreadySold).map((it) => String(it.koiId)),
  )

  setKoiList((prev) => prev.map((k) => {
    const it = koiItems.find((i) => sameKoiId(i.koiId, k.id))
    if (!it || it.koiAlreadySold || !soldIds.has(String(k.id))) return k
    const disposition = it.koiDisposition || 'taken'
    return buildSoldKoiPatch(k, {
      customerId,
      soldPrice: Number(it.price) || k.price,
      soldDate,
      disposition,
      keepPondName: it.keepPondName,
    })
  }))

  for (const it of koiItems.filter((item) => !item.koiAlreadySold)) {
    const koi = koiList.find((k) => sameKoiId(k.id, it.koiId))
    if (!koi) continue
    if ((it.koiDisposition || 'taken') === 'keep') {
      await onKoiSold?.(koi, customer, +it.price || koi.price, soldDate, {
        disposition: 'keep',
        keepPondName: it.keepPondName?.trim() || koi.pondName,
      })
    }
  }

  const soldCount = koiItems.filter((it) => !it.koiAlreadySold).length
  if (soldCount > 0) {
    addNotification({
      type: 'info',
      title: 'Koi Marked Sold',
      message: `${soldCount} fish updated in Koi Fish stock.`,
    })
  }

  return { ok: true }
}

export function previewApplyInvoiceKoiSales({ items, koiList, customerId, customers, soldDate }) {
  const koiItems = (items || []).filter((it) => it.koiId && !it.koiAlreadySold)
  if (!koiItems.length) {
    return { ok: true, hasKoiLines: false, nextKoiList: koiList }
  }

  const check = validateInvoiceKoiSales({ items: koiItems, koiList, customerId, customers })
  if (!check.ok) return { ...check, hasKoiLines: true, nextKoiList: koiList }

  const soldIds = new Set(koiItems.map((it) => String(it.koiId)))
  const nextKoiList = koiList.map((k) => {
    const it = koiItems.find((i) => sameKoiId(i.koiId, k.id))
    if (!it || !soldIds.has(String(k.id))) return k
    return buildSoldKoiPatch(k, {
      customerId,
      soldPrice: Number(it.price) || k.price,
      soldDate,
      disposition: it.koiDisposition || 'taken',
      keepPondName: it.keepPondName,
    })
  })

  return { ok: true, hasKoiLines: true, nextKoiList }
}

export function previewRestoreInvoiceKoiSales(items, koiList, customerKoiList) {
  const koiItems = (items || []).filter((it) => it.koiId && !it.koiAlreadySold)
  if (!koiItems.length) {
    return { nextKoiList: koiList, nextCustomerKoiList: customerKoiList, removedCustomerKoiIds: [] }
  }

  const ids = new Set(koiItems.map((it) => String(it.koiId)))
  const nextKoiList = koiList.map((k) => {
    if (!ids.has(String(k.id))) return k
    return touchUpdatedAt({
      ...k,
      status: KOI_STATUS.AVAILABLE,
      soldTo: null,
      soldPrice: null,
      soldDate: null,
      sellDisposition: null,
      keepPondName: null,
    })
  })

  const removed = customerKoiList.filter((r) => koiItems.some((it) => sameKoiId(it.koiId, r.koiId)))
  const removedCustomerKoiIds = removed.map((r) => r.id)
  const removedIdSet = new Set(removedCustomerKoiIds.map(String))
  const nextCustomerKoiList = customerKoiList.filter((r) => !removedIdSet.has(String(r.id)))

  return { nextKoiList, nextCustomerKoiList, removedCustomerKoiIds }
}

/** Restore fish stock when an invoice with koi lines is cancelled. Returns removed Customer Koi record ids (for rollback). */
export function restoreInvoiceKoiSales(items, setKoiList, setCustomerKoiList, options = {}) {
  const koiItems = (items || []).filter((it) => it.koiId && !it.koiAlreadySold)
  if (!koiItems.length) return []

  const { koiList, customerKoiList } = options
  if (Array.isArray(koiList) && Array.isArray(customerKoiList)) {
    const preview = previewRestoreInvoiceKoiSales(items, koiList, customerKoiList)
    preview.removedCustomerKoiIds.forEach((id) => markDeleted('customer_koi', id))
    setKoiList(preview.nextKoiList)
    setCustomerKoiList(preview.nextCustomerKoiList)
    return preview.removedCustomerKoiIds
  }

  const ids = new Set(koiItems.map((it) => String(it.koiId)))
  setKoiList((prev) => prev.map((k) => {
    if (!ids.has(String(k.id))) return k
    return touchUpdatedAt({
      ...k,
      status: KOI_STATUS.AVAILABLE,
      soldTo: null,
      soldPrice: null,
      soldDate: null,
      sellDisposition: null,
      keepPondName: null,
    })
  }))

  if (!setCustomerKoiList) return []

  let removedIds = []
  setCustomerKoiList((prev) => {
    const removed = prev.filter((r) => koiItems.some((it) => sameKoiId(it.koiId, r.koiId)))
    removed.forEach((r) => markDeleted('customer_koi', r.id))
    removedIds = removed.map((r) => r.id)
    return prev.filter((r) => !koiItems.some((it) => sameKoiId(it.koiId, r.koiId)))
  })
  return removedIds
}

export function findLinkedKoiInvoices(invoices, koiId) {
  return (invoices || []).filter((inv) =>
    (inv.items || []).some((it) => sameKoiId(it.koiId, koiId)),
  )
}

export function isRefundCreditNoteInvoice(inv) {
  return getInvoiceStatus(inv) === 'cancelled' && /credit note/i.test(String(inv.notes || ''))
}

/** Fish with sale metadata must stay in sold status (fixes legacy keep-at-farm rows). */
export function normalizeSoldKoiRecords(koiList) {
  if (!Array.isArray(koiList)) return koiList
  return koiList.map((k) => {
    if (k.status === KOI_STATUS.DECEASED) return k
    if (k.soldTo && k.status !== KOI_STATUS.SOLD) {
      return touchUpdatedAt({ ...k, status: KOI_STATUS.SOLD })
    }
    return k
  })
}

/** Ensure fish on active invoices show as sold after cloud pull or cross-device sync. */
export function reconcileKoiSoldFromInvoices(koiList, invoices) {
  const normalized = normalizeSoldKoiRecords(koiList)
  if (!Array.isArray(normalized) || !Array.isArray(invoices) || !invoices.length) return normalized

  const saleByKoiId = new Map()
  for (const inv of invoices) {
    if (getInvoiceStatus(inv) === 'cancelled') continue
    const customerId = inv.customerId
    if (customerId == null || customerId === '') continue
    for (const raw of inv.items || []) {
      if (!raw || typeof raw !== 'object') continue
      const koiId = raw.koiId ?? raw.koi_id
      if (!koiId || raw.koiAlreadySold) continue
      saleByKoiId.set(String(koiId), {
        customerId,
        soldPrice: Number(raw.price) || 0,
        soldDate: inv.date || today(),
        disposition: raw.koiDisposition || 'taken',
        keepPondName: raw.keepPondName,
      })
    }
  }
  if (!saleByKoiId.size) return normalized

  return normalized.map((k) => {
    const sale = saleByKoiId.get(String(k.id))
    if (!sale) return k
    if (k.status === KOI_STATUS.DECEASED) return k
    if (k.status === KOI_STATUS.SOLD && k.soldTo) return k
    return buildSoldKoiPatch(k, sale)
  })
}

export function buildKoiRefundUpdate(koi, reason = '') {
  const refundNote = reason.trim()
    ? `Refund ${today()}: ${reason.trim()}`
    : `Refund ${today()}`
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
