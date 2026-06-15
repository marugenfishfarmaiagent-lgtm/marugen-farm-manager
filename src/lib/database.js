import { clearSession, cloudFetch, fetchWithSessionRetry, getAuthHeaders } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'
import { normalizeCustomerKoiRecord } from '../data/constants'
import { normalizeCustomerRecord } from './customerOps'
import { normalizeExpenseRecord, sanitizeExpenseForSync } from './expenseOps'
import { normalizeDeliveryRecord } from './deliveryOps'
import { normalizeEventRecord } from './calendarOps'
import { normalizeAssignedUserIds } from './assignTeam'
import { normalizeReminderRecord } from './pondOps'
import { normalizeUserRecord } from './teamOps'
import { emptyPondData } from './cloudData'
import { normalizeCustomerKoiPhotoForSync, normalizeImageFieldForSync, storagePaths } from './farmImage'
import { confirmDeletions, peekDeletions } from './syncDeletions'
import { touchPondData, touchUpdatedAt, withUpdatedAt } from './syncMeta'

function mapUser(row) {
  return normalizeUserRecord({
    id: row.id,
    name: row.name ?? '',
    role: row.role ?? 'staff',
    active: row.active,
    permissions: row.permissions ?? [],
    isSystem: row.isSystem ?? row.is_system,
  })
}

