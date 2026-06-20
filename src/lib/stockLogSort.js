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

/** Newest action first.
 *
 * Sort order:
 * 1. Transaction date (date field, YYYY-MM-DD) — a June-20 row always beats June-16
 *    regardless of which row's updatedAt is newer.
 * 2. Same date → precise time: timestamp-ID rows use their ID (ms creation clock);
 *    DB rows use updatedAt.
 * 3. Invoice-level tiebreak for rows with the same invoice note.
 */
export function compareStockLogDesc(a, b) {
  // Primary: transaction date
  const dayA = String(a?.date || '').slice(0, 10)
  const dayB = String(b?.date || '').slice(0, 10)
  if (dayA && dayB && dayA !== dayB) return dayB.localeCompare(dayA)

  // Same day (or missing date) → precise time
  const aIsTs = isTimestampStockLogId(a)
  const bIsTs = isTimestampStockLogId(b)
  const timeA = aIsTs ? stockLogIdNum(a) : stockLogTime(a) || stockLogIdNum(a)
  const timeB = bIsTs ? stockLogIdNum(b) : stockLogTime(b) || stockLogIdNum(b)
  const timeCmp = timeB - timeA
  if (timeCmp !== 0) return timeCmp

  // Invoice tiebreak: newer invoice number first, then restock before sell before use
  const invA = invoiceIdFromStockLogNote(a?.note)
  const invB = invoiceIdFromStockLogNote(b?.note)
  if (invA && invB && invA !== invB) return invB.localeCompare(invA)
  if (invA && invA === invB) {
    const typeRank = { restock: 3, sell: 2, use: 1 }
    const rankCmp = (typeRank[String(b?.type || '').toLowerCase()] || 0) -
                    (typeRank[String(a?.type || '').toLowerCase()] || 0)
    if (rankCmp !== 0) return rankCmp
  }

  return stockLogIdNum(b) - stockLogIdNum(a)
}

export function sortStockLog(list = []) {
  return [...list].sort(compareStockLogDesc)
}
