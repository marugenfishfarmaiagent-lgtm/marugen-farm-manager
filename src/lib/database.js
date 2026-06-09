import { clearSession, getAuthHeaders } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'
import { normalizeCustomerKoiRecord } from '../data/constants'
import { emptyPondData } from './cloudData'
import { normalizeImageFieldForSync, storagePaths } from './farmImage'
import { confirmDeletions, peekDeletions } from './syncDeletions'
import { touchPondData, withUpdatedAt } from './syncMeta'

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
    permissions: row.permissions || [],
    isSystem: row.isSystem ?? row.is_system,
  }
}

function mapCustomer(row) {
  return withUpdatedAt({
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    area: row.area || '',
    postalCode: row.postal_code ?? row.postalCode ?? '',
    address: row.address || '',
    fishTypes: row.fish_types || row.fishTypes || [],
    tier: row.tier || 'Bronze',
    notes: row.notes || '',
    totalSpent: Number(row.total_spent ?? row.totalSpent) || 0,
  })
}

function mapProduct(row) {
  return withUpdatedAt({
    id: row.id,
    name: row.name,
    category: row.category,
    sku: row.sku,
    price: Number(row.price),
    cost: Number(row.cost),
    unit: row.unit,
    stock: Number(row.stock),
    minStock: Number(row.min_stock ?? row.minStock),
    description: row.description || '',
    trackStock: row.track_stock ?? row.trackStock ?? true,
  })
}

function mapInvoice(row) {
  return withUpdatedAt({
    id: row.id,
    customerId: row.customer_id ?? row.customerId,
    customerName: row.customer_name ?? row.customerName,
    customerPhone: row.customer_phone ?? row.customerPhone ?? '',
    customerWhatsapp: row.customer_whatsapp ?? row.customerWhatsapp ?? '',
    customerAddress: row.customer_address ?? row.customerAddress ?? '',
    items: row.items || [],
    total: Number(row.total),
    status: row.status,
    date: row.date,
    due: row.due_date ?? row.due,
    notes: row.notes || '',
    discountType: row.discount_type ?? row.discountType ?? 'none',
    discountValue: Number(row.discount_value ?? row.discountValue) || 0,
    booked: Boolean(row.booked),
    bookedAt: row.booked_at ?? row.bookedAt ?? null,
    bookedBy: row.booked_by ?? row.bookedBy ?? '',
    createdBy: row.created_by ?? row.createdBy ?? '',
  })
}

function expenseStoragePath(id) {
  return storagePaths.expenseReceipt(id)
}

function mapExpense(row) {
  const imageUrl = row.image_url ?? row.imageUrl ?? ''
  return withUpdatedAt({
    id: row.id,
    category: row.category || '',
    amount: Number(row.amount) || 0,
    date: row.date,
    note: row.note || '',
    imageData: imageUrl ? '' : (row.image_data ?? row.imageData ?? ''),
    imageName: row.image_name ?? row.imageName ?? '',
    imageUrl,
    addedBy: row.added_by ?? row.addedBy ?? '',
    booked: Boolean(row.booked),
    bookedAt: row.booked_at ?? row.bookedAt ?? null,
    bookedBy: row.booked_by ?? row.bookedBy ?? '',
  })
}

function mapDelivery(row) {
  return withUpdatedAt({
    id: row.id,
    invoiceId: row.invoice_id ?? row.invoiceId ?? '',
    customerId: row.customer_id ?? row.customerId ?? null,
    customerName: row.customer_name ?? row.customerName,
    area: row.area,
    postalCode: row.postal_code ?? row.postalCode ?? '',
    address: row.address,
    schedule: row.schedule,
    status: row.status,
    items: row.items || '',
    driver: row.driver || '',
    notes: row.notes || '',
    createdBy: row.created_by ?? row.createdBy ?? '',
  })
}

function mapEvent(row) {
  return withUpdatedAt({
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    type: row.type,
    note: row.note || '',
    createdBy: row.created_by ?? row.createdBy ?? '',
  })
}

function mapStockLog(row) {
  return withUpdatedAt({
    id: row.id,
    productId: row.product_id ?? row.productId,
    productName: row.product_name ?? row.productName,
    type: row.type,
    qty: Number(row.qty),
    value: row.value != null ? Number(row.value) : undefined,
    total: row.value != null ? Number(row.value) : undefined,
    note: row.note || '',
    date: row.date,
    by: row.added_by ?? row.by ?? '',
  })
}