function mapCustomer(row) {
  return withUpdatedAt(normalizeCustomerRecord({
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
  }))
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

export function normalizeBigintId(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeDateField(value) {
  if (value == null || value === '') return null
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? new Date(s).toISOString().split('T')[0] : null
}

function sanitizeInvoiceItems(items) {
  if (!Array.isArray(items)) return []
  return items.map((it) => {
    if (!it || typeof it !== 'object') return it
    const productId = it.productId ?? it.product_id
    const koiId = it.koiId ?? it.koi_id
    const next = {
      ...it,
      name: it.name ?? '',
      qty: Number(it.qty) || 0,
      price: Number(it.price) || 0,
    }
    delete next.product_id
    delete next.koi_id
    if (productId != null && productId !== '') next.productId = productId
    else delete next.productId
    if (koiId != null && koiId !== '') next.koiId = koiId
    else delete next.koiId
    return next
  })
}

/** Normalize invoice fields before cloud sync or after DB fetch. */
export function sanitizeInvoiceForSync(inv) {
  if (!inv || typeof inv !== 'object') return inv
  const bookedAt = inv.bookedAt ?? inv.booked_at
  const clean = {
    id: inv.id,
    customerId: normalizeBigintId(inv.customerId ?? inv.customer_id),
    customerName: inv.customerName ?? inv.customer_name ?? '',
    customerPhone: inv.customerPhone ?? inv.customer_phone ?? '',
    customerWhatsapp: inv.customerWhatsapp ?? inv.customer_whatsapp ?? '',
    customerAddress: inv.customerAddress ?? inv.customer_address ?? '',
    items: sanitizeInvoiceItems(inv.items),
    total: Number(inv.total) || 0,
    status: inv.status || 'pending',
    date: normalizeDateField(inv.date),
    due: normalizeDateField(inv.due ?? inv.due_date),
    notes: inv.notes || '',
    discountType: inv.discountType ?? inv.discount_type ?? 'none',
    discountValue: Number(inv.discountValue ?? inv.discount_value) || 0,
    shipping: Number(inv.shipping) || 0,
    booked: Boolean(inv.booked),
    bookedAt: bookedAt || null,
    bookedBy: inv.bookedBy ?? inv.booked_by ?? '',
    createdBy: inv.createdBy ?? inv.created_by ?? '',
  }
  const updatedAt = inv.updatedAt ?? inv.updated_at
  if (updatedAt) clean.updatedAt = updatedAt
  return clean
}

function mapInvoice(row) {
  return sanitizeInvoiceForSync(withUpdatedAt({
    id: row.id,
    customerId: row.customer_id ?? row.customerId,
    customerName: row.customer_name ?? row.customerName,
    customerPhone: row.customer_phone ?? row.customerPhone ?? '',
    customerWhatsapp: row.customer_whatsapp ?? row.customerWhatsapp ?? '',
    customerAddress: row.customer_address ?? row.customerAddress ?? '',
    items: row.items || [],
    total: row.total,
    status: row.status,
    date: row.date,
    due: row.due_date ?? row.due,
    notes: row.notes || '',
    discountType: row.discount_type ?? row.discountType ?? 'none',
    discountValue: row.discount_value ?? row.discountValue,
    shipping: row.shipping,
    booked: row.booked,
    bookedAt: row.booked_at ?? row.bookedAt ?? null,
    bookedBy: row.booked_by ?? row.bookedBy ?? '',
    createdBy: row.created_by ?? row.createdBy ?? '',
    updated_at: row.updated_at,
  }))
}

function expenseStoragePath(id) {
  return storagePaths.expenseReceipt(id)
}

function mapExpense(row) {
  const imageUrl = row.image_url ?? row.imageUrl ?? ''
  const amountRaw = row.amount
  return withUpdatedAt(normalizeExpenseRecord({
    id: row.id,
    category: row.category ?? null,
    amount: amountRaw != null && amountRaw !== '' ? Number(amountRaw) : null,
    date: row.date,
    note: row.note || '',
    imageData: imageUrl ? '' : (row.image_data ?? row.imageData ?? ''),
    imageName: row.image_name ?? row.imageName ?? '',
    imageUrl,
    addedBy: row.added_by ?? row.addedBy ?? '',
    booked: Boolean(row.booked),
    bookedAt: row.booked_at ?? row.bookedAt ?? null,
    bookedBy: row.booked_by ?? row.bookedBy ?? '',
  }))
}

function mapDelivery(row) {
  return withUpdatedAt(normalizeDeliveryRecord({
    id: row.id,
    invoiceId: row.invoice_id ?? row.invoiceId ?? '',
    customerId: row.customer_id ?? row.customerId ?? null,
    customerName: row.customer_name ?? row.customerName,
    area: row.area ?? '',
    postalCode: row.postal_code ?? row.postalCode ?? '',
    address: row.address ?? '',
    schedule: row.schedule ?? '',
    status: row.status ?? 'scheduled',
    items: row.items ?? '',
    driver: row.driver ?? '',
    notes: row.notes ?? '',
    createdBy: row.created_by ?? row.createdBy ?? '',
    assignedUserIds: normalizeAssignedUserIds(row.assigned_user_ids ?? row.assignedUserIds),
    photo: row.photo ?? '',
    photoName: row.photo_name ?? row.photoName ?? '',
    photoData: row.photo_data ?? row.photoData ?? '',
  }))
}

function mapEvent(row) {
  return withUpdatedAt(normalizeEventRecord({
    id: row.id,
    title: row.title ?? '',
    date: row.date ?? '',
    time: row.time ?? '09:00',
    type: row.type ?? 'other',
    note: row.note ?? '',
    createdBy: row.created_by ?? row.createdBy ?? '',
    pondReminderId: row.pond_reminder_id ?? row.pondReminderId ?? '',
    assignedUserIds: normalizeAssignedUserIds(row.assigned_user_ids ?? row.assignedUserIds),
  }))
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
    status: String(row.status || 'available').toLowerCase(),
    dateAdded: row.date_added ?? row.dateAdded ?? null,
    soldTo: row.sold_to ?? row.soldTo ?? null,
    soldDate: row.sold_date ?? row.soldDate ?? null,
    soldPrice: row.sold_price != null ? Number(row.sold_price) : (row.soldPrice != null ? Number(row.soldPrice) : null),
    sellDisposition: row.sell_disposition ?? row.sellDisposition ?? null,
    keepPondName: row.keep_pond_name ?? row.keepPondName ?? null,
    deathDate: row.death_date ?? row.deathDate ?? null,
    deathCause: row.death_cause ?? row.deathCause ?? null,
    deathPhoto: row.death_photo ?? row.deathPhoto ?? null,
    updated_at: row.updated_at,
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
    reminders: (payload.reminders || []).map((row) => normalizeReminderRecord(row)),
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

  const res = await fetchWithSessionRetry(`${getFunctionsUrl()}/farm-api`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const raw = await res.text()
  let data = {}
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error(raw.slice(0, 180) || `API error: ${res.status}`)
    }
  }

  if (res.status === 401) {
    clearSession()
    throw new Error('Session expired. Please log in again.')
  }
  if (!res.ok) {
    const action = body?.action || 'unknown'
    const entity = body?.entity ? `/${body.entity}` : ''
    const errMsg = data.error || `API error: ${res.status}`
    if (import.meta.env.DEV) {
      console.error(`[farm-api] ${action}${entity} → ${res.status}: ${errMsg}`)
    }
    throw new Error(errMsg)
  }
  return data
}

async function syncCall(entity, data, { prune = false, force = false } = {}) {
  const deletedIds = peekDeletions(entity)
  const deletedSet = new Set(deletedIds.map(String))
  const filtered = Array.isArray(data)
    ? data.filter((row) => row?.id != null && !deletedSet.has(String(row.id)))
    : data
  const payload = stampOutgoing(filtered)
  const result = await apiCall({
    action: 'sync',
    entity,
    data: payload,
    deletedIds,
    prune,
    ...(force ? { force: true } : {}),
  })
  if (deletedIds.length) confirmDeletions(entity, deletedIds)
  return result
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
  const res = await cloudFetch(`${getFunctionsUrl()}/auth-login`)
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
    teamNotifications: data.teamNotifications || [],
    whatsappGroups: (data.whatsappGroups || []).map(mapWhatsappGroup),
    syncTombstones: data.syncTombstones || [],
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
  await syncCall('invoices', (invoices || []).map(sanitizeInvoiceForSync), options)
}

/** Atomically mark one invoice paid on the server (avoids full-list sync timestamp races). */
export async function markInvoicePaidCloud(id) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured')
  const data = await apiCall({ action: 'mark_invoice_paid', id: String(id) })
  return {
    invoice: mapInvoice(data.invoice),
    customer: data.customer ? mapCustomer(data.customer) : null,
  }
}

