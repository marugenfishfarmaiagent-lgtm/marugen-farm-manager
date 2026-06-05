import { getSessionToken } from './auth'
import { getFunctionsUrl, isSupabaseConfigured } from './supabase'

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
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    whatsapp: row.whatsapp || '',
    area: row.area || '',
    fishTypes: row.fish_types || row.fishTypes || [],
    tier: row.tier || 'Bronze',
    notes: row.notes || '',
    totalSpent: Number(row.total_spent ?? row.totalSpent) || 0,
  }
}

function mapProduct(row) {
  return {
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
  }
}

function mapInvoice(row) {
  return {
    id: row.id,
    customerId: row.customer_id ?? row.customerId,
    customerName: row.customer_name ?? row.customerName,
    items: row.items || [],
    total: Number(row.total),
    status: row.status,
    date: row.date,
    due: row.due_date ?? row.due,
    notes: row.notes || '',
  }
}

function mapExpense(row) {
  return {
    id: row.id,
    category: row.category,
    amount: Number(row.amount),
    date: row.date,
    note: row.note || '',
    addedBy: row.added_by ?? row.addedBy ?? '',
  }
}

function mapDelivery(row) {
  return {
    id: row.id,
    customerId: row.customer_id ?? row.customerId,
    customerName: row.customer_name ?? row.customerName,
    area: row.area,
    address: row.address,
    schedule: row.schedule,
    status: row.status,
    items: row.items || '',
    driver: row.driver || '',
    notes: row.notes || '',
  }
}

function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time,
    type: row.type,
    note: row.note || '',
  }
}

function mapStockLog(row) {
  return {
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
  }
}

async function apiCall(body) {
  const token = getSessionToken()
  if (!token) throw new Error('Not authenticated')

  const res = await fetch(`${getFunctionsUrl()}/farm-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'X-Session-Token': token,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `API error: ${res.status}`)
  return data
}

export async function isDatabaseEmpty() {
  if (!isSupabaseConfigured) return false
  const res = await fetch(`${getFunctionsUrl()}/auth-login`, {
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

export async function syncCustomers(customers) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'customers', data: customers })
}

export async function syncProducts(products) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'products', data: products })
}

export async function syncInvoices(invoices) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'invoices', data: invoices })
}

export async function syncExpenses(expenses) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'expenses', data: expenses })
}

export async function syncDeliveries(deliveries) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'deliveries', data: deliveries })
}

export async function syncEvents(events) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'events', data: events })
}

export async function syncStockActivity(logs) {
  if (!isSupabaseConfigured) return
  await apiCall({ action: 'sync', entity: 'stock_activity', data: logs })
}

export { isSupabaseConfigured }
