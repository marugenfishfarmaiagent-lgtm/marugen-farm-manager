/** Extract INV20260615-01 from stock log note text. */
export function invoiceIdFromStockLogNote(note) {
  const match = String(note || '').match(/INV\d{8}-\d+/i)
  return match ? match[0].toUpperCase() : ''
}

function stockLogTime(row) {
  const raw = row?.updatedAt ?? row?.updated_at
  if (!raw) return 0
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : 0
}

function stockLogIdNum(row) {
  const n = Number(row?.id)
  return Number.isFinite(n) ? n : 0
}

/** Newest action first — by updatedAt, then numeric id. */
export function compareStockLogDesc(a, b) {
  const timeCmp = stockLogTime(b) - stockLogTime(a)
  if (timeCmp !== 0) return timeCmp
  const idCmp = stockLogIdNum(b) - stockLogIdNum(a)
  if (idCmp !== 0) return idCmp
  return String(b?.id || '').localeCompare(String(a?.id || ''))
}

export function sortStockLog(list = []) {
  return [...list].sort(compareStockLogDesc)
}
