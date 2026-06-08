const pending = {
  customers: new Set(),
  products: new Set(),
  invoices: new Set(),
  expenses: new Set(),
  deliveries: new Set(),
  events: new Set(),
  stock_activity: new Set(),
  koi_fish: new Set(),
  customer_koi: new Set(),
  whatsapp_groups: new Set(),
}

export function markDeleted(entity, id) {
  if (id == null || id === '') return
  pending[entity]?.add(String(id))
}

export function consumeDeletions(entity) {
  const set = pending[entity]
  if (!set?.size) return []
  const ids = [...set]
  set.clear()
  return ids
}

export function clearAllDeletions() {
  Object.values(pending).forEach((set) => set.clear())
}
