import {
  calcCustomerTier, customerDeliveryFields, EXPENSE_CATEGORIES, formatSGD, genId, genInvoiceId,
  getInvoiceStatus, today,
} from '../data/constants'
import { calcInvoiceAmounts } from './invoiceDesign'
import { formatCustomerAddress, resolveInvoiceCustomer } from './invoiceWhatsApp'
import { deductStockForInvoice, serializeInvoiceItem } from './inventoryStock'

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
  return user?.permissions?.includes(perm)
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
  const direct = findByName(ctx.products, name, 'name')
  if (direct) return direct
  const q = normalizeText(name)
  const aliases = [
    { words: ['pellet', 'pellets', 'koi food', 'koifood'], match: 'koi pellet' },
    { words: ['arowana stick', 'sticks'], match: 'arowana' },
    { words: ['conditioner', 'water treatment'], match: 'conditioner' },
    { words: ['salt', 'pond salt'], match: 'salt' },
    { words: ['pump', 'air pump'], match: 'pump' },
    { words: ['net'], match: 'net' },
    { words: ['parasite', 'medicine'], match: 'parasite' },
    { words: ['filter'], match: 'filter' },
  ]
  for (const { words, match } of aliases) {
    if (words.some((w) => q.includes(w))) {
      const hit = ctx.products.find((p) => normalizeText(p.name).includes(match))
      if (hit) return hit
    }
  }
  return null
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
      errors.push(`No price for "${name}" — not in inventory, please specify price`)
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
    if (!a.discountType && (a.discountPercent || a.percentOff)) {
      a.discountType = 'percent'
      a.discountValue = a.discountPercent ?? a.percentOff
    } else if (!a.discountType && a.discount) {
      a.discountType = 'fixed'
      a.discountValue = a.discount
    }
  }
  if (name === 'restock_product') {
    a.productName = a.productName || a.product || a.item || a.name
    a.quantity = parseQuantity(a.quantity ?? a.qty ?? a.amount)
  }
  if (name === 'schedule_delivery') {
    a.customerName = a.customerName || a.customer || a.name
    if (!a.address && a.customerName) {
      const c = findCustomer(ctx, a.customerName)
      if (c) {
        a.area = a.area || c.area
        a.address = a.address || `TBC — ${c.name}, ${c.area} (contact customer)`
      }
    }
    a.address = a.address || 'TBC — contact customer for address'
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
  const { customers, invoices, expenses, products, deliveries, events, currentUser } = ctx
  const paid = invoices.filter((i) => i.status === 'paid')
  const pending = invoices.filter((i) => getInvoiceStatus(i) === 'pending')
  const overdue = invoices.filter((i) => getInvoiceStatus(i) === 'overdue')
  const lowStock = products.filter((p) => p.stock <= p.minStock)
  const now = today()

  return `You are the AI assistant for Marugen Koi & Arowana Farm in Singapore. Always respond in English.

NATURAL LANGUAGE — CRITICAL:
Users speak casually in everyday language, NOT exact commands. Understand INTENT and tone from the full conversation.
- Infer who/what they mean from live data below (first names ok: "Sarah" → Sarah Lim).
- Fill gaps with sensible defaults: qty=1, prices from inventory, due date = 7 days from today (${now}), expense date = today.
- Convert relative time yourself: "tomorrow", "next Friday", "this afternoon" → concrete YYYY-MM-DD and HH:MM before calling tools.
- Map casual phrases to actions:
  • payment received / they paid / settled → mark_invoice_paid
  • bill / charge / sold / invoice → create_invoice
  • stock arrived / add more / received shipment → restock_product
  • spent / paid for / cost → add_expense
  • deliver / send to / drop off → schedule_delivery
  • delivered / on the way / cancel delivery → update_delivery_status
  • remind / schedule / book → create_calendar_event
  • show me / open / go to → navigate_to
  • how much / what's low / who owes → get_business_data then explain
- Act when intent is clear. Only ask ONE short question if truly ambiguous (e.g. two matching customers).
- NEVER claim an action succeeded without calling the tool first.

Current user: ${currentUser.displayName} (${currentUser.role})
Permissions: ${currentUser.permissions.join(', ')}
Today: ${now}

Customers: ${customers.map((c) => `${c.name} (${c.area}, ${c.tier})`).join('; ') || 'none'}

Products (use these prices when billing): ${products.map((p) => `${p.name} S$${p.price}/${p.unit}, stock ${p.stock}`).join('; ')}

Invoices — pending: ${pending.map((i) => `${i.id} ${i.customerName} ${formatSGD(i.total)}`).join('; ') || 'none'}
Invoices — overdue: ${overdue.map((i) => `${i.id} ${i.customerName}`).join('; ') || 'none'}
Revenue (paid): ${formatSGD(paid.reduce((s, i) => s + i.total, 0))} | Expense receipts: ${expenses.length}

Low stock: ${lowStock.length ? lowStock.map((p) => p.name).join(', ') : 'none'}
Active deliveries: ${deliveries.filter((d) => d.status === 'scheduled' || d.status === 'transit').map((d) => `${d.id} ${d.customerName} ${d.schedule}`).join('; ') || 'none'}
Today's events: ${events.filter((e) => e.date === now).map((e) => `${e.time || ''} ${e.title}`.trim()).join('; ') || 'none'}
Upcoming events: ${events.filter((e) => e.date > now).slice(0, 6).map((e) => `${e.title} (${e.date})`).join('; ') || 'none'}

Fish expertise: Koi care, Arowana care, Singapore areas, pond management.`
}