function mapKoiFish(row) {
  return withUpdatedAt({
    id: row.id,
    photo: row.photo || null,
    name: row.name || '',
    variety: row.variety || '',
    size: row.size != null ? Number(row.size) : null,
    grade: row.grade || '',
    pondName: row.pond_name ?? row.pondName ?? '',
    price: Number(row.price) || 0,
    notes: row.notes || '',
    status: row.status || 'available',
    dateAdded: row.date_added ?? row.dateAdded ?? null,
    soldTo: row.sold_to ?? row.soldTo ?? null,
    soldDate: row.sold_date ?? row.soldDate ?? null,
    soldPrice: row.sold_price != null ? Number(row.sold_price) : (row.soldPrice != null ? Number(row.soldPrice) : null),
    sellDisposition: row.sell_disposition ?? row.sellDisposition ?? null,
    keepPondName: row.keep_pond_name ?? row.keepPondName ?? null,
    deathDate: row.death_date ?? row.deathDate ?? null,
    deathCause: row.death_cause ?? row.deathCause ?? null,
    deathPhoto: row.death_photo ?? row.deathPhoto ?? null,
  })
}

function mapCustomerKoi(row) {
  return withUpdatedAt(normalizeCustomerKoiRecord({
    id: row.id,
    customerId: row.customer_id ?? row.customerId,
    customerName: row.customer_name ?? row.customerName ?? '',
    koiId: row.koi_id ?? row.koiId ?? '',
    photo: row.photo || null,
    fishName: row.fish_name ?? row.fishName ?? '',
    variety: row.variety || '',
    size: row.size != null ? Number(row.size) : null,
    pondName: row.pond_name ?? row.pondName ?? '',
    purchaseDate: row.purchase_date ?? row.purchaseDate ?? null,
    purchasePrice: Number(row.purchase_price ?? row.purchasePrice) || 0,
    notes: row.notes || '',
    status: row.status || 'in_pond',
    collectedDate: row.collected_date ?? row.collectedDate ?? null,
    deathDate: row.death_date ?? row.deathDate ?? null,
    deathCause: row.death_cause ?? row.deathCause ?? null,
    deathPhoto: row.death_photo ?? row.deathPhoto ?? null,
    deathNotes: row.death_notes ?? row.deathNotes ?? '',
  }))
}

function mapPondData(payload, updatedAt) {
  if (!payload || typeof payload !== 'object') return emptyPondData()
  const base = {
    ...emptyPondData(),
    ...payload,
    treatmentGuides: payload.treatmentGuides?.length
      ? payload.treatmentGuides
      : emptyPondData().treatmentGuides,
  }
  return updatedAt ? { ...base, updatedAt } : base
}

function mapWhatsappGroup(row) {
  return withUpdatedAt({
    id: row.id,
    name: row.name || '',
    link: row.link || '',
  })
}

async function apiCall(body) {
  const headers = getAuthHeaders({ 'Content-Type': 'application/json' })

  const res = await fetch(`${getFunctionsUrl()}/farm-api`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (res.status === 401) {
    clearSession()
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) throw new Error(data.error || `API error: ${res.status}`)
  return data
}

async function syncCall(entity, data, { prune = false } = {}) {
  const deletedIds = peekDeletions(entity)
  const payload = stampOutgoing(data)
  await apiCall({
    action: 'sync',
    entity,
    data: payload,
    deletedIds,
    prune,
  })
  if (deletedIds.length) confirmDeletions(entity, deletedIds)
}

function stampOutgoing(data) {
  if (Array.isArray(data)) return data.map(stampRecord)
  if (data && typeof data === 'object') return stampRecord(data)
  return data
}

function stampRecord(record) {
  if (!record || typeof record !== 'object') return record
  if (record.updatedAt) return record
  return { ...record, updatedAt: new Date().toISOString() }
}

export function mapPublicUsers(rows) {
  return (rows || []).map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    active: u.active !== false,
    permissions: u.permissions || [],
    isSystem: u.isSystem ?? u.is_system ?? false,
  }))
}

export async function isDatabaseEmpty() {
  if (!isSupabaseConfigured) return false
  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
    credentials: 'include',
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
  })
  const data = await res.json()
  return data.needsSetup === true
}

