const pins = new Map()

/** Keep a local invoice row pinned (e.g. just marked paid) until cloud confirms. */
export function pinInvoice(inv) {
  if (!inv?.id) return
  pins.set(String(inv.id), inv)
}

export function unpinInvoice(id) {
  pins.delete(String(id))
}

function isTerminalInvoiceStatus(status) {
  return status === 'paid' || status === 'cancelled'
}

/** Drop pin only when cloud confirm matches or supersedes the pinned row (avoids create→paid race). */
export function releaseInvoicePinAfterConfirm(id, confirmed) {
  const key = String(id)
  const pin = pins.get(key)
  if (!pin) return
  const pinStatus = pin.status || 'pending'
  const confirmedStatus = confirmed?.status || 'pending'
  if (isTerminalInvoiceStatus(pinStatus) && !isTerminalInvoiceStatus(confirmedStatus)) return
  pins.delete(key)
}

export function applyInvoicePins(list = []) {
  if (!pins.size) return list
  return list.map((inv) => pins.get(String(inv.id)) ?? inv)
}