export function executeAiAction(name, args, ctx) {
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
        const data = {}
        if (q === 'summary' || q === 'low_stock') {
          data.lowStock = ctx.products.filter((p) => p.stock <= p.minStock).map((p) => ({
            name: p.name, stock: p.stock, minStock: p.minStock, unit: p.unit,
          }))
        }
        if (q === 'summary' || q === 'pending_invoices') {
          data.pendingInvoices = ctx.invoices.filter((i) => getInvoiceStatus(i) === 'pending').map((i) => ({
            id: i.id, customer: i.customerName, total: i.total, due: i.due,
          }))
        }
        if (q === 'summary' || q === 'overdue_invoices') {
          data.overdueInvoices = ctx.invoices.filter((i) => getInvoiceStatus(i) === 'overdue').map((i) => ({
            id: i.id, customer: i.customerName, total: i.total, due: i.due,
          }))
        }
        if (q === 'summary' || q === 'today_deliveries') {
          const d = today()
          data.todayDeliveries = ctx.deliveries.filter((x) => x.schedule?.startsWith(d))
        }
        if (q === 'summary' || q === 'today_events') {
          const d = today()
          data.todayEvents = ctx.events
            .filter((x) => x.date === d)
            .sort((a, b) => `${a.time || ''}`.localeCompare(`${b.time || ''}`))
            .map((x) => ({ title: x.title, time: x.time, type: x.type, note: x.note }))
        }
        if (q === 'summary' || q === 'customers') {
          data.customers = ctx.customers.map((c) => ({ name: c.name, tier: c.tier, area: c.area }))
        }
        if (q === 'summary' || q === 'products') {
          data.products = ctx.products.map((p) => ({ name: p.name, stock: p.stock, price: p.price, unit: p.unit }))
        }
        if (q === 'summary') {
          data.totals = {
            customers: ctx.customers.length,
            revenue: ctx.invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.total, 0),
            expenseReceipts: ctx.expenses.length,
          }
        }
        const summaryParts = []
        if (data.lowStock?.length) summaryParts.push(`Low stock: ${data.lowStock.map((p) => p.name).join(', ')}`)
        if (data.pendingInvoices?.length) summaryParts.push(`${data.pendingInvoices.length} pending invoice(s)`)
        if (data.overdueInvoices?.length) summaryParts.push(`${data.overdueInvoices.length} overdue invoice(s)`)
        if (data.todayDeliveries?.length) summaryParts.push(`${data.todayDeliveries.length} delivery(ies) today`)
        if (data.todayEvents?.length) summaryParts.push(`${data.todayEvents.length} event(s) today`)
        if (data.totals) {
          summaryParts.push(`${data.totals.customers} customers, ${formatSGD(data.totals.revenue)} paid revenue`)
        }
        return {
          success: true,
          data,
          message: summaryParts.length ? summaryParts.join(' · ') : `Loaded ${q} data`,
        }
      }

      case 'create_invoice': {
        if (!canDo(currentUser, 'invoices')) return { success: false, error: 'No permission for invoices' }
        const customerName = a.customerName?.trim()
        const { items, errors } = resolveInvoiceItems(a.items, ctx)
        if (!customerName) return { success: false, error: 'Could not determine customer — who is this invoice for?' }
        if (errors.length) return { success: false, error: errors.join('; ') }
        if (!items.length) return { success: false, error: 'No valid items — what should be billed?' }

        const customer = findCustomer(ctx, customerName)
        const displayName = customer?.name || customerName
        const discountType = ['fixed', 'percent'].includes(a.discountType) ? a.discountType : 'none'
        const discountValue = Number(a.discountValue ?? a.discount) || 0
        const { total } = calcInvoiceAmounts({ items, discountType, discountValue })
        const issueDate = today()
        const customerDetails = resolveInvoiceCustomer(
          { customerId: customer?.id || '', customerName: displayName },
          ctx.customers,
        )
        const invId = genInvoiceId(ctx.invoices, issueDate)
        const invoiceItems = items.map(serializeInvoiceItem)
        const stockCheck = deductStockForInvoice(ctx.setProducts, ctx.setStockLog, ctx.products, invoiceItems, {
          invoiceId: invId,
          by: currentUser?.name || 'Staff',
        })
        if (!stockCheck.ok) return { success: false, error: stockCheck.message }

        const inv = {
          id: invId,
          customerId: customer?.id || '',
          customerName: displayName,
          customerWhatsapp: customerDetails.phone,
          customerPhone: customerDetails.phone,
          customerAddress: customerDetails.address || formatCustomerAddress(customer),
          items: invoiceItems,
          discountType: discountType === 'none' ? 'none' : discountType,
          discountValue: discountType === 'none' ? 0 : discountValue,
          total,
          status: 'pending',
          date: issueDate,
          due: a.due || issueDate,
          notes: a.notes || '',
          createdBy: currentUser.name,
        }
        ctx.setInvoices((prev) => [inv, ...prev])
        addNotification?.({ type: 'success', title: 'Invoice Created (AI)', message: `${inv.id} for ${displayName} — ${formatSGD(total)}` })
        onNavigate?.('invoices')
        return { success: true, message: `Created ${inv.id} for ${displayName}, total ${formatSGD(total)}` }
      }

      case 'mark_invoice_paid': {
        if (!canDo(currentUser, 'invoices')) return { success: false, error: 'No permission for invoices' }
        const inv = findInvoice(ctx, a)
        if (!inv) return { success: false, error: 'No matching unpaid invoice found' }
        if (getInvoiceStatus(inv) === 'paid') return { success: false, error: `${inv.id} is already paid` }

        ctx.setInvoices((prev) => prev.map((i) => (i.id === inv.id ? { ...i, status: 'paid' } : i)))
        if (inv.customerId) {
          ctx.setCustomers((prev) => prev.map((c) => {
            if (c.id !== inv.customerId) return c
            const totalSpent = c.totalSpent + inv.total
            return { ...c, totalSpent, tier: calcCustomerTier(totalSpent) }
          }))
        }
        addNotification?.({ type: 'success', title: 'Payment Received (AI)', message: `${inv.id} — ${formatSGD(inv.total)}` })
        onNavigate?.('invoices')
        return { success: true, message: `Marked ${inv.id} (${inv.customerName}) as paid — ${formatSGD(inv.total)}` }
      }

      case 'create_customer': {
        if (!canDo(currentUser, 'customers')) return { success: false, error: 'No permission for customers' }
        const name = a.name?.trim()
        if (!name) return { success: false, error: 'Customer name required' }
        const c = {
          id: Date.now(),
          name,
          phone: a.phone || '',
          whatsapp: a.phone || '',
          area: a.area || 'Tampines',
          fishTypes: a.fishTypes || [],
          tier: 'Bronze',
          notes: a.notes || '',
          totalSpent: 0,
        }
        ctx.setCustomers((prev) => [...prev, c])
        addNotification?.({ type: 'success', title: 'Customer Added (AI)', message: name })
        onNavigate?.('customers')
        return { success: true, message: `Added customer ${name}` }
      }

      case 'restock_product': {
        if (!canDo(currentUser, 'inventory')) return { success: false, error: 'No permission for inventory' }
        const product = findProduct(ctx, a.productName)
        if (!product) return { success: false, error: `Could not find product matching "${a.productName}"` }
        const qty = parseQuantity(a.quantity)
        if (!qty || qty <= 0) return { success: false, error: 'How much stock to add?' }

        ctx.setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, stock: p.stock + qty } : p)))
        ctx.setStockLog((prev) => [{
          id: Date.now(),
          productId: product.id,
          productName: product.name,
          type: 'restock',
          qty,
          note: 'AI restock',
          date: today(),
          by: currentUser.name,
        }, ...prev])
        addNotification?.({ type: 'info', title: 'Restocked (AI)', message: `${product.name} +${qty} ${product.unit}` })
        onNavigate?.('inventory')
        return { success: true, message: `Restocked ${product.name} by ${qty} ${product.unit}. New stock: ${product.stock + qty}` }
      }

      case 'add_expense': {
        if (!canDo(currentUser, 'expenses')) return { success: false, error: 'No permission for expenses' }
        onNavigate?.('expenses')
        return {
          success: false,
          error: 'Expenses are saved as receipt photos. Open Expenses and tap Upload Receipt to add the invoice image.',
        }
      }

      case 'schedule_delivery': {
        if (!canDo(currentUser, 'deliveries')) return { success: false, error: 'No permission for deliveries' }
        const customerName = a.customerName?.trim()
        if (!customerName || !a.schedule) {
          return { success: false, error: 'Need customer and when to deliver' }
        }
        const customer = findCustomer(ctx, customerName)
        const displayName = customer?.name || customerName
        const fromCustomer = customerDeliveryFields(customer)
        const address = (a.address || fromCustomer.address || '').trim()
        if (!address) {
          return {
            success: false,
            error: 'Need a delivery address — add it to the customer profile or include it in your message.',
          }
        }
        const d = {
          id: genId('DEL'),
          customerId: fromCustomer.customerId || null,
          customerName: displayName,
          area: a.area || fromCustomer.area || 'Tampines',
          postalCode: a.postalCode || fromCustomer.postalCode || '',
          address,
          schedule: a.schedule,
          status: 'scheduled',
          items: a.items || '',
          driver: a.driver || '',
          notes: a.notes || '',
          createdBy: currentUser.name,
        }
        ctx.setDeliveries((prev) => [...prev, d])
        addNotification?.({ type: 'info', title: 'Delivery Scheduled (AI)', message: `${d.id} → ${displayName}` })
        onNavigate?.('deliveries')
        return { success: true, message: `Scheduled ${d.id} for ${displayName} at ${a.schedule}` }
      }

      case 'update_delivery_status': {
        if (!canDo(currentUser, 'deliveries')) return { success: false, error: 'No permission for deliveries' }
        const del = findDelivery(ctx, a)
        if (!del) return { success: false, error: 'No matching delivery found' }
        const status = resolveStatus(a.status)
        if (!['scheduled', 'transit', 'delivered', 'cancelled'].includes(status)) {
          return { success: false, error: `Unknown status: ${a.status}` }
        }
        ctx.setDeliveries((prev) => prev.map((d) => (String(d.id) === String(del.id) ? { ...d, status } : d)))
        if (status === 'delivered') {
          addNotification?.({ type: 'success', title: 'Delivery Completed (AI)', message: `${del.id} delivered` })
        }
        onNavigate?.('deliveries')
        return { success: true, message: `Updated ${del.id} (${del.customerName}) → ${status}` }
      }

      case 'create_calendar_event': {
        if (!canDo(currentUser, 'calendar')) return { success: false, error: 'No permission for calendar' }
        const title = a.title?.trim()
        if (!title || !a.date) return { success: false, error: 'Need event title and date' }
        const ev = {
          id: Date.now(),
          title,
          date: a.date,
          time: a.time || '09:00',
          type: a.type || 'other',
          note: a.note || '',
          createdBy: currentUser.name,
        }
        ctx.setEvents((prev) => [...prev, ev])
        addNotification?.({ type: 'info', title: 'Event Added (AI)', message: title })
        onNavigate?.('calendar')
        return { success: true, message: `Added "${title}" on ${a.date}` }
      }

      default:
        return { success: false, error: `Unknown action: ${name}` }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function executeAiActions(calls, ctx) {
  return calls.map((call) => {
    const result = executeAiAction(call.name, call.args || {}, ctx)
    return { name: call.name, response: result }
  })
}
