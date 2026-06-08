import * as db from './database'

/** Maps each sync call to the module permission required (matches farm-api ENTITY_PERMS). */
export const SYNC_ENTITIES = [
  { perm: 'customers', label: 'Customers', sync: db.syncCustomers, key: 'customers' },
  { perm: 'inventory', label: 'Inventory', sync: db.syncProducts, key: 'products' },
  { perm: 'invoices', label: 'Invoices', sync: db.syncInvoices, key: 'invoices' },
  { perm: 'expenses', label: 'Expenses', sync: db.syncExpenses, key: 'expenses' },
  { perm: 'deliveries', label: 'Deliveries', sync: db.syncDeliveries, key: 'deliveries' },
  { perm: 'calendar', label: 'Calendar', sync: db.syncEvents, key: 'events' },
  { perm: 'inventory', label: 'Stock activity', sync: db.syncStockActivity, key: 'stockLog' },
  { perm: 'koifish', label: 'Koi fish', sync: db.syncKoiFish, key: 'koiFishList' },
  { perm: 'customerkoi', label: 'Customer koi', sync: db.syncCustomerKoi, key: 'customerKoiList' },
  { perm: 'ponds', label: 'Pond data', sync: db.syncPondData, key: 'pondData' },
  { perm: 'deliveries', label: 'WhatsApp groups', sync: db.syncWhatsappGroups, key: 'whatsappGroups' },
]

export function canSyncEntity(user, perm, hasPermission) {
  if (!user) return false
  return hasPermission(user, perm)
}

export function buildSyncTasks(user, state, hasPermission, { prune = false } = {}) {
  return SYNC_ENTITIES
    .filter((e) => canSyncEntity(user, e.perm, hasPermission))
    .map((e) => ({
      label: e.label,
      run: () => e.sync(state[e.key], { prune }),
    }))
}

export async function syncAllAllowed(user, state, hasPermission, options = {}) {
  const tasks = buildSyncTasks(user, state, hasPermission, options)
  if (!tasks.length) return { synced: 0, skipped: SYNC_ENTITIES.length }

  const results = await Promise.allSettled(tasks.map((t) => t.run()))
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? tasks[i].label : null))
    .filter(Boolean)

  if (failed.length) {
    throw new Error(`Sync failed: ${failed.join(', ')} — ${results.find((r) => r.status === 'rejected')?.reason?.message || 'unknown error'}`)
  }

  return { synced: tasks.length, skipped: SYNC_ENTITIES.length - tasks.length }
}
