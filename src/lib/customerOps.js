import { calcCustomerTier, FISH_TYPES, genId, getInvoiceStatus } from '../data/constants'
import { calcInvoiceAmounts } from './invoiceDesign'
import { formatCustomerAddress, normalizeWhatsAppNumber } from './invoiceWhatsApp'
import { touchUpdatedAt } from './syncMeta'

export function sameCustomerId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

/** Sum paid invoice totals linked to a customer (source of truth for dashboard ranking). */
export function customerSpentFromInvoices(customer, invoices = []) {
  return (invoices || [])
    .filter((inv) => getInvoiceStatus(inv) === 'paid' && sameCustomerId(inv.customerId, customer?.id))
    .reduce((sum, inv) => sum + calcInvoiceAmounts(inv).total, 0)
}

/**
 * Dashboard display spend: prefer paid-invoice totals when present, else stored totalSpent.
 */
export function customerSpentForDashboard(customer, invoices = []) {
  const fromInvoices = customerSpentFromInvoices(customer, invoices)
  if (fromInvoices > 0) return fromInvoices
  return Number(customer?.totalSpent) || 0
}

/** Apply paid-invoice total to a registered customer's totalSpent + tier. */
export function applyCustomerPaidDelta(customers, customerId, paidTotal) {
  if (customerId == null || customerId === '') return customers
  const delta = Number(paidTotal) || 0
  if (delta <= 0) return customers
  return customers.map((c) => {
    if (!sameCustomerId(c.id, customerId)) return c
    const totalSpent = (Number(c.totalSpent) || 0) + delta
    return touchUpdatedAt({ ...c, totalSpent, tier: calcCustomerTier(totalSpent) })
  })
}

export function normalizeCustomerPhone(value) {
  const digits = normalizeWhatsAppNumber(value)
  return digits || ''
}

export function validateSingaporePostal(postalCode) {
  if (!postalCode?.trim()) return { ok: true, postalCode: '' }
  const code = String(postalCode).replace(/\D/g, '').slice(0, 6)
  if (code.length !== 6) {
    return { ok: false, message: 'Singapore postal code must be 6 digits.' }
  }
  return { ok: true, postalCode: code }
}

/**
 * @returns {{ ok: true, name: string, whatsapp: string, phone: string, postalCode: string } | { ok: false, message: string }}
 */
export function validateCustomerFields(fields, { requireWhatsApp = true } = {}) {
  const name = fields.name?.trim()
  if (!name) {
    return { ok: false, message: 'Enter the customer name.' }
  }
  const whatsappRaw = (fields.whatsapp ?? fields.phone ?? '').trim()
  if (requireWhatsApp && !whatsappRaw) {
    return { ok: false, message: 'Enter a WhatsApp number.' }
  }
  const whatsapp = normalizeCustomerPhone(whatsappRaw)
  if (requireWhatsApp && !whatsapp) {
    return { ok: false, message: 'Enter a valid WhatsApp number (e.g. +65 9XXX XXXX).' }
  }
  const postalCheck = validateSingaporePostal(fields.postalCode)
  if (!postalCheck.ok) return postalCheck

  const fishTypes = (fields.fishTypes || []).filter((ft) => FISH_TYPES.includes(ft))

  return {
    ok: true,
    name,
    whatsapp,
    phone: whatsapp,
    postalCode: postalCheck.postalCode,
    fishTypes,
  }
}

export function normalizeCustomerRecord(customer) {
  if (!customer) return customer
  const totalSpent = Number(customer.totalSpent) || 0
  const whatsapp = normalizeCustomerPhone(customer.whatsapp || customer.phone)
  const tier = calcCustomerTier(totalSpent)
  return {
    ...customer,
    whatsapp,
    phone: whatsapp || customer.phone || '',
    totalSpent,
    tier,
    postalCode: customer.postalCode ? String(customer.postalCode).replace(/\D/g, '').slice(0, 6) : '',
    fishTypes: (customer.fishTypes || []).filter((ft) => FISH_TYPES.includes(ft)),
  }
}

export function buildNewCustomerRecord(fields) {
  const check = validateCustomerFields(fields)
  if (!check.ok) return check
  return {
    ok: true,
    customer: touchUpdatedAt({
      id: genId('CUST'),
      name: check.name,
      phone: check.phone,
      whatsapp: check.whatsapp,
      area: '',
      postalCode: check.postalCode,
      address: fields.address?.trim() || '',
      fishTypes: check.fishTypes,
      notes: fields.notes?.trim() || '',
      totalSpent: 0,
      tier: calcCustomerTier(0),
    }),
  }
}

