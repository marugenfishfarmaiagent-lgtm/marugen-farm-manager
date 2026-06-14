import {
  calcCustomerTier, customerDeliveryFields, EXPENSE_CATEGORIES, formatSGD, genInvoiceId,
  getInvoiceStatus, today, KOI_STATUS, formatKoiSize, PRODUCT_CATEGORIES,
} from '../data/constants'
import { calcInvoiceAmounts } from './invoiceDesign'
import { writeCloudFirst, writeInventoryCloudFirst, writeListCloudFirst } from './cloudWrite.js'
import { touchUpdatedAt } from './syncMeta'
import { formatCustomerAddress, resolveInvoiceCustomer } from './invoiceWhatsApp'
import { applyStockPreview, deductStockForInvoice, restoreStockForInvoice, serializeInvoiceItem, previewDeductStockForInvoice, previewRestoreStockForInvoice, validateStockForItems } from './inventoryStock'
import { adjustProductStockInList, buildStockLogEntry } from './inventoryOps'
import {
  formatKoiInvoiceLineName, restoreInvoiceKoiSales, previewApplyInvoiceKoiSales,
  previewRestoreInvoiceKoiSales, applyInvoiceKoiSales, validateInvoiceKoiSales,
} from './koiInvoice'
import { buildSoldKoiPatch, sameKoiId, validateKoiSaleForm } from './koiOps'
import { actionConfirmKey, describeRiskyAction, isRiskyAiAction } from './aiRisk'
import {
  findProductCandidates, findProductInList, formatProductCatalogEntry, productMatchHint,
} from './productMatch'
import { isStockTracked } from './productCatalog'
import { sanitizeInvoiceForSync } from './database'
import {
  buildNewCustomerRecord, buildUpdatedCustomerRecord, isDuplicateCustomerName, sameCustomerId,
} from './customerOps'
import { buildExpenseReceiptRecord } from './expenseOps'
import {
  buildDeliveryStatusPatch, buildNewDeliveryRecord, buildUpdatedDeliveryRecord, sameDeliveryId,
} from './deliveryOps'
import {
  buildNewEventRecord, buildUpdatedEventRecord, filterTodayEvents, sameEventId,
} from './calendarOps'
import { AI_TOOL_NAMES } from './aiTools'

const EXPENSE_ALIASES = {
  feed: 'Feed', food: 'Feed', pellets: 'Feed', fishfood: 'Feed',
  transport: 'Transport', fuel: 'Transport', diesel: 'Transport', petrol: 'Transport', delivery: 'Transport',
  utilities: 'Utilities', electricity: 'Utilities', water: 'Utilities', power: 'Utilities',
  rent: 'Rent', equipment: 'Equipment', pump: 'Equipment', labor: 'Labor', labour: 'Labor',
  salary: 'Labor', wages: 'Labor', medicine: 'Medicine', med: 'Medicine', treatment: 'Medicine',
  packaging: 'Packaging', marketing: 'Marketing', ads: 'Marketing',
}

const STATUS_ALIASES = {
  done: 'delivered', complete: 'delivered', completed: 'delivered', finished: 'delivered',
  delivered: 'delivered', onthedway: 'transit', 'on the way': 'transit', shipping: 'transit',
  transit: 'transit', outfordelivery: 'transit', cancel: 'cancelled', cancelled: 'cancelled',
  canceled: 'cancelled', scheduled: 'scheduled', pending: 'scheduled',
}

function canDo(user, perm) {
  if (!user) return false
  if (user.role === 'owner') return true
  return user.permissions?.includes(perm) ?? false
}

function canEdit(user) {
  return canDo(user, 'edit')
}

function canDelete(user) {
  return canDo(user, 'delete')
}

function canRefund(user) {
  return canDo(user, 'refund')
}

