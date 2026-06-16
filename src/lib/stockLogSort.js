/** Extract INV20260615-01 from stock log note text. */
export function invoiceIdFromStockLogNote(note) {
  const match = String(note || '').match(/INV\d{8}-\d+/i)
  return match ? match[0].toUpperCase() : ''
}

/** Manual sell/use/restock ids from genStockLogId() — ms epoch embedded in id. */
const TIMESTAMP_ID_MIN = 1_000_000_000_000
const TIMESTAMP_ID_MAX = 99_999_999_999_999

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

export function isTimestampStockLogId(row) {
  const id = stockLogIdNum(row)
  return id >= TIMESTAMP_ID_MIN && id <= TIMESTAMP_ID_MAX
}

/** Manual rows sort by id (creation time); invoice-linked rows sort by updatedAt. */
export function stockLogRecency(row) {
  if (isTimestampStockLogId(row)) return stockLogIdNum(row)
  return stockLogTime(row) || stockLogIdNum(row)
}

/** Newest action first. */
export function compareStockLogDesc(a, b) {
  const keyCmp = stockLogRecency(b) - stockLogRecency(a)
  if (keyCmp !== 0) return keyCmp
  const invA = invoiceIdFromStockLogNote(a?.note)
  const invB = invoiceIdFromStockLogNote(b?.note)
  if (invA && invB && invA !== invB) {
    const invCmp = invB.localeCompare(invA)
    if (invCmp !== 0) return invCmp
  }
  if (invA && invA === invB) {
    const typeRank = { restock: 3, sell: 2, use: 1 }
    const rankA = typeRank[String(a?.type || '').toLowerCase()] || 0
    const rankB = typeRank[String(b?.type || '').toLowerCase()] || 0
    const rankCmp = rankB - rankA
    if (rankCmp !== 0) return rankCmp
  }
  const idCmp = stockLogIdNum(b) - stockLogIdNum(a)
  if (idCmp !== 0) return idCmp
  return String(b?.id || '').localeCompare(String(a?.id || ''))
}

export function sortStockLog(list = []) {
  return [...list].sort(compareStockLogDesc)
}
