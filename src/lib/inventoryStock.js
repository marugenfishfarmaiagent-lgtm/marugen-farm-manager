import { today } from '../data/constants'
import { isStockTracked } from './productCatalog'
import { touchUpdatedAt } from './syncMeta'

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

function aggregateQtyByProduct(items) {
  const qtyByProduct = new Map()
  for (const it of items || []) {
    if (it.productId == null || it.productId === '') continue
    const key = String(it.productId)
    qtyByProduct.set(key, (qtyByProduct.get(key) || 0) + (+it.qty || 0))
  }
  return qtyByProduct
}

export function validateStockForItems(products, items) {
  const qtyByProduct = aggregateQtyByProduct(items)
  for (const [productId, qty] of qtyByProduct) {
    const p = products.find((x) => String(x.id) === productId)
    if (!p) return { ok: false, message: 'One or more invoice products are no longer in inventory.' }
    if (!isStockTracked(p)) continue
    if (qty <= 0) return { ok: false, message: `Invalid quantity for ${p.name}.` }
    if (qty > p.stock) {
      return { ok: false, message: `Not enough ${p.name} in stock (${p.stock} ${p.unit || 'unit'} available, need ${qty}).` }
    }
  }
  return { ok: true }
}

function adjustProductsStock(setProducts, items, deltaSign) {
  const qtyByProduct = aggregateQtyByProduct(items)
  setProducts((prev) => prev.map((p) => {
    if (!isStockTracked(p)) return p
    const qty = qtyByProduct.get(String(p.id))
    if (!qty) return p
    return touchUpdatedAt({ ...p, stock: Math.max(0, p.stock + deltaSign * qty) })
  }))
}

function appendStockLog(setStockLog, entries) {
  if (entries.length) setStockLog((prev) => [...entries, ...prev])
}

function buildLogEntries(items, products, { invoiceId, by, restore }) {
  const qtyByProduct = aggregateQtyByProduct(items)
  return [...qtyByProduct.entries()]
    .map(([productId, qty], i) => {
      const p = products.find((x) => String(x.id) === productId)
      if (p && !isStockTracked(p)) return null
      const line = (items || []).find((it) => String(it.productId) === productId)
      const price = +line?.price || p?.price || 0
      return touchUpdatedAt({
        id: Date.now() + i,
        productId,
        productName: line?.name || p?.name || 'Product',
        type: restore ? 'restock' : 'sell',
        qty,
        ...(restore ? {} : { price, total: qty * price }),
        note: restore ? `Invoice cancelled ${invoiceId}` : `Invoice ${invoiceId}`,
        date: today(),
        by: by || 'Staff',
      })
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
