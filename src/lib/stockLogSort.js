/** Extract INV20260615-01 from stock log note text. */
export function invoiceIdFromStockLogNote(note) {
  const match = String(note || '').match(/INV\d{8}-\d+/i)
  return match ? match[0].toUpperCase() : ''
}

const STOCK_LOG_TYPE_RANK = { sell: 2, use: 1, restock: 0 }

/** Newest-first: date, invoice id, then sell/use before restock for the same invoice. */
export function compareStockLogDesc(a, b) {
  const dateCmp = String(b?.date || '').localeCompare(String(a?.date || ''))
  if (dateCmp !== 0) return dateCmp
  const invCmp = invoiceIdFromStockLogNote(b?.note).localeCompare(invoiceIdFromStockLogNote(a?.note))
  if (invCmp !== 0) return invCmp
  const typeCmp = (STOCK_LOG_TYPE_RANK[b?.type] ?? 0) - (STOCK_LOG_TYPE_RANK[a?.type] ?? 0)
  if (typeCmp !== 0) return typeCmp
  return String(b?.id || '').localeCompare(String(a?.id || ''))
}

export function sortStockLog(list = []) {
  return [...list].sort(compareStockLogDesc)
}