export function buildUpdatedCustomerRecord(existing, fields) {
  const check = validateCustomerFields(fields)
  if (!check.ok) return check
  const totalSpent = Number(existing.totalSpent) || 0
  return {
    ok: true,
    customer: touchUpdatedAt(normalizeCustomerRecord({
      ...existing,
      name: check.name,
      phone: check.phone,
      whatsapp: check.whatsapp,
      area: '',
      postalCode: check.postalCode,
      address: fields.address?.trim() || '',
      fishTypes: check.fishTypes,
      notes: fields.notes?.trim() || '',
      totalSpent,
    })),
  }
}

export function findCustomerByName(customers, name, excludeId = null) {
  const key = name?.trim().toLowerCase()
  if (!key) return null
  return (customers || []).find(
    (c) => c.name?.trim().toLowerCase() === key && !sameCustomerId(c.id, excludeId),
  ) || null
}

export function isDuplicateCustomerName(customers, name, excludeId = null) {
  return !!findCustomerByName(customers, name, excludeId)
}

export function getCustomerDeleteWarnings(customer, { invoices = [], deliveries = [] } = {}) {
  if (!customer) return []
  const warnings = []
  const pendingInvoices = (invoices || []).filter(
    (inv) => sameCustomerId(inv.customerId, customer.id)
      && !['cancelled', 'paid'].includes(getInvoiceStatus(inv)),
  )
  if (pendingInvoices.length) {
    warnings.push(`Open invoices: ${pendingInvoices.map((i) => i.id).join(', ')}`)
  }
  const activeDeliveries = (deliveries || []).filter(
    (d) => sameCustomerId(d.customerId, customer.id)
      && ['scheduled', 'transit'].includes(d.status),
  )
  if (activeDeliveries.length) {
    warnings.push(`Active deliveries: ${activeDeliveries.map((d) => d.id).join(', ')}`)
  }
  if ((customer.totalSpent || 0) > 0) {
    warnings.push(`Recorded spending: S$${Number(customer.totalSpent).toFixed(2)}`)
  }
  return warnings
}

/** Keep invoices, deliveries, and customer koi in sync when a CRM profile changes. */
export function propagateCustomerProfileChange({
  customerId, prevCustomer, nextCustomer,
  invoices = [], deliveries = [], customerKoiList = [],
}) {
  if (!sameCustomerId(customerId, nextCustomer?.id)) {
    return { invoices: null, deliveries: null, customerKoiList: null }
  }
  const nameChanged = prevCustomer?.name?.trim() !== nextCustomer?.name?.trim()
  const contactChanged = (prevCustomer?.whatsapp || prevCustomer?.phone) !== (nextCustomer?.whatsapp || nextCustomer?.phone)
    || prevCustomer?.address !== nextCustomer?.address
    || prevCustomer?.postalCode !== nextCustomer?.postalCode

  if (!nameChanged && !contactChanged) {
    return { invoices: null, deliveries: null, customerKoiList: null }
  }

  const nextInvoices = contactChanged || nameChanged
    ? invoices.map((inv) => {
      if (!sameCustomerId(inv.customerId, customerId)) return inv
      return touchUpdatedAt({
        ...inv,
        customerName: nextCustomer.name,
        customerPhone: nextCustomer.whatsapp || nextCustomer.phone || '',
        customerWhatsapp: nextCustomer.whatsapp || nextCustomer.phone || '',
        customerAddress: formatCustomerAddress(nextCustomer) || inv.customerAddress || '',
      })
    })
    : null

  const nextDeliveries = nameChanged || contactChanged
    ? deliveries.map((d) => {
      if (!sameCustomerId(d.customerId, customerId)) return d
      return touchUpdatedAt({
        ...d,
        customerName: nextCustomer.name,
        postalCode: nextCustomer.postalCode || d.postalCode || '',
        address: nextCustomer.address || d.address || '',
      })
    })
    : null

  const nextCustomerKoi = nameChanged
    ? customerKoiList.map((r) => (
      sameCustomerId(r.customerId, customerId)
        ? touchUpdatedAt({ ...r, customerName: nextCustomer.name })
        : r
    ))
    : null

  return {
    invoices: nextInvoices,
    deliveries: nextDeliveries,
    customerKoiList: nextCustomerKoi,
  }
}
