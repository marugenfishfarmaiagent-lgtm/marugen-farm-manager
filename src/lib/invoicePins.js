const pins = new Map()

/** Keep a local invoice row pinned (e.g. just marked paid) until cloud confirms. */
export function pinInvoice(inv) {
  if (!inv?.id) return
  pins.set(String(inv.id), inv)
}

export function unpinInvoice(id) {
  pins.delete(String(id))
}

export function applyInvoicePins(list = []) {
  if (!pins.size) return list
  return list.map((inv) => pins.get(String(inv.id)) ?? inv)
}
