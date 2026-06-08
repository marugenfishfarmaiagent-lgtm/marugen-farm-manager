import { today } from '../data/constants'
import { isStockTracked } from './productCatalog'

export function serializeInvoiceItem(it) {
  const item = {
    name: it.name,
    qty: +it.qty || 0,
    price: +it.price || 0,
  }
  if (it.productId != null && it.productId !== '') {
    item.productId = it.productId
  }
  if (it.koiId != null && it.koiId !== '') {
    item.koiId = it.koiId
    item.koiDisposition = it.koiDisposition || 'taken'
    if (it.koiDisposition === 'keep' && it.keepPondName) {
      item.keepPondName = it.keepPondName
    }
    if (it.koiAlreadySold) item.koiAlreadySold = true
  }
  return item
}

export function validateStockForItems(products, items) {
  const linked = (items || []).filter((it) => it.productId != null && it.productId !== '')
  for (const it of linked) {
    const p = products.find((x) => String(x.id) === String(it.productId))
    if (!p) return { ok: false, message: `"${it.name}" is no longer in inventory.` }
    if (!isStockTracked(p)) continue
    const qty = +it.qty || 0
    if (qty <= 0) return { ok: false, message: `Invalid quantity for ${it.name}.` }
    if (qty > p.stock) {
      return { ok: false, message: `Not enough ${p.name} in stock (${p.stock} ${p.unit || 'unit'} available, need ${qty}).` }
    }
  }
  return { ok: true }
}

function adjustProductsStock(setProducts, items, deltaSign) {
  setProducts((prev) => prev.map((p) => {
    if (!isStockTracked(p)) return p
    const item = items.find((it) => it.productId != null && String(it.productId) === String(p.id))
    if (!item) return p
    const qty = +item.qty || 0
    return { ...p, stock: Math.max(0, p.stock + deltaSign * qty) }
  }))
}

function appendStockLog(setStockLog, entries) {
  if (entries.length) setStockLog((prev) => [...entries, ...prev])
}

function buildLogEntries(items, products, { invoiceId, by, restore }) {
  return items
    .filter((it) => it.productId != null && it.productId !== '')
    .map((it, i) => {
      const p = products.find((x) => String(x.id) === String(it.productId))
      if (p && !isStockTracked(p)) return null
      const qty = +it.qty || 0
      const price = +it.price || p?.price || 0
      return {
        id: Date.now() + i,
        productId: it.productId,
        productName: it.name || p?.name || 'Product',
        type: restore ? 'restock' : 'sell',
        qty,
        ...(restore ? {} : { price, total: qty * price }),
        note: restore ? `Invoice cancelled ${invoiceId}` : `Invoice ${invoiceId}`,
        date: today(),
        by: by || 'Staff',
      }
    })
    .filter(Boolean)
}

/** Deduct inventory when an invoice with linked products is created. */
export function deductStockForInvoice(setProducts, setStockLog, products, items, { invoiceId, by }) {
  const linked = (items || []).filter((it) => it.productId != null && it.productId !== '')
  if (!linked.length) return { ok: true }
  const check = validateStockForItems(products, linked)
  if (!check.ok) return check
  adjustProductsStock(setProducts, linked, -1)
  appendStockLog(setStockLog, buildLogEntries(linked, products, { invoiceId, by, restore: false }))
  return { ok: true }
}

/** Restore inventory when a pending/overdue invoice is cancelled. */
export function restoreStockForInvoice(setProducts, setStockLog, products, items, { invoiceId, by }) {
  const linked = (items || []).filter((it) => it.productId != null && it.productId !== '')
  if (!linked.length) return { ok: true }
  adjustProductsStock(setProducts, linked, 1)
  appendStockLog(setStockLog, buildLogEntries(linked, products, { invoiceId, by, restore: true }))
  return { ok: true }
}
