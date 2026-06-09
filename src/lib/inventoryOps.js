import { today, getInvoiceStatus } from '../data/constants'
import { touchUpdatedAt } from './syncMeta'

/** Numeric id for stock_activity (Postgres BIGINT). */
export function genStockLogId() {
  return Date.now() + Math.floor(Math.random() * 10000)
}

export function sameProductId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

export function parseStockQty(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Validate product form fields before add/edit.
 * @returns {{ ok: true, catalogOnly: boolean } | { ok: false, message: string }}
 */
export function validateProductFields(fields, { catalogOnly = false } = {}) {
  const name = String(fields.name ?? '').trim()
  if (!name) {
    return { ok: false, message: 'Enter product name.' }
  }
  if (fields.price === '' || fields.price == null) {
    return { ok: false, message: 'Enter selling price.' }
  }
  const price = Number(fields.price)
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, message: 'Price must be zero or greater.' }
  }
  if (!catalogOnly) {
    if (fields.stock === '' || fields.stock == null) {
      return { ok: false, message: 'Enter opening stock for inventory items.' }
    }
    const stock = Number(fields.stock)
    if (!Number.isFinite(stock) || stock < 0) {
      return { ok: false, message: 'Stock cannot be negative.' }
    }
    const minStock = fields.minStock === '' || fields.minStock == null ? 0 : Number(fields.minStock)
    if (!Number.isFinite(minStock) || minStock < 0) {
      return { ok: false, message: 'Min stock alert cannot be negative.' }
    }
  }
  return { ok: true, catalogOnly }
}

/** Normalize numeric product fields after validation. */
export function normalizeProductRecord(raw, { catalogOnly = false } = {}) {
  return {
    ...raw,
    name: String(raw.name ?? '').trim(),
    price: Number(raw.price) || 0,
    stock: catalogOnly ? 0 : Number(raw.stock) || 0,
    minStock: catalogOnly ? 0 : Number(raw.minStock) || 0,
    trackStock: !catalogOnly,
    sku: String(raw.sku ?? '').trim(),
    description: String(raw.description ?? '').trim(),
    unit: String(raw.unit ?? 'unit').trim() || 'unit',
  }
}

export function buildStockLogEntry(product, type, { qty, price, total, note, by } = {}) {
  const entry = touchUpdatedAt({
    id: genStockLogId(),
    productId: product.id,
    productName: product.name,
    type,
    qty: parseStockQty(qty),
    date: today(),
    by: by || 'Staff',
    note: note || '',
  })
  if (price != null) entry.price = Number(price) || 0
  if (total != null) entry.total = Number(total) || 0
  else if (entry.price != null && entry.qty) entry.total = entry.price * entry.qty
  return entry
}

/** True when product appears on a non-cancelled invoice. */
export function isProductOnActiveInvoice(productId, invoices = []) {
  return (invoices || []).some((inv) => {
    if (getInvoiceStatus(inv) === 'cancelled') return false
    return (inv.items || []).some((it) => sameProductId(it.productId ?? it.product_id, productId))
  })
}

export function adjustProductStockInList(products, productId, delta) {
  const d = Number(delta) || 0
  if (!d) return products
  return products.map((p) => (
    sameProductId(p.id, productId)
      ? touchUpdatedAt({ ...p, stock: Math.max(0, (Number(p.stock) || 0) + d) })
      : p
  ))
}
