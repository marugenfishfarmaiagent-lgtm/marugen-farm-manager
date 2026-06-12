import { KOI_STATUS, formatKoiSize, today } from '../data/constants'
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
      return { ok: false, message: `${koi.id} has an active keep-at-farm sale. Reverse keep or cancel the invoice first.` }
    }
    if ((it.koiDisposition || 'taken') === 'keep' && !(it.keepPondName?.trim())) {
      return { ok: false, message: `Select a pond for ${formatKoiInvoiceLineName(koi)} (keep at farm).` }
    }
  }

  return { ok: true }
}

/** Mark fish stock as sold when an invoice with koi line items is created. */
export function applyInvoiceKoiSales({
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

  koiItems.filter((it) => !it.koiAlreadySold).forEach((it) => {
    const koi = koiList.find((k) => sameKoiId(k.id, it.koiId))
    if (!koi) return
    if ((it.koiDisposition || 'taken') === 'keep') {
      onKoiSold?.(koi, customer, +it.price || koi.price, soldDate, {
        disposition: 'keep',
        keepPondName: it.keepPondName?.trim() || koi.pondName,
      })
    }
  })

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

/** Restore fish stock when an invoice with koi lines is cancelled. */
export function restoreInvoiceKoiSales(items, setKoiList, setCustomerKoiList) {
  const koiItems = (items || []).filter((it) => it.koiId && !it.koiAlreadySold)
  if (!koiItems.length) return

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
  if (setCustomerKoiList) {
    setCustomerKoiList((prev) => {
      const removed = prev.filter((r) => koiItems.some((it) => sameKoiId(it.koiId, r.koiId)))
      removed.forEach((r) => markDeleted('customer_koi', r.id))
      return prev.filter((r) => !koiItems.some((it) => sameKoiId(it.koiId, r.koiId)))
    })
  }
}

export function findLinkedKoiInvoices(invoices, koiId) {
  return (invoices || []).filter((inv) =>
    (inv.items || []).some((it) => sameKoiId(it.koiId, koiId)),
  )
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