function normalizeText(s) {
  return String(s || '').toLowerCase().trim().replace(/[''`]/g, "'").replace(/\s+/g, ' ')
}

function tokenize(s) {
  return normalizeText(s).split(/\s+/).filter((w) => w.length > 1)
}

function findByName(list, name, key = 'name') {
  if (!name || !list?.length) return null
  const q = normalizeText(name)
  if (!q) return null

  const exact = list.find((x) => normalizeText(x[key]) === q)
  if (exact) return exact

  const contains = list.find((x) => {
    const n = normalizeText(x[key])
    return n.includes(q) || q.includes(n)
  })
  if (contains) return contains

  const qTokens = tokenize(q)
  let best = null
  let bestScore = 0
  for (const x of list) {
    const nameTokens = tokenize(x[key])
    const overlap = qTokens.filter((t) =>
      nameTokens.some((nt) => nt === t || nt.startsWith(t) || t.startsWith(nt))
    ).length
    if (overlap > bestScore) {
      bestScore = overlap
      best = x
    }
  }
  return bestScore > 0 ? best : null
}

function findCustomer(ctx, name) {
  return findByName(ctx.customers, name, 'name')
}

function findProduct(ctx, name) {
  return findProductInList(ctx.products, name)
    || findByName(ctx.products, name, 'name')
    || findByName(ctx.products, name, 'description')
    || findByName(ctx.products, name, 'sku')
}

function findInvoice(ctx, { invoiceId, customerName }) {
  if (invoiceId) {
    const id = normalizeText(invoiceId)
    const inv = ctx.invoices.find((i) => normalizeText(i.id) === id || normalizeText(i.id).includes(id))
    if (inv) return inv
  }
  if (customerName) {
    const customer = findCustomer(ctx, customerName)
    const nameQ = normalizeText(customer?.name || customerName)
    const unpaid = ctx.invoices
      .filter((i) => {
        const st = getInvoiceStatus(i)
        return st === 'pending' || st === 'overdue'
      })
      .filter((i) => normalizeText(i.customerName).includes(nameQ) || nameQ.includes(normalizeText(i.customerName)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return unpaid[0] || null
  }
  return null
}

function findKoi(ctx, { koiId, name, variety }) {
  const list = ctx.koiFishList || []
  if (koiId) {
    const id = normalizeText(koiId)
    return list.find((k) => normalizeText(k.id) === id || normalizeText(k.id).includes(id)) || null
  }
  const q = name || variety
  return findByName(list, q, 'name') || findByName(list, q, 'variety') || null
}

function findSoldKoi(ctx, query) {
  const sold = (ctx.koiFishList || []).filter((k) => k.status === KOI_STATUS.SOLD)
  return findKoi({ koiFishList: sold }, { koiId: query.koiId, name: query.name || query.koi })
}

function findCalendarEvent(ctx, { title, date, eventId }) {
  if (eventId != null) {
    return ctx.events.find((e) => sameEventId(e.id, eventId)) || null
  }
  const t = normalizeText(title)
  const d = date || ''
  return ctx.events.find((e) => normalizeText(e.title) === t && (!d || e.date === d))
    || ctx.events.find((e) => normalizeText(e.title).includes(t) && (!d || e.date === d))
    || null
}

function findCancellableInvoice(ctx, { invoiceId, customerName }) {
  const inv = findInvoice(ctx, { invoiceId, customerName })
  if (!inv) return null
  const st = getInvoiceStatus(inv)
  if (!['pending', 'overdue'].includes(st)) return null
  return inv
}

function findDelivery(ctx, { deliveryId, customerName }) {
  if (deliveryId) {
    const id = normalizeText(deliveryId)
    return ctx.deliveries.find((d) => normalizeText(d.id) === id || normalizeText(d.id).includes(id)) || null
  }
  if (customerName) {
    const active = ctx.deliveries.filter((d) => !['delivered', 'cancelled'].includes(d.status))
    const hit = findByName(active, customerName, 'customerName')
    if (hit) return hit
    return findByName(ctx.deliveries, customerName, 'customerName')
  }
  return null
}

function parseQuantity(val) {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  const s = normalizeText(val)
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (!Number.isNaN(n) && n > 0) return n
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12 }
  for (const [w, num] of Object.entries(words)) {
    if (s.includes(w)) return num
  }
  return null
}

function resolveExpenseCategory(raw) {
  if (!raw) return 'Other'
  if (EXPENSE_CATEGORIES.includes(raw)) return raw
  const key = normalizeText(raw).replace(/\s+/g, '')
  if (EXPENSE_ALIASES[key]) return EXPENSE_ALIASES[key]
  for (const [alias, cat] of Object.entries(EXPENSE_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return cat
  }
  return 'Other'
}

const PRODUCT_CATEGORY_ALIASES = {
  feed: 'Fish Food', food: 'Fish Food', fishfood: 'Fish Food', pellets: 'Fish Food',
  water: 'Water Treatment', treatment: 'Water Treatment', antichlorine: 'Water Treatment',
  medicine: 'Medicine', med: 'Medicine',
  equipment: 'Equipment', pump: 'Equipment',
  pond: 'Pond Supplies', supplies: 'Pond Supplies',
  accessory: 'Accessories', accessories: 'Accessories',
}

function resolveProductCategory(raw) {
  if (!raw) return 'Fish Food'
  if (PRODUCT_CATEGORIES.includes(raw)) return raw
  const key = normalizeText(raw).replace(/\s+/g, '')
  if (PRODUCT_CATEGORY_ALIASES[key]) return PRODUCT_CATEGORY_ALIASES[key]
  for (const [alias, cat] of Object.entries(PRODUCT_CATEGORY_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return cat
  }
  return 'Fish Food'
}

function resolveProductUnit(raw, category) {
  if (raw?.trim()) return raw.trim()
  if (category === 'Fish Food') return 'bag'
  return 'pcs'
}

function defaultProductStock(category, stock) {
  const parsed = parseQuantity(stock)
  if (parsed != null && parsed >= 0) return parsed
  return category === 'Fish Food' ? 10 : 0
}

function buildProductFromArgs(a, id) {
  const name = (a.name || a.productName || a.product || '').trim()
  const category = resolveProductCategory(a.category)
  const unit = resolveProductUnit(a.unit, category)
  const stock = defaultProductStock(category, a.stock ?? a.quantity)
  const price = parseQuantity(a.price) ?? 0
  return touchUpdatedAt({
    id,
    name,
    category,
    sku: a.sku?.trim() || '',
    price,
    cost: parseQuantity(a.cost) ?? 0,
    unit,
    stock,
    minStock: parseQuantity(a.minStock) ?? 0,
    description: (a.description || name).trim(),
    trackStock: true,
  })
}


function findProductInCatalog(catalog, name) {
  return findProductInList(catalog, name)
    || findByName(catalog, name, 'name')
    || findByName(catalog, name, 'description')
    || findByName(catalog, name, 'sku')
}

function resolveStatus(raw) {
  const key = normalizeText(raw).replace(/\s+/g, '')
  return STATUS_ALIASES[key] || raw
}

function resolveInvoiceItems(items, ctx) {
  const resolved = []
  const errors = []
  for (const it of items || []) {
    const name = it.name?.trim()
    if (!name) continue
    const qty = parseQuantity(it.qty) || 1
    let price = parseQuantity(it.price)
    const product = findProduct(ctx, name)
    const finalName = product?.name || name
    if ((!price || price <= 0) && product) price = product.price
    if (!price || price <= 0) {
      const near = findProductCandidates(ctx.products, name, 3)
      if (near.length) {
        errors.push(`Could not price "${name}" — closest inventory: ${near.map((p) => p.name).join('; ')}. Specify qty/price or use exact catalog name.`)
      } else {
        errors.push(`No price for "${name}" — not in inventory, please specify price`)
      }
      continue
    }
    const item = { name: finalName, qty, price }
    if (product) item.productId = product.id
    resolved.push(item)
  }
  return { items: resolved, errors }
}

function normalizeArgs(name, args, ctx) {
  const a = { ...args }

  if (name === 'mark_invoice_paid') {
    a.customerName = a.customerName || a.customer || a.name || a.who
    a.invoiceId = a.invoiceId || a.invoice || a.id || a.reference
  }
  if (name === 'create_invoice') {
    a.customerName = a.customerName || a.customer || a.name || a.client
    if (Array.isArray(a.items)) {
      a.items = a.items.map((it) => ({
        ...it,
        name: it.name || it.product || it.item || it.productName || it.description || it.label,
      }))
    }
    if (!a.discountType && (a.discountPercent || a.percentOff)) {
      a.discountType = 'percent'
      a.discountValue = a.discountPercent ?? a.percentOff
    } else if (!a.discountType && a.discount) {
      a.discountType = 'fixed'
      a.discountValue = a.discount
    }
  }
  if (name === 'restock_product') {
    a.productName = a.productName || a.product || a.item || a.name || a.description
    a.quantity = parseQuantity(a.quantity ?? a.qty ?? a.amount)
  }
  if (name === 'create_product') {
    a.name = a.name || a.productName || a.product || a.item
    a.stock = a.stock ?? a.quantity
  }
  if (name === 'create_products' && Array.isArray(a.products)) {
    a.products = a.products.map((p) => ({
      ...p,
      name: p.name || p.productName || p.product || p.item,
      stock: p.stock ?? p.quantity,
    }))
  }
  if (name === 'schedule_delivery' || name === 'update_delivery') {
    a.customerName = a.customerName || a.customer || a.name
    a.deliveryId = a.deliveryId || a.id || a.delivery
    a.invoiceId = a.invoiceId || a.invoice || ''
    if (!a.address && a.customerName) {
      const c = findCustomer(ctx, a.customerName)
      if (c) {
        a.postalCode = a.postalCode || c.postalCode
        a.address = a.address || c.address || `TBC — ${c.name} (contact customer)`
      }
    }
  }
  if (name === 'cancel_invoice') {
    a.invoiceId = a.invoiceId || a.invoice || a.id
    a.customerName = a.customerName || a.customer || a.name
  }
  if (name === 'sell_koi') {
    a.koiId = a.koiId || a.koi || a.id
    a.customerName = a.customerName || a.customer || a.name
    a.disposition = a.disposition || a.keepAtFarm ? 'keep' : 'taken'
    if (a.createInvoice == null) a.createInvoice = true
  }
  if (name === 'refund_koi_sale') {
    a.koiId = a.koiId || a.koi || a.id
    a.name = a.name || a.fish || a.koiName
  }
  if (name === 'delete_customer') {
    a.name = a.name || a.customerName || a.customer
  }
  if (name === 'delete_product') {
    a.productName = a.productName || a.product || a.name || a.description
  }
  if (name === 'delete_delivery') {
    a.deliveryId = a.deliveryId || a.id
    a.customerName = a.customerName || a.customer || a.name
  }
  if (name === 'update_customer') {
    a.name = a.name || a.customerName || a.customer
  }
  if (name === 'delete_calendar_event') {
    a.title = a.title || a.event
    a.eventId = a.eventId ?? a.id
  }
  if (name === 'update_calendar_event') {
    a.title = a.title || a.event
    a.newTitle = a.newTitle || a.titleNew
    a.newDate = a.newDate || a.dateNew
    a.newTime = a.newTime || a.timeNew
    a.newType = a.newType || a.typeNew
  }
  if (name === 'update_delivery_status') {
    a.customerName = a.customerName || a.customer || a.name
    a.deliveryId = a.deliveryId || a.id || a.delivery
    a.status = resolveStatus(a.status)
  }
  if (name === 'add_expense') {
    a.category = resolveExpenseCategory(a.category)
    a.amount = parseQuantity(a.amount)
    a.note = a.note || a.description || a.for || ''
  }
  if (name === 'create_customer') {
    a.name = a.name || a.customerName || a.customer
  }
  if (name === 'create_calendar_event') {
    a.title = a.title || a.event || a.reminder
    a.note = a.note || a.description || ''
  }

  return a
}

export function buildBusinessContext(ctx) {
  const {
    customers, invoices, expenses, products, deliveries, events, currentUser,
    koiFishList = [], customerKoiList = [], pondData = [],
  } = ctx
  const can = (perm) => canDo(currentUser, perm)
  const paid = can('invoices') ? invoices.filter((i) => getInvoiceStatus(i) === 'paid') : []
  const pending = can('invoices') ? invoices.filter((i) => getInvoiceStatus(i) === 'pending') : []
  const overdue = can('invoices') ? invoices.filter((i) => getInvoiceStatus(i) === 'overdue') : []
  const lowStock = can('inventory')
    ? products.filter((p) => isStockTracked(p) && p.minStock > 0 && p.stock <= p.minStock)
    : []
  const now = today()
  const koiAvailable = can('koifish') ? koiFishList.filter((k) => k.status !== KOI_STATUS.SOLD) : []
  const koiSold = can('koifish') ? koiFishList.filter((k) => k.status === KOI_STATUS.SOLD) : []
  const role = currentUser?.role || 'staff'
  const isOwner = role === 'owner'
  const perms = currentUser?.permissions || []

  const snapshotParts = []
  if (can('customers')) snapshotParts.push(`${customers.length} customers`)
  if (can('inventory')) snapshotParts.push(`${products.length} products`)
  if (can('koifish')) snapshotParts.push(`${koiAvailable.length} koi in stock · ${koiSold.length} sold`)
  if (can('customerkoi')) snapshotParts.push(`${customerKoiList.length} customer koi`)
  if (can('ponds')) snapshotParts.push(`${pondData?.ponds?.length || 0} ponds`)

  return `You are Marugen Farm Manager AI — act as the owner's capable assistant inside the full web app.
Speak English or Burmese (Myanmar) to match the user. Use SGD ($). Be concise and action-oriented.

PHOTOS & VISION:
Users may attach one or more photos. You CAN see them — describe what you notice before acting.
Use images to:
  • Identify koi variety, grade, size estimate, visible health issues (spots, fin damage, parasites)
  • Read expense receipts / supplier invoices (amount, date, vendor) and offer to record expenses
  • Read supplier product lists / delivery notes → create_products for each NEW line (fish food: unit=bag, stock=10 unless user says otherwise)
  • Read pond water-test readings, medicine labels, equipment nameplates
  • Match a fish photo to farm stock when an ID tag or unique markings are visible
If a photo is unclear, say what you can and cannot see. Do not invent details.

CONFIRMATION FLOW:
When you propose a plan and the user confirms (yes / ok / correct / ဟုတ်တယ် / လုပ်ပါ / မှန်တယ်), call the matching tools immediately in the same turn — do not ask again.
For invoices + deliveries together, call create_invoice then schedule_delivery (or both in one round).
When the user clarifies a product ("same product", "L size", "that's the floating one"), re-match against the inventory catalog below — short names and long descriptions refer to the same SKU when brand + type + size + weight align.

PRODUCT MATCHING (critical for fish food & supplies):
Staff often say LONG phrases; inventory may use SHORT names (or vice versa). Examples that can be the SAME item:
  • "20kg Shori Sinking L/M" = "Shori sinking pellets large" = "JPD Shori Sinking 20kg"
  • "15kg Shori Growth M" = "Shori Growth floating M size 15kg" ONLY if catalog item is Growth/Floating — sinking ≠ floating.
Rules: match brand (Shori/JPD/Akafuji) + type (sinking/floating/growth) + weight (15kg/20kg) + size (L/M/S). "L/M" in catalog = one SKU for L or M.
If two lines sound similar, call get_business_data query=products before billing. Use the catalog name in invoices once matched.

NATURAL LANGUAGE:
Users speak casually. Infer names from live data (first names ok). Defaults: qty=1, prices from catalog, invoice due = today+7.
Convert "tomorrow", "next Friday" → YYYY-MM-DD / HH:MM before tools.
Phrase mapping:
  • paid / settled → mark_invoice_paid
  • bill / invoice / charge → create_invoice
  • cancel / void invoice → cancel_invoice (needs user confirmation)
  • sell koi / mark sold → sell_koi (confirmation)
  • refund koi → refund_koi_sale (confirmation)
  • stock in (existing product) → restock_product
  • add new product / from receipt → create_product (one) or create_products (many lines)
  • deliver → schedule_delivery (postal + address, no area field)
  • delete / remove → matching delete_* tool (confirmation)
  • edit / update → matching update_* tool (confirmation)
  • open / show → navigate_to
  • how much / low stock / ponds → get_business_data

APP MODULES: dashboard, inventory, koifish (farm stock), customerkoi (kept for customers), ponds, invoices, customers, expenses, deliveries, calendar, chat.

RISKY ACTIONS: cancel_invoice, delete_*, refund_koi_sale, sell_koi, update_* — the app asks the USER to confirm before running. Explain what will happen; do not say it is done until confirmed.

USER: ${currentUser?.displayName || currentUser?.name || 'User'} (${role})
${isOwner ? 'Owner — full access.' : `Staff permissions: ${perms.join(', ') || 'view only'}. Edit/delete/refund need Team & Permissions grants.`}
Today: ${now}

Snapshot: ${snapshotParts.join(' · ') || 'limited access — use get_business_data for permitted modules'}
${can('invoices') ? `Pending invoices: ${pending.length} · Overdue: ${overdue.length}\nRevenue (paid): ${formatSGD(paid.reduce((s, i) => s + calcInvoiceAmounts(i).total, 0))}` : ''}
${can('expenses') ? `Expense receipts: ${expenses.length}` : ''}
${can('inventory') ? `Low stock: ${lowStock.length ? lowStock.map((p) => p.name).join(', ') : 'none'}` : ''}

${can('koifish') ? `KOI STOCK: ${koiAvailable.slice(0, 15).map((k) => `${k.id} ${k.name || k.variety} ${formatKoiSize(k.size)} ${k.status} ${k.price ? formatSGD(k.price) : ''}`).join('; ') || 'none'}` : ''}

${can('customers') ? `Customers: ${customers.slice(0, 20).map((c) => `${c.name} (${c.whatsapp || c.phone || '—'}, ${calcCustomerTier(c.totalSpent)})`).join('; ') || 'none'}` : ''}

${can('inventory') ? `Products (${products.length}): ${products.slice(0, 50).map(formatProductCatalogEntry).join(' || ') || 'none'}` : ''}

${can('invoices') ? `Pending: ${pending.slice(0, 10).map((i) => `${i.id} ${i.customerName} ${formatSGD(calcInvoiceAmounts(i).total)}`).join('; ') || 'none'}` : ''}

${can('deliveries') ? `Deliveries active: ${deliveries.filter((d) => ['scheduled', 'transit'].includes(d.status)).slice(0, 8).map((d) => `${d.id} ${d.customerName}`).join('; ') || 'none'}` : ''}

${can('calendar') ? `Upcoming events: ${events.filter((e) => (e.date || '') >= now).slice(0, 8).map((e) => `${e.date} ${e.time || ''} ${e.title}`).join('; ') || 'none'}` : ''}

NEVER claim success without calling a tool first.`
}

export async function executeAiAction(name, args, ctx) {
  const { currentUser, addNotification, onNavigate } = ctx
  const a = normalizeArgs(name, args || {}, ctx)

  try {
    switch (name) {
      case 'navigate_to': {
        const section = a.section
        if (!canDo(currentUser, section)) {
          return { success: false, error: `No permission for ${section}` }
        }
        onNavigate?.(section)
        return { success: true, message: `Opened ${section}` }
      }

      case 'get_business_data': {
        const q = a.query || 'summary'
        const QUERY_PERM = {
          low_stock: 'inventory',
          products: 'inventory',
          pending_invoices: 'invoices',
          overdue_invoices: 'invoices',
          today_deliveries: 'deliveries',
          today_events: 'calendar',
          customers: 'customers',
          koi_stock: 'koifish',
          sold_koi: 'koifish',
          customer_koi: 'customerkoi',
          ponds: 'ponds',
        }
        if (q !== 'summary') {
          const perm = QUERY_PERM[q]
          if (perm && !canDo(currentUser, perm)) {
            return { success: false, error: `No permission for ${perm}` }
          }
        }
        const data = {}
        if ((q === 'summary' || q === 'low_stock') && canDo(currentUser, 'inventory')) {
          data.lowStock = ctx.products.filter((p) => isStockTracked(p) && p.minStock > 0 && p.stock <= p.minStock).map((p) => ({
            name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit,
          }))
        }
        if ((q === 'summary' || q === 'pending_invoices') && canDo(currentUser, 'invoices')) {
          data.pendingInvoices = ctx.invoices.filter((i) => getInvoiceStatus(i) === 'pending').map((i) => ({
            id: i.id, customer: i.customerName, total: calcInvoiceAmounts(i).total, due: i.due,
          }))
        }
        if ((q === 'summary' || q === 'overdue_invoices') && canDo(currentUser, 'invoices')) {
          data.overdueInvoices = ctx.invoices.filter((i) => getInvoiceStatus(i) === 'overdue').map((i) => ({
            id: i.id, customer: i.customerName, total: calcInvoiceAmounts(i).total, due: i.due,
          }))
        }
        if ((q === 'summary' || q === 'today_deliveries') && canDo(currentUser, 'deliveries')) {
          const d = today()
          data.todayDeliveries = ctx.deliveries.filter((x) => x.schedule?.startsWith(d))
        }
        if ((q === 'summary' || q === 'today_events') && canDo(currentUser, 'calendar')) {
          data.todayEvents = filterTodayEvents(ctx.events, today())
            .map((x) => ({ title: x.title, time: x.time, type: x.type, note: x.note }))
        }
        if ((q === 'summary' || q === 'customers') && canDo(currentUser, 'customers')) {
          data.customers = ctx.customers.map((c) => ({
            name: c.name, tier: calcCustomerTier(c.totalSpent), postalCode: c.postalCode, whatsapp: c.whatsapp || c.phone,
          }))
        }
        if ((q === 'summary' || q === 'products') && canDo(currentUser, 'inventory')) {
          data.products = ctx.products.map((p) => ({
            name: p.name,
            description: p.description || '',
            sku: p.sku || '',
            category: p.category || '',
            stock: p.stock,
            price: p.price,
            unit: p.unit,
          }))
        }
        if (q === 'koi_stock' && canDo(currentUser, 'koifish')) {
          data.koiStock = (ctx.koiFishList || []).filter((k) => k.status !== KOI_STATUS.SOLD).map((k) => ({
            id: k.id, name: k.name, variety: k.variety, size: formatKoiSize(k.size), status: k.status, price: k.price, pond: k.pondName,
          }))
        }
        if (q === 'sold_koi' && canDo(currentUser, 'koifish')) {
          data.soldKoi = (ctx.koiFishList || []).filter((k) => k.status === KOI_STATUS.SOLD).map((k) => {
            const cust = ctx.customers.find((c) => String(c.id) === String(k.soldTo))
            return {
              id: k.id, name: k.name || k.variety, customer: cust?.name, soldPrice: k.soldPrice, soldDate: k.soldDate,
              disposition: k.sellDisposition,
            }
          })
        }
        if (q === 'customer_koi' && canDo(currentUser, 'customerkoi')) {
          data.customerKoi = (ctx.customerKoiList || []).map((r) => ({
            id: r.id, customer: r.customerName, koiId: r.koiId, fish: r.fishName || r.variety, pond: r.pondName, status: r.status,
          }))
        }
        if (q === 'ponds' && canDo(currentUser, 'ponds')) {
          data.ponds = (ctx.pondData?.ponds || []).map((p) => ({
            name: p.name || p.id, type: p.type, volume: p.volume,
            lastpH: p.lastpH, lastAmmonia: p.lastAmmonia, lastNitrite: p.lastNitrite, lastSalt: p.lastSalt,
          }))
        }
        if (q === 'summary') {
          data.totals = {}
          if (canDo(currentUser, 'customers')) data.totals.customers = ctx.customers.length
          if (canDo(currentUser, 'koifish')) {
            data.totals.koiStock = (ctx.koiFishList || []).filter((k) => k.status !== KOI_STATUS.SOLD).length
          }
          if (canDo(currentUser, 'invoices')) {
            data.totals.revenue = ctx.invoices
              .filter((i) => getInvoiceStatus(i) === 'paid')
              .reduce((s, i) => s + calcInvoiceAmounts(i).total, 0)
          }
          if (canDo(currentUser, 'expenses')) data.totals.expenseReceipts = ctx.expenses.length
        }
        const summaryParts = []
        if (data.lowStock?.length) summaryParts.push(`Low stock: ${data.lowStock.map((p) => p.name).join(', ')}`)
        if (data.pendingInvoices?.length) summaryParts.push(`${data.pendingInvoices.length} pending invoice(s)`)
        if (data.overdueInvoices?.length) summaryParts.push(`${data.overdueInvoices.length} overdue invoice(s)`)
        if (data.todayDeliveries?.length) summaryParts.push(`${data.todayDeliveries.length} delivery(ies) today`)
        if (data.todayEvents?.length) summaryParts.push(`${data.todayEvents.length} event(s) today`)
        if (data.koiStock?.length) summaryParts.push(`${data.koiStock.length} koi in stock`)
        if (data.soldKoi?.length) summaryParts.push(`${data.soldKoi.length} sold koi`)
        if (data.customerKoi?.length) summaryParts.push(`${data.customerKoi.length} customer koi at farm`)
        if (data.ponds?.length) summaryParts.push(`${data.ponds.length} pond(s)`)
        if (data.totals && Object.keys(data.totals).length) {
          const totalParts = []
          if (data.totals.customers != null) totalParts.push(`${data.totals.customers} customers`)
          if (data.totals.koiStock != null) totalParts.push(`${data.totals.koiStock} koi`)
          if (data.totals.revenue != null) totalParts.push(`${formatSGD(data.totals.revenue)} revenue`)
          if (data.totals.expenseReceipts != null) totalParts.push(`${data.totals.expenseReceipts} expense receipts`)
          if (totalParts.length) summaryParts.push(totalParts.join(', '))
        }
        return {
          success: true,
          data,
          message: summaryParts.length ? summaryParts.join(' · ') : `Loaded ${q} data`,
        }
      }

      case 'create_invoice': {
        if (!canDo(currentUser, 'invoices')) return { success: false, error: 'No permission for invoices' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const customerName = a.customerName?.trim()
        const { items, errors } = resolveInvoiceItems(a.items, ctx)
        if (!customerName) return { success: false, error: 'Could not determine customer — who is this invoice for?' }
        if (errors.length) return { success: false, error: errors.join('; ') }
        if (!items.length) return { success: false, error: 'No valid items — what should be billed?' }

        const customer = findCustomer(ctx, customerName)
        const displayName = customer?.name || customerName
        const discountType = ['fixed', 'percent'].includes(a.discountType) ? a.discountType : 'none'
        const discountValue = Number(a.discountValue ?? a.discount) || 0
        const shipping = Number(a.shipping) || 0
        const { total } = calcInvoiceAmounts({ items, discountType, discountValue, shipping })
        const issueDate = today()
        const customerDetails = resolveInvoiceCustomer(
          { customerId: customer?.id || '', customerName: displayName },
          ctx.customers,
        )
        const invId = genInvoiceId(ctx.invoices, issueDate)
        const invoiceItems = items.map(serializeInvoiceItem)
        const stockSideEffectMeta = { invoiceId: invId, by: currentUser?.name || 'Staff' }
        const stockPreview = previewDeductStockForInvoice(
          ctx.products,
          ctx.stockLog,
          invoiceItems,
          stockSideEffectMeta,
        )
        const koiValidate = validateInvoiceKoiSales({
          items,
          koiList: ctx.koiFishList,
          customerId: customer?.id,
          customers: ctx.customers,
        })
        if (!koiValidate.ok) return { success: false, error: koiValidate.message }
        if (!stockPreview.ok) return { success: false, error: stockPreview.message }
        applyStockPreview(ctx.setProducts, ctx.setStockLog, stockPreview)

        const koiSalePreview = previewApplyInvoiceKoiSales({
          items,
          koiList: ctx.koiFishList,
          customerId: customer?.id,
          customers: ctx.customers,
          soldDate: issueDate,
        })
        let koiApply
        try {
          koiApply = await applyInvoiceKoiSales({
            items,
            koiList: ctx.koiFishList,
            setKoiList: ctx.setKoiFishList,
            customerId: customer?.id,
            customers: ctx.customers,
            soldDate: issueDate,
            onKoiSold: ctx.onKoiSold,
            addNotification,
          })
        } catch (err) {
          restoreStockForInvoice(ctx.setProducts, ctx.setStockLog, ctx.products, invoiceItems, stockSideEffectMeta)
          return { success: false, error: err?.message || 'Could not save Customer Koi record for this sale.' }
        }
        if (!koiApply.ok) {
          restoreStockForInvoice(ctx.setProducts, ctx.setStockLog, ctx.products, invoiceItems, stockSideEffectMeta)
          return { success: false, error: koiApply.message }
        }

        const inv = touchUpdatedAt(sanitizeInvoiceForSync({
          id: invId,
          customerId: customer?.id ?? null,
          customerName: displayName,
          customerWhatsapp: customerDetails.phone,
          customerPhone: customerDetails.phone,
          customerAddress: customerDetails.address || formatCustomerAddress(customer),
          items: invoiceItems,
          discountType: discountType === 'none' ? 'none' : discountType,
          discountValue: discountType === 'none' ? 0 : discountValue,
          shipping,
          total,
          status: 'pending',
          date: issueDate,
          due: a.due || issueDate,
          notes: a.notes || '',
          createdBy: currentUser.name,
        }))

        if (ctx.onCreateInvoiceCloud) {
          try {
            await ctx.onCreateInvoiceCloud(inv, {
              koiFishList: koiSalePreview.hasKoiLines ? koiSalePreview.nextKoiList : undefined,
              nextProducts: stockPreview.hasStockLines ? stockPreview.nextProducts : undefined,
              nextStockLog: stockPreview.hasStockLines ? stockPreview.nextStockLog : undefined,
              revertStock: stockPreview.hasStockLines
                ? previewRestoreStockForInvoice(ctx.products, ctx.stockLog, invoiceItems, stockSideEffectMeta)
                : undefined,
              revertKoi: koiSalePreview.hasKoiLines
                ? previewRestoreInvoiceKoiSales(invoiceItems, koiSalePreview.nextKoiList, ctx.customerKoiList)
                : undefined,
            })
          } catch (err) {
            restoreStockForInvoice(ctx.setProducts, ctx.setStockLog, ctx.products, invoiceItems, stockSideEffectMeta)
            restoreInvoiceKoiSales(invoiceItems, ctx.setKoiFishList, ctx.setCustomerKoiList, {
              koiList: ctx.koiFishList,
              customerKoiList: ctx.customerKoiList,
            })
            ctx.setInvoices((prev) => prev.filter((i) => String(i.id) !== String(invId)))
            if (stockPreview.hasStockLines) {
              const restoredStock = previewRestoreStockForInvoice(
                ctx.products,
                ctx.stockLog,
                invoiceItems,
                stockSideEffectMeta,
              )
              try {
                await ctx.onSyncInventoryToCloud?.(restoredStock.nextProducts, restoredStock.nextStockLog)
              } catch (syncErr) {
                addNotification?.({
                  type: 'warning',
                  title: 'Stock Sync Incomplete',
                  message: syncErr?.message || 'Local stock was restored but cloud sync may need a retry.',
                })
              }
            }
            if (koiSalePreview.hasKoiLines) {
              const restored = previewRestoreInvoiceKoiSales(
                invoiceItems,
                koiSalePreview.nextKoiList,
                ctx.customerKoiList,
              )
              try {
                await ctx.onSyncKoiFishToCloud?.(restored.nextKoiList)
              } catch (syncErr) {
                addNotification?.({
                  type: 'warning',
                  title: 'Koi Sync Incomplete',
                  message: syncErr?.message || 'Local koi was restored but cloud sync may need a retry.',
                })
              }
              try {
                await ctx.onSyncCustomerKoiToCloud?.(restored.nextCustomerKoiList)
              } catch (syncErr) {
                addNotification?.({
                  type: 'warning',
                  title: 'Customer Koi Sync Incomplete',
                  message: syncErr?.message || 'Local customer koi was restored but cloud sync may need a retry.',
                })
              }
            }
            return { success: false, error: err?.message || 'Could not save invoice to cloud.' }
          }
        } else {
          ctx.setInvoices((prev) => [inv, ...prev])
        }
        addNotification?.({ type: 'success', title: 'Invoice Created (AI)', message: `${inv.id} for ${displayName} — ${formatSGD(total)}` })
        onNavigate?.('invoices')
        return { success: true, message: `Created ${inv.id} for ${displayName}, total ${formatSGD(total)}` }
      }

      case 'mark_invoice_paid': {
        if (!canDo(currentUser, 'invoices')) return { success: false, error: 'No permission for invoices' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const inv = findInvoice(ctx, a)
        if (!inv) return { success: false, error: 'No matching unpaid invoice found' }
        if (getInvoiceStatus(inv) === 'paid') return { success: false, error: `${inv.id} is already paid` }
        if (!['pending', 'overdue'].includes(getInvoiceStatus(inv))) {
          return { success: false, error: `${inv.id} cannot be marked paid (${getInvoiceStatus(inv)})` }
        }

        const paidTotal = calcInvoiceAmounts(inv).total

        if (ctx.onMarkInvoicePaid) {
          try {
            await ctx.onMarkInvoicePaid(inv, paidTotal)
          } catch (err) {
            return { success: false, error: err?.message || `${inv.id} could not be saved to cloud.` }
          }
        } else {
          const optimistic = touchUpdatedAt(sanitizeInvoiceForSync({ ...inv, status: 'paid' }))
          ctx.setInvoices((prev) => prev.map((i) => (
            String(i.id) === String(inv.id) ? optimistic : i
          )))
          if (inv.customerId != null && inv.customerId !== '') {
            ctx.setCustomers((prev) => prev.map((c) => {
              if (String(c.id) !== String(inv.customerId)) return c
              const totalSpent = (Number(c.totalSpent) || 0) + paidTotal
              return touchUpdatedAt({ ...c, totalSpent, tier: calcCustomerTier(totalSpent) })
            }))
          }
        }

        addNotification?.({ type: 'success', title: 'Payment Received (AI)', message: `${inv.id} — ${formatSGD(paidTotal)}` })
        onNavigate?.('invoices')
        return { success: true, message: `Marked ${inv.id} (${inv.customerName}) as paid — ${formatSGD(paidTotal)}` }
      }

      case 'create_customer': {
        if (!canDo(currentUser, 'customers')) return { success: false, error: 'No permission for customers' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const built = buildNewCustomerRecord({
          name: a.name,
          whatsapp: a.whatsapp || a.phone,
          postalCode: a.postalCode,
          address: a.address,
          fishTypes: a.fishTypes,
          notes: a.notes,
        }, {
          existingCustomers: ctx.customers,
          cloudIds: Boolean(ctx.isSupabaseConfigured),
        })
        if (!built.ok) return { success: false, error: built.message }
        if (isDuplicateCustomerName(ctx.customers, built.customer.name)) {
          return { success: false, error: `Customer "${built.customer.name}" already exists` }
        }
        const snapshot = ctx.customers
        const nextCustomers = [...snapshot, built.customer]
        try {
          await writeCloudFirst({
            snapshot,
            next: nextCustomers,
            setState: (n) => ctx.setCustomers(n),
            flush: (n) => ctx.onPersistCustomers?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not save customer to cloud.' }
        }
        addNotification?.({ type: 'success', title: 'Customer Added (AI)', message: built.customer.name })
        onNavigate?.('customers')
        return { success: true, message: `Added customer ${built.customer.name}` }
      }

      case 'create_product': {
        if (!canDo(currentUser, 'inventory')) return { success: false, error: 'No permission for inventory' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const name = (a.name || a.productName)?.trim()
        if (!name) return { success: false, error: 'Product name required' }
        const existing = findProduct(ctx, name)
        if (existing) {
          return {
            success: false,
            error: `"${name}" already exists as "${existing.name}". Use restock_product to add stock.`,
          }
        }
        const product = buildProductFromArgs(a, Date.now())
        const productsSnapshot = ctx.products
        const stockSnapshot = ctx.stockLog
        const nextProducts = [...productsSnapshot, product]
        let nextStockLog = stockSnapshot
        if (product.stock > 0) {
          nextStockLog = [
            buildStockLogEntry(product, 'restock', { qty: product.stock, note: 'AI initial stock', by: currentUser.name }),
            ...stockSnapshot,
          ]
        }
        try {
          await writeInventoryCloudFirst({
            nextProducts,
            nextStockLog,
            setProducts: (n) => ctx.setProducts(n),
            setStockLog: (n) => ctx.setStockLog(n),
            flush: (p, s) => ctx.onSyncInventoryToCloud?.(p, s),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not save product to cloud.' }
        }
        addNotification?.({ type: 'success', title: 'Product Added (AI)', message: product.name })
        onNavigate?.('inventory')
        return {
          success: true,
          message: `Added ${product.name} — ${product.stock} ${product.unit}, ${formatSGD(product.price)}`,
        }
      }

      case 'create_products': {
        if (!canDo(currentUser, 'inventory')) return { success: false, error: 'No permission for inventory' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const lines = Array.isArray(a.products) ? a.products : []
        if (!lines.length) return { success: false, error: 'No products to add' }

        const catalog = [...ctx.products]
        const newProducts = []
        const newLogEntries = []
        const created = []
        const skipped = []
        const failed = []
        let idBase = Date.now()

        for (let i = 0; i < lines.length; i++) {
          const line = normalizeArgs('create_product', lines[i], ctx)
          const name = line.name?.trim()
          if (!name) {
            failed.push('Unnamed product line skipped')
            continue
          }
          const existing = findProductInCatalog(catalog, name)
          if (existing) {
            skipped.push(`${name} (exists as ${existing.name})`)
            continue
          }
          const product = buildProductFromArgs(line, idBase + i)
          catalog.push(product)
          newProducts.push(product)
          if (product.stock > 0) {
            newLogEntries.push(buildStockLogEntry(product, 'restock', {
              qty: product.stock,
              note: 'AI receipt import',
              by: currentUser.name,
            }))
          }
          created.push(`${product.name} (${product.stock} ${product.unit})`)
        }

        if (newProducts.length) {
          const productsSnapshot = ctx.products
          const stockSnapshot = ctx.stockLog
          const nextProducts = [...productsSnapshot, ...newProducts]
          const nextStockLog = newLogEntries.length ? [...newLogEntries, ...stockSnapshot] : stockSnapshot
          try {
            await writeInventoryCloudFirst({
              nextProducts,
              nextStockLog,
              setProducts: (n) => ctx.setProducts(n),
              setStockLog: (n) => ctx.setStockLog(n),
              flush: (p, s) => ctx.onSyncInventoryToCloud?.(p, s),
            })
          } catch (err) {
            return { success: false, error: err?.message || 'Could not save products to cloud.' }
          }
          addNotification?.({
            type: 'success',
            title: 'Products Added (AI)',
            message: `${newProducts.length} product(s) added`,
          })
          onNavigate?.('inventory')
        }

        const parts = []
        if (created.length) parts.push(`Added ${created.length}: ${created.join('; ')}`)
        if (skipped.length) parts.push(`Skipped existing: ${skipped.join('; ')}`)
        if (failed.length) parts.push(failed.join('; '))

        if (!created.length) {
          return {
            success: false,
            error: parts.join(' · ') || 'No new products were added',
          }
        }
        return { success: true, message: parts.join(' · ') }
      }

      case 'restock_product': {
        if (!canDo(currentUser, 'inventory')) return { success: false, error: 'No permission for inventory' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const product = findProduct(ctx, a.productName)
        if (!product) {
          const near = findProductCandidates(ctx.products, a.productName, 3)
          return {
            success: false,
            error: near.length
              ? `Could not find "${a.productName}". Did you mean: ${near.map((p) => p.name).join(', ')}?`
              : `Could not find product matching "${a.productName}"`,
          }
        }
        const qty = parseQuantity(a.quantity)
        if (!qty || qty <= 0) return { success: false, error: 'How much stock to add?' }

        const productsSnapshot = ctx.products
        const stockSnapshot = ctx.stockLog
        const nextProducts = adjustProductStockInList(productsSnapshot, product.id, qty)
        const nextStockLog = [
          buildStockLogEntry(product, 'restock', { qty, note: 'AI restock', by: currentUser.name }),
          ...stockSnapshot,
        ]
        try {
          await writeInventoryCloudFirst({
            nextProducts,
            nextStockLog,
            setProducts: (n) => ctx.setProducts(n),
            setStockLog: (n) => ctx.setStockLog(n),
            flush: (p, s) => ctx.onSyncInventoryToCloud?.(p, s),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not restock product on cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Restocked (AI)', message: `${product.name} +${qty} ${product.unit}` })
        onNavigate?.('inventory')
        const matched = productMatchHint(a.productName, product)
        return {
          success: true,
          message: `Restocked ${product.name} by ${qty} ${product.unit}. New stock: ${product.stock + qty}${matched && matched !== product.name ? ` (matched from "${a.productName}")` : ''}`,
        }
      }

      case 'add_expense': {
        if (!canDo(currentUser, 'expenses')) return { success: false, error: 'No permission for expenses' }
        const imageData = a.imageData || a.image || a.receiptImage
        if (imageData?.startsWith?.('data:image/')) {
          if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
          const built = buildExpenseReceiptRecord({
            imageData,
            imageName: a.imageName || 'receipt.jpg',
            date: a.date || today(),
            note: a.note,
            addedBy: currentUser?.name || 'Staff',
          })
          if (!built.ok) return { success: false, error: built.message }
          const snapshot = ctx.expenses
          const nextExpenses = [...snapshot, built.expense]
          ctx.setExpenses(nextExpenses)
          try {
            await ctx.onPersistExpenses?.(nextExpenses)
          } catch (err) {
            ctx.setExpenses(snapshot)
            return { success: false, error: err?.message || 'Could not save expense to cloud.' }
          }
          onNavigate?.('expenses')
          addNotification?.({
            type: 'success',
            title: 'Receipt Saved',
            message: 'Expense receipt photo recorded from chat.',
          })
          return { success: true, message: 'Expense receipt saved.' }
        }
        onNavigate?.('expenses')
        return {
          success: false,
          error: 'Expenses are saved as receipt photos. Open Expenses and tap Upload Receipt to add the invoice image.',
        }
      }

      case 'schedule_delivery': {
        if (!canDo(currentUser, 'deliveries')) return { success: false, error: 'No permission for deliveries' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const customer = findCustomer(ctx, a.customerName)
        const fromCustomer = customerDeliveryFields(customer)
        const displayName = customer?.name || a.customerName?.trim()
        let invoiceFields = {}
        if (a.invoiceId) {
          const inv = ctx.invoices.find((i) => String(i.id) === String(a.invoiceId))
          if (inv) {
            invoiceFields = {
              invoiceId: inv.id,
              customerId: inv.customerId != null ? String(inv.customerId) : fromCustomer.customerId,
              customerName: inv.customerName || displayName,
              postalCode: a.postalCode || fromCustomer.postalCode || '',
              address: a.address || inv.customerAddress || fromCustomer.address || '',
              items: a.items || '',
            }
          }
        }
        const built = buildNewDeliveryRecord({
          invoiceId: invoiceFields.invoiceId || a.invoiceId || '',
          customerId: invoiceFields.customerId || fromCustomer.customerId || null,
          customerName: invoiceFields.customerName || displayName,
          postalCode: invoiceFields.postalCode || a.postalCode || fromCustomer.postalCode || '',
          address: invoiceFields.address || a.address || fromCustomer.address || '',
          schedule: a.schedule,
          items: invoiceFields.items || a.items || '',
          driver: a.driver || '',
          notes: a.notes || '',
        }, {
          customers: ctx.customers,
          invoices: ctx.invoices,
          createdBy: currentUser.name,
        })
        if (!built.ok) return { success: false, error: built.message }
        const d = built.delivery
        const snapshot = ctx.deliveries
        const nextDeliveries = [...snapshot, d]
        try {
          await writeCloudFirst({
            snapshot,
            next: nextDeliveries,
            setState: (n) => ctx.setDeliveries(n),
            flush: (n) => ctx.onPersistDeliveries?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not schedule delivery on cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Delivery Scheduled (AI)', message: `${d.id} → ${d.customerName}` })
        onNavigate?.('deliveries')
        return { success: true, message: `Scheduled ${d.id} for ${d.customerName} at ${d.schedule}` }
      }

      case 'update_delivery_status': {
        if (!canDo(currentUser, 'deliveries')) return { success: false, error: 'No permission for deliveries' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const del = findDelivery(ctx, a)
        if (!del) return { success: false, error: 'No matching delivery found' }
        const status = resolveStatus(a.status)
        const built = buildDeliveryStatusPatch(status, del)
        if (!built.ok) return { success: false, error: built.message }
        const snapshot = ctx.deliveries
        const nextDeliveries = snapshot.map((d) => (
          sameDeliveryId(d.id, del.id) ? touchUpdatedAt({ ...d, ...built.patch }) : d
        ))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextDeliveries,
            setState: (n) => ctx.setDeliveries(n),
            flush: (n) => ctx.onPersistDeliveries?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not update delivery on cloud.' }
        }
        if (status === 'delivered') {
          addNotification?.({ type: 'success', title: 'Delivery Completed (AI)', message: `${del.id} delivered` })
        }
        onNavigate?.('deliveries')
        return { success: true, message: `Updated ${del.id} (${del.customerName}) → ${status}` }
      }

      case 'create_calendar_event': {
        if (!canDo(currentUser, 'calendar')) return { success: false, error: 'No permission for calendar' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const built = buildNewEventRecord({
          title: a.title,
          date: a.date || today(),
          time: a.time,
          type: a.type,
          note: a.note,
        }, {
          createdBy: currentUser.name,
          existingEvents: ctx.events,
        })
        if (!built.ok) return { success: false, error: built.message }
        const ev = built.event
        const snapshot = ctx.events
        const nextEvents = [...snapshot, ev]
        try {
          await writeCloudFirst({
            snapshot,
            next: nextEvents,
            setState: (n) => ctx.setEvents(n),
            flush: (n) => ctx.onPersistEvents?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not save event to cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Event Added (AI)', message: ev.title })
        onNavigate?.('calendar')
        return { success: true, message: `Added "${ev.title}" on ${ev.date}` }
      }

      case 'cancel_invoice': {
        if (!canDo(currentUser, 'invoices')) return { success: false, error: 'No permission for invoices' }
        if (!canDelete(currentUser)) return { success: false, error: 'No delete permission — ask the owner to grant Delete records' }
        const inv = findCancellableInvoice(ctx, a)
        if (!inv) return { success: false, error: 'No cancellable invoice found (must be pending or overdue)' }
        if (ctx.onCancelInvoiceCloud) {
          try {
            await ctx.onCancelInvoiceCloud(inv)
          } catch (err) {
            return { success: false, error: err?.message || 'Could not cancel invoice on cloud.' }
          }
        } else {
          restoreStockForInvoice(ctx.setProducts, ctx.setStockLog, ctx.products, inv.items || [], {
            invoiceId: inv.id,
            by: currentUser?.name || 'Staff',
          })
          restoreInvoiceKoiSales(inv.items || [], ctx.setKoiFishList, ctx.setCustomerKoiList, {
            koiList: ctx.koiFishList,
            customerKoiList: ctx.customerKoiList,
          })
          ctx.setInvoices((prev) => prev.map((i) => (
            i.id === inv.id ? touchUpdatedAt(sanitizeInvoiceForSync({ ...i, status: 'cancelled' })) : i
          )))
        }
        addNotification?.({ type: 'info', title: 'Invoice Cancelled (AI)', message: `${inv.id} cancelled. Stock restored.` })
        onNavigate?.('invoices')
        return { success: true, message: `Cancelled ${inv.id} for ${inv.customerName}` }
      }

      case 'update_customer': {
        if (!canDo(currentUser, 'customers')) return { success: false, error: 'No permission for customers' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const customer = findCustomer(ctx, a.name)
        if (!customer) return { success: false, error: `Customer not found: ${a.name}` }
        const built = buildUpdatedCustomerRecord(customer, {
          ...customer,
          name: a.newName || customer.name,
          whatsapp: a.whatsapp ?? customer.whatsapp,
          phone: a.phone ?? customer.phone,
          postalCode: a.postalCode ?? customer.postalCode,
          address: a.address ?? customer.address,
          fishTypes: a.fishTypes ?? customer.fishTypes,
          notes: a.notes ?? customer.notes,
        })
        if (!built.ok) return { success: false, error: built.message }
        if (isDuplicateCustomerName(ctx.customers, built.customer.name, built.customer.id)) {
          return { success: false, error: `Another customer is already named "${built.customer.name}"` }
        }
        const snapshot = ctx.customers
        const nextCustomers = snapshot.map((c) => (sameCustomerId(c.id, customer.id) ? built.customer : c))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextCustomers,
            setState: (n) => ctx.setCustomers(n),
            flush: (n) => ctx.onPersistCustomers?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not update customer on cloud.' }
        }
        addNotification?.({ type: 'success', title: 'Customer Updated (AI)', message: built.customer.name })
        onNavigate?.('customers')
        return { success: true, message: `Updated ${built.customer.name}` }
      }

      case 'delete_customer': {
        if (!canDo(currentUser, 'customers')) return { success: false, error: 'No permission for customers' }
        if (!canDelete(currentUser)) return { success: false, error: 'No delete permission' }
        const customer = findCustomer(ctx, a.name)
        if (!customer) return { success: false, error: `Customer not found: ${a.name}` }
        const snapshot = ctx.customers
        const nextCustomers = snapshot.filter((c) => !sameCustomerId(c.id, customer.id))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextCustomers,
            setState: (n) => ctx.setCustomers(n),
            flush: (n) => ctx.onPersistCustomers?.(n),
            deleteMeta: { entity: 'customers', id: customer.id },
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not delete customer on cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Customer Deleted (AI)', message: customer.name })
        onNavigate?.('customers')
        return { success: true, message: `Deleted customer ${customer.name}` }
      }

      case 'delete_product': {
        if (!canDo(currentUser, 'inventory')) return { success: false, error: 'No permission for inventory' }
        if (!canDelete(currentUser)) return { success: false, error: 'No delete permission' }
        const product = findProduct(ctx, a.productName)
        if (!product) return { success: false, error: `Product not found: ${a.productName}` }
        const snapshot = ctx.products
        const nextProducts = snapshot.filter((p) => p.id !== product.id)
        try {
          await writeCloudFirst({
            snapshot,
            next: nextProducts,
            setState: (n) => ctx.setProducts(n),
            flush: (n) => ctx.onProductsSaved?.(n),
            deleteMeta: { entity: 'products', id: product.id },
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not delete product on cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Product Deleted (AI)', message: product.name })
        onNavigate?.('inventory')
        return { success: true, message: `Removed ${product.name} from inventory` }
      }

      case 'sell_koi': {
        if (!canDo(currentUser, 'koifish')) return { success: false, error: 'No permission for Koi Fish' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const customer = findCustomer(ctx, a.customerName)
        if (!customer) return { success: false, error: `Customer not found: ${a.customerName}` }
        const koi = findKoi(ctx, a)
        if (!koi) return { success: false, error: 'Koi not found in stock' }
        const disposition = a.disposition === 'keep' ? 'keep' : 'taken'
        const keepPondName = a.keepPondName?.trim() || koi.pondName || ''
        const saleCheck = validateKoiSaleForm({
          customerId: customer.id,
          disposition,
          keepPondName,
          soldPrice: a.soldPrice ?? koi.price,
          soldDate: a.soldDate || today(),
          koi,
        })
        if (!saleCheck.ok) return { success: false, error: saleCheck.message }
        const soldPrice = saleCheck.soldPrice
        const soldDate = saleCheck.soldDate
        const soldPatch = buildSoldKoiPatch(koi, {
          customerId: customer.id,
          soldPrice,
          soldDate,
          disposition,
          keepPondName,
        })
        const nextKoiList = ctx.koiFishList.map((k) => (sameKoiId(k.id, koi.id) ? soldPatch : k))
        if (disposition === 'keep') {
          try {
            await ctx.onKoiSold?.(koi, customer, soldPrice, soldDate, { disposition, keepPondName })
          } catch (err) {
            return { success: false, error: err?.message || 'Could not save Customer Koi record for this sale.' }
          }
        }
        try {
          await writeListCloudFirst({
            snapshot: ctx.koiFishList,
            next: nextKoiList,
            setState: (n) => ctx.setKoiFishList(n),
            flush: (n) => ctx.onSyncKoiFish?.(n),
            isCloudConfigured: Boolean(ctx.isSupabaseConfigured),
          })
        } catch (err) {
          if (disposition === 'keep') {
            try {
              await ctx.onKoiRefund?.(soldPatch, { reason: 'Cloud sync failed' })
            } catch {
              /* best-effort rollback of keep-at-farm customer koi */
            }
          }
          return { success: false, error: err?.message || 'Could not sync koi sale to cloud.' }
        }
        const dispositionNote = disposition === 'keep' ? `kept at ${keepPondName}` : 'taken away'
        addNotification?.({
          type: 'success',
          title: 'Koi Sold (AI)',
          message: `${koi.id} → ${customer.name} ${formatSGD(soldPrice)} (${dispositionNote})`,
        })
        if (a.createInvoice !== false && ctx.onCreateInvoiceFromSale) {
          try {
            await ctx.onCreateInvoiceFromSale({
              customerId: String(customer.id),
              customerName: customer.name,
              manualCustomer: false,
              items: [{
                name: formatKoiInvoiceLineName(koi),
                qty: 1,
                price: soldPrice,
                productId: '',
                manual: false,
                koiId: koi.id,
                koiDisposition: disposition,
                keepPondName: disposition === 'keep' ? keepPondName : '',
                koiAlreadySold: true,
              }],
              notes: `Koi sale — ${koi.name || koi.variety} (${koi.id})`,
              due: soldDate,
              discountType: 'none',
              discountValue: '',
            })
          } catch (err) {
            return { success: false, error: err?.message || 'Koi sold but invoice could not be created.' }
          }
        } else {
          onNavigate?.('koifish')
        }
        return { success: true, message: `Sold ${koi.id} to ${customer.name} for ${formatSGD(soldPrice)} (${dispositionNote})` }
      }

      case 'refund_koi_sale': {
        if (!canDo(currentUser, 'koifish')) return { success: false, error: 'No permission for Koi Fish' }
        if (!canRefund(currentUser)) return { success: false, error: 'No refund permission' }
        const koi = findSoldKoi(ctx, a)
        if (!koi) return { success: false, error: 'Sold koi not found' }
        try {
          await ctx.onKoiRefund?.(koi, { reason: a.reason || 'AI refund' })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not sync refund to cloud.' }
        }
        onNavigate?.('koifish')
        return { success: true, message: `Refunded ${koi.id} (${koi.name || koi.variety}) — back in stock` }
      }

      case 'update_delivery': {
        if (!canDo(currentUser, 'deliveries')) return { success: false, error: 'No permission for deliveries' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const del = findDelivery(ctx, a)
        if (!del) return { success: false, error: 'Delivery not found' }
        const built = buildUpdatedDeliveryRecord({
          invoiceId: del.invoiceId,
          customerId: del.customerId,
          customerName: del.customerName,
          postalCode: a.postalCode ?? del.postalCode,
          address: a.address ?? del.address,
          schedule: a.schedule ?? del.schedule,
          status: del.status,
          items: a.items ?? del.items,
          driver: a.driver ?? del.driver,
          notes: a.notes ?? del.notes,
        }, del, {
          customers: ctx.customers,
          invoices: ctx.invoices,
          deliveries: ctx.deliveries,
        })
        if (!built.ok) return { success: false, error: built.message }
        const snapshot = ctx.deliveries
        const nextDeliveries = snapshot.map((d) => (
          sameDeliveryId(d.id, del.id) ? built.delivery : d
        ))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextDeliveries,
            setState: (n) => ctx.setDeliveries(n),
            flush: (n) => ctx.onPersistDeliveries?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not update delivery on cloud.' }
        }
        addNotification?.({ type: 'success', title: 'Delivery Updated (AI)', message: del.id })
        onNavigate?.('deliveries')
        return { success: true, message: `Updated delivery ${del.id}` }
      }

      case 'delete_delivery': {
        if (!canDo(currentUser, 'deliveries')) return { success: false, error: 'No permission for deliveries' }
        if (!canDelete(currentUser)) return { success: false, error: 'No delete permission' }
        const del = findDelivery(ctx, a)
        if (!del) return { success: false, error: 'Delivery not found' }
        const snapshot = ctx.deliveries
        const nextDeliveries = snapshot.filter((d) => !sameDeliveryId(d.id, del.id))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextDeliveries,
            setState: (n) => ctx.setDeliveries(n),
            flush: (n) => ctx.onPersistDeliveries?.(n),
            deleteMeta: { entity: 'deliveries', id: del.id },
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not delete delivery on cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Delivery Deleted (AI)', message: del.id })
        onNavigate?.('deliveries')
        return { success: true, message: `Deleted delivery ${del.id} (${del.customerName})` }
      }

      case 'update_calendar_event': {
        if (!canDo(currentUser, 'calendar')) return { success: false, error: 'No permission for calendar' }
        if (!canEdit(currentUser)) return { success: false, error: 'No edit permission' }
        const ev = findCalendarEvent(ctx, a)
        if (!ev) return { success: false, error: 'Event not found' }
        const built = buildUpdatedEventRecord({
          title: a.newTitle ?? ev.title,
          date: a.newDate ?? ev.date,
          time: a.newTime ?? ev.time,
          type: a.newType ?? ev.type,
          note: a.note ?? ev.note,
        }, ev)
        if (!built.ok) return { success: false, error: built.message }
        const snapshot = ctx.events
        const nextEvents = snapshot.map((e) => (
          sameEventId(e.id, ev.id) ? built.event : e
        ))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextEvents,
            setState: (n) => ctx.setEvents(n),
            flush: (n) => ctx.onPersistEvents?.(n),
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not update event on cloud.' }
        }
        addNotification?.({ type: 'success', title: 'Event Updated (AI)', message: built.event.title })
        onNavigate?.('calendar')
        return { success: true, message: `Updated event "${built.event.title}"` }
      }

      case 'delete_calendar_event': {
        if (!canDo(currentUser, 'calendar')) return { success: false, error: 'No permission for calendar' }
        if (!canDelete(currentUser)) return { success: false, error: 'No delete permission' }
        const ev = findCalendarEvent(ctx, a)
        if (!ev) return { success: false, error: 'Event not found' }
        const snapshot = ctx.events
        const nextEvents = snapshot.filter((e) => !sameEventId(e.id, ev.id))
        try {
          await writeCloudFirst({
            snapshot,
            next: nextEvents,
            setState: (n) => ctx.setEvents(n),
            flush: (n) => ctx.onPersistEvents?.(n),
            deleteMeta: { entity: 'events', id: ev.id },
          })
        } catch (err) {
          return { success: false, error: err?.message || 'Could not delete event on cloud.' }
        }
        addNotification?.({ type: 'info', title: 'Event Deleted (AI)', message: ev.title })
        onNavigate?.('calendar')
        return { success: true, message: `Deleted event "${ev.title}" on ${ev.date}` }
      }

      default:
        return { success: false, error: `Unknown action: ${name}` }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export async function executeAiActions(calls, ctx, options = {}) {
  const { skipRiskCheck = false } = options
  const results = []
  for (const call of calls || []) {
    if (!call?.name || !AI_TOOL_NAMES.has(call.name)) {
      results.push({
        name: call?.name || 'unknown',
        response: { success: false, error: `Unknown action: ${call?.name || 'unknown'}` },
      })
      continue
    }
    if (!skipRiskCheck && isRiskyAiAction(call.name)) {
      results.push({
        name: call.name,
        response: {
          success: false,
          requiresConfirm: true,
          confirmKey: actionConfirmKey(call.name, call.args),
          summary: describeRiskyAction(call.name, call.args, ctx),
          action: { name: call.name, args: call.args || {} },
        },
      })
      continue
    }
    const result = await executeAiAction(call.name, call.args || {}, ctx)
    results.push({ name: call.name, response: result })
  }
  return results
}

/** Run deferred risky actions after the user confirms in AI Chat. */
export async function resolvePendingAiActions(partialResults, ctx) {
  const riskyCalls = partialResults
    .filter((r) => r.response?.requiresConfirm)
    .map((r) => ({ name: r.name, args: r.response.action?.args || {} }))
  if (!riskyCalls.length) return partialResults
  const executed = await executeAiActions(riskyCalls, ctx, { skipRiskCheck: true })
  let execIdx = 0
  return partialResults.map((r) => {
    if (!r.response?.requiresConfirm) return r
    const next = executed[execIdx]
    execIdx += 1
    return next || r
  })
}
