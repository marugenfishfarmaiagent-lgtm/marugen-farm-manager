import { today } from '../data/constants'
import { isStockTracked } from './productCatalog'
import { genInvoiceStockLogId, genStockLogId, sameProductId } from './inventoryOps'
import { touchUpdatedAt } from './syncMeta'

export function serializeInvoiceItem(it) {
  const normalized = normalizeInvoiceItemRef(it)
  const item = {
    name: normalized.name,
    qty: +normalized.qty || 0,
    price: +normalized.price || 0,
  }
  if (normalized.productId != null && normalized.productId !== '') {
    item.productId = normalized.productId
  }
  if (normalized.koiId != null && normalized.koiId !== '') {
    item.koiId = normalized.koiId
    item.koiDisposition = normalized.koiDisposition || 'taken'
    if (normalized.koiDisposition === 'keep' && normalized.keepPondName) {
      item.keepPondName = normalized.keepPondName
    }
    if (normalized.koiAlreadySold) item.koiAlreadySold = true
  }
  return item
}

export function normalizeInvoiceItemRef(it) {
  if (!it || typeof it !== 'object') return it
  const productId = it.productId ?? it.product_id
  const koiId = it.koiId ?? it.koi_id
  const next = { ...it }
  if (productId != null && productId !== '') next.productId = productId
  else delete next.productId
  if (koiId != null && koiId !== '') next.koiId = koiId
  else delete next.koiId
  delete next.product_id
  delete next.koi_id
  return next
}

function aggregateQtyByProduct(items) {
  const qtyByProduct = new Map()
  for (const raw of items || []) {
    const it = normalizeInvoiceItemRef(raw)
    if (it.productId == null || it.productId === '') continue
    const key = String(it.productId)
    qtyByProduct.set(key, (qtyByProduct.get(key) || 0) + (+it.qty || 0))
  }
  return qtyByProduct
}

export function validateStockForItems(products, items) {
  const qtyByProduct = aggregateQtyByProduct(items)
  for (const [productId, qty] of qtyByProduct) {
    const p = products.find((x) => sameProductId(x.id, productId))
    if (!p) return { ok: false, message: 'One or more invoice products are no longer in inventory.' }
    if (!isStockTracked(p)) continue
    if (qty <= 0) return { ok: false, message: `Invalid quantity for ${p.name}.` }
    const available = Number(p.stock) || 0
    if (qty > available) {
      return { ok: false, message: `Not enough ${p.name} in stock (${available} ${p.unit || 'unit'} available, need ${qty}).` }
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
    const stock = Number(p.stock) || 0
    return touchUpdatedAt({ ...p, stock: Math.max(0, stock + deltaSign * qty) })
  }))
}

function appendStockLog(setStockLog, entries) {
  if (entries.length) setStockLog((prev) => [...entries, ...prev])
}

function buildLogEntries(items, products, { invoiceId, by, restore }) {
  const qtyByProduct = aggregateQtyByProduct(items)
  return [...qtyByProduct.entries()]
    .map(([productId, qty]) => {
      const p = products.find((x) => sameProductId(x.id, productId))
      if (p && !isStockTracked(p)) return null
      const line = (items || []).find((it) => sameProductId(normalizeInvoiceItemRef(it).productId, productId))
      const price = +line?.price || Number(p?.price) || 0
      return touchUpdatedAt({
        id: invoiceId
          ? genInvoiceStockLogId(invoiceId, productId, restore ? 'restock' : 'sell')
          : genStockLogId(),
        productId: p?.id ?? productId,
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

function applyStockAdjust(products, items, deltaSign) {
  const qtyByProduct = aggregateQtyByProduct(items)
  return products.map((p) => {
    if (!isStockTracked(p)) return p
    const qty = qtyByProduct.get(String(p.id))
    if (!qty) return p
    const stock = Number(p.stock) || 0
    return touchUpdatedAt({ ...p, stock: Math.max(0, stock + deltaSign * qty) })
  })
}

export function previewDeductStockForInvoice(products, stockLog, items, { invoiceId, by }) {
  const linked = (items || []).filter((it) => it.productId != null && it.productId !== '')
  if (!linked.length) {
    return { ok: true, hasStockLines: false, nextProducts: products, nextStockLog: stockLog }
  }
  const check = validateStockForItems(products, linked)
  if (!check.ok) {
    return { ok: false, message: check.message, hasStockLines: true, nextProducts: products, nextStockLog: stockLog }
  }
  const nextProducts = applyStockAdjust(products, linked, -1)
  const entries = buildLogEntries(linked, products, { invoiceId, by, restore: false })
  const nextStockLog = entries.length ? [...entries, ...stockLog] : stockLog
  return { ok: true, hasStockLines: true, nextProducts, nextStockLog }
}

export function previewRestoreStockForInvoice(products, stockLog, items, { invoiceId, by }) {
  const linked = (items || []).filter((it) => it.productId != null && it.productId !== '')
  if (!linked.length) {
    return { ok: true, hasStockLines: false, nextProducts: products, nextStockLog: stockLog }
  }
  const nextProducts = applyStockAdjust(products, linked, 1)
  const entries = buildLogEntries(linked, products, { invoiceId, by, restore: true })
  const nextStockLog = entries.length ? [...entries, ...stockLog] : stockLog
  return { ok: true, hasStockLines: true, nextProducts, nextStockLog }
}

/** Apply a stock preview without regenerating log entry ids. */
export function applyStockPreview(setProducts, setStockLog, preview) {
  if (!preview?.ok) return preview
  if (preview.hasStockLines) {
    setProducts(preview.nextProducts)
    setStockLog(preview.nextStockLog)
  }
  return { ok: true }
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
