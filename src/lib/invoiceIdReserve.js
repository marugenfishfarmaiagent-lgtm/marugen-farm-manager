/** Session-scoped invoice numbers to skip after a failed or conflicting create (not sync tombstones). */
const reserved = new Set()

export function reserveInvoiceId(id) {
  if (id == null || id === '') return
  reserved.add(String(id))
}

export function unreserveInvoiceId(id) {
  if (id == null || id === '') return
  reserved.delete(String(id))
}

export function peekReservedInvoiceIds() {
  return reserved.size ? [...reserved] : []
}
