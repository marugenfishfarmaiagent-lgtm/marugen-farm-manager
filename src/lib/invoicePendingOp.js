const STORAGE_KEY = 'marugen_invoice_pending_create'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Persist in-flight invoice create so a crash before cloud save can roll back stock/koi. */
export function saveInvoicePendingCreate({ invoiceId, items }) {
  if (!invoiceId || !Array.isArray(items) || !items.length) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      invoiceId: String(invoiceId),
      items,
      at: Date.now(),
    }))
  } catch {
    /* private mode / quota */
  }
}

export function readInvoicePendingCreate() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.invoiceId || !Array.isArray(parsed.items)) return null
    if (parsed.at && Date.now() - parsed.at > MAX_AGE_MS) {
      clearInvoicePendingCreate()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearInvoicePendingCreate() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