/** Atomically cancel one invoice on the server (avoids full-list sync timestamp races). */
export async function cancelInvoiceCloud(id, options = {}) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured')
  const data = await apiCall({
    action: 'cancel_invoice',
    id: String(id),
    refund: Boolean(options.refund),
    skipKoiRestore: Boolean(options.skipKoiRestore),
    refundReason: options.refundReason || '',
  })
  return {
    invoice: mapInvoice(data.invoice),
    customer: data.customer ? mapCustomer(data.customer) : null,
  }
}

/** Atomically mark one invoice in/out of accounts (avoids full-list sync timestamp races). */
export async function markInvoiceBookedCloud(id, { booked, bookedBy } = {}) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured')
  const data = await apiCall({
    action: 'mark_invoice_booked',
    id: String(id),
    booked: Boolean(booked),
    bookedBy: bookedBy || '',
  })
  return mapInvoice(data.invoice)
}

/** Upsert a single invoice on the server (avoids full-list sync timestamp races on create). */
export async function upsertInvoiceCloud(invoice, { createOnly = false } = {}) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured')
  const payload = sanitizeInvoiceForSync(touchUpdatedAt(invoice))
  const data = await apiCall({ action: 'upsert_invoice', invoice: payload, createOnly: Boolean(createOnly) })
  return mapInvoice(data.invoice)
}

export async function uploadExpenseReceipt(expenseId, imageData, imageName = '') {
  if (!isSupabaseConfigured) throw new Error('Cloud storage is not configured')
  return apiCall({ action: 'upload_expense_receipt', expenseId, imageData, imageName })
}

export async function uploadDeliveryPhoto(deliveryId, imageData, photoName = '') {
  if (!isSupabaseConfigured) throw new Error('Cloud storage is not configured')
  return apiCall({ action: 'upload_delivery_photo', deliveryId, imageData, photoName })
}

export async function uploadKoiFishPhoto(recordId, imageData, field = 'photo') {
  if (!isSupabaseConfigured) throw new Error('Cloud storage is not configured')
  return apiCall({ action: 'upload_koi_image', entity: 'koi_fish', id: recordId, field, imageData })
}

export async function uploadCustomerKoiPhoto(recordId, imageData, field = 'photo') {
  if (!isSupabaseConfigured) throw new Error('Cloud storage is not configured')
  return apiCall({ action: 'upload_koi_image', entity: 'customer_koi', id: recordId, field, imageData })
}

export async function syncExpenses(expenses, options) {
  if (!isSupabaseConfigured) return
  const payload = (expenses || [])
    .map((e) => {
      const normalized = sanitizeExpenseForSync(e)
      if (!normalized) return null
      const hasHttpUrl = normalized.imageUrl?.startsWith('http')
      const hasInlineImage = Boolean(normalized.imageData?.startsWith?.('data:image'))
      return {
        ...normalized,
        imageUrl: hasHttpUrl
          ? expenseStoragePath(normalized.id)
          : (hasInlineImage ? '' : (normalized.imageUrl || '')),
        imageData: hasHttpUrl ? '' : (normalized.imageData || ''),
      }
    })
    .filter(Boolean)
  await syncCall('expenses', payload, options)
}