export async function fetchAllData() {
  if (!isSupabaseConfigured) return null
  const data = await apiCall({ action: 'fetch' })
  return {
    users: (data.users || []).map(mapUser),
    customers: (data.customers || []).map(mapCustomer),
    products: (data.products || []).map(mapProduct),
    invoices: (data.invoices || []).map(mapInvoice),
    expenses: (data.expenses || []).map(mapExpense),
    deliveries: (data.deliveries || []).map(mapDelivery),
    events: (data.events || []).map(mapEvent),
    stockActivity: (data.stockActivity || []).map(mapStockLog),
    koiFish: (data.koiFish || []).map(mapKoiFish),
    customerKoi: (data.customerKoi || []).map(mapCustomerKoi),
    pondData: mapPondData(data.pondData, data.pondUpdatedAt),
    whatsappGroups: (data.whatsappGroups || []).map(mapWhatsappGroup),
  }
}

export async function seedDatabase(seed) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'seed', seed })
}

export async function syncUsers(users) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'users', data: users })
}

export async function addUser({ name, role, pin, permissions, active }) {
  if (!isSupabaseConfigured) return null
  const data = await apiCall({ action: 'add_user', name, role, pin, permissions, active })
  return data.user ? mapUser(data.user) : null
}

export async function updateUser({ userId, name, role, pin, permissions, active }) {
  if (!isSupabaseConfigured) return null
  const data = await apiCall({ action: 'update_user', userId, name, role, pin, permissions, active })
  return data.user ? mapUser(data.user) : null
}

export async function deleteUser(userId) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'delete_user', userId })
}

export async function fetchUsers() {
  if (!isSupabaseConfigured) return null
  const data = await apiCall({ action: 'fetch' })
  return (data.users || []).map(mapUser)
}

export async function syncCustomers(customers, options) {
  if (!isSupabaseConfigured) return
  await syncCall('customers', customers, options)
}

export async function syncProducts(products, options) {
  if (!isSupabaseConfigured) return
  await syncCall('products', products, options)
}

export async function syncInvoices(invoices, options) {
  if (!isSupabaseConfigured) return
  await syncCall('invoices', invoices, options)
}

export async function uploadExpenseReceipt(expenseId, imageData, imageName = '') {
  if (!isSupabaseConfigured) throw new Error('Cloud storage is not configured')
  return apiCall({ action: 'upload_expense_receipt', expenseId, imageData, imageName })
}

export async function syncExpenses(expenses, options) {
  if (!isSupabaseConfigured) return
  const payload = expenses.map((e) => {
    const hasHttpUrl = e.imageUrl?.startsWith('http')
    return {
      ...e,
      imageUrl: hasHttpUrl
        ? expenseStoragePath(e.id)
        : (e.imageUrl || (e.imageData ? expenseStoragePath(e.id) : '')),
      imageData: hasHttpUrl ? '' : (e.imageData || ''),
    }
  })
  await syncCall('expenses', payload, options)
}

export async function refreshSignedImage({ entity, id, field }) {
  if (!isSupabaseConfigured) return null
  return apiCall({ action: 'refresh_signed_image', entity, id, field })
}

export async function refreshExpenseReceiptUrl(expenseId) {
  return refreshSignedImage({ entity: 'expense', id: expenseId, field: 'image' })
}

export async function syncDeliveries(deliveries, options) {
  if (!isSupabaseConfigured) return
  await syncCall('deliveries', deliveries, options)
}

export async function syncEvents(events, options) {
  if (!isSupabaseConfigured) return
  await syncCall('events', events, options)
}

export async function syncStockActivity(logs, options) {
  if (!isSupabaseConfigured) return
  await syncCall('stock_activity', logs, options)
}

export async function syncKoiFish(list, options) {
  if (!isSupabaseConfigured) return
  const payload = (list || []).map((k) => ({
    ...k,
    photo: normalizeImageFieldForSync(k.photo, storagePaths.koiFishPhoto(k.id)),
    deathPhoto: normalizeImageFieldForSync(k.deathPhoto, storagePaths.koiFishDeathPhoto(k.id)),
  }))
  await syncCall('koi_fish', payload, options)
}

export async function syncCustomerKoi(list, options) {
  if (!isSupabaseConfigured) return
  const payload = (list || []).map((r) => ({
    ...r,
    photo: normalizeImageFieldForSync(r.photo, storagePaths.customerKoiPhoto(r.id)),
    deathPhoto: normalizeImageFieldForSync(r.deathPhoto, storagePaths.customerKoiDeathPhoto(r.id)),
  }))
  await syncCall('customer_koi', payload, options)
}

export async function syncPondData(pondData, options) {
  if (!isSupabaseConfigured) return
  await syncCall('farm_pond_data', touchPondData(pondData), options)
}

export async function syncWhatsappGroups(groups, options) {
  if (!isSupabaseConfigured) return
  await syncCall('whatsapp_groups', groups, options)
}

export { isSupabaseConfigured }