export async function refreshSignedImage({ entity, id, field }) {
  if (!isSupabaseConfigured) return null
  return apiCall({ action: 'refresh_signed_image', entity, id, field })
}

export async function refreshExpenseReceiptUrl(expenseId) {
  return refreshSignedImage({ entity: 'expense', id: expenseId, field: 'image' })
}

export async function refreshDeliveryPhotoUrl(deliveryId) {
  return refreshSignedImage({ entity: 'delivery', id: deliveryId, field: 'photo' })
}

export async function syncDeliveries(deliveries, options) {
  if (!isSupabaseConfigured) return
  const payload = (deliveries || []).map((d) => normalizeDeliveryRecord(d))
  await syncCall('deliveries', payload, options)
}

export async function syncEvents(events, options) {
  if (!isSupabaseConfigured) return
  const payload = (events || []).map((e) => {
    const row = normalizeEventRecord(e)
    return {
      ...row,
      pond_reminder_id: row.pondReminderId || '',
    }
  })
  await syncCall('events', payload, options)
}

export async function syncStockActivity(logs, options) {
  if (!isSupabaseConfigured) return
  await syncCall('stock_activity', logs, options)
}

export async function syncKoiFish(list, options) {
  if (!isSupabaseConfigured) return
  const payload = (list || []).map((k) => {
    const status = String(k.status || 'available').toLowerCase()
    const rawSoldTo = k.soldTo ?? k.sold_to
    const soldTo = normalizeBigintId(rawSoldTo) ?? normalizeBigintId(k.soldTo)
    return {
      ...k,
      status,
      soldTo: status === 'sold' ? soldTo : null,
      photo: normalizeImageFieldForSync(k.photo, storagePaths.koiFishPhoto(k.id)),
      deathPhoto: normalizeImageFieldForSync(k.deathPhoto, storagePaths.koiFishDeathPhoto(k.id)),
    }
  })
  await syncCall('koi_fish', payload, options)
}

export async function syncCustomerKoi(list, options) {
  if (!isSupabaseConfigured) return
  const payload = (list || []).map((r) => ({
    ...r,
    photo: normalizeCustomerKoiPhotoForSync(r.photo, { koiId: r.koiId, customerKoiId: r.id }),
    deathPhoto: normalizeImageFieldForSync(r.deathPhoto, storagePaths.customerKoiDeathPhoto(r.id)),
  }))
  await syncCall('customer_koi', payload, options)
}

export async function syncPondData(pondData, options = {}) {
  if (!isSupabaseConfigured) return { ok: true }
  return syncCall('farm_pond_data', touchPondData(pondData), options)
}

export async function syncWhatsappGroups(groups, options) {
  if (!isSupabaseConfigured) return
  await syncCall('whatsapp_groups', groups, options)
}

export async function getPushConfig() {
  if (!isSupabaseConfigured) return { enabled: false, publicKey: null }
  return apiCall({ action: 'get_push_config' })
}

export async function registerPushSubscription(subscription) {
  if (!isSupabaseConfigured) return
  return apiCall({ action: 'register_push_subscription', subscription })
}

export async function unregisterPushSubscription(endpoint) {
  if (!isSupabaseConfigured) return
  return apiCall({ action: 'unregister_push_subscription', endpoint })
}

export async function sendPushTest() {
  if (!isSupabaseConfigured) return
  return apiCall({ action: 'send_push_test' })
}

export async function notifyTeamPush({
  title, body, message, url, tag, actor, actorRole, type, targetUserIds,
}) {
  if (!isSupabaseConfigured) return
  return apiCall({
    action: 'notify_team_push',
    title,
    body: body ?? message,
    message: body ?? message,
    url,
    tag,
    actor,
    actorRole,
    type,
    targetUserIds,
  })
}

export async function notifySelfPush({ title, body, message, url, tag }) {
  if (!isSupabaseConfigured) return
  return apiCall({
    action: 'notify_self_push',
    title,
    body: body ?? message,
    url,
    tag,
  })
}

export { isSupabaseConfigured }
