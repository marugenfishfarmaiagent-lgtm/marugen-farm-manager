import { DELIVERY_STATUS, SG_AREAS, genId, getInvoiceStatus } from '../data/constants'
import { sameCustomerId, validateSingaporePostal } from './customerOps'
import { touchUpdatedAt } from './syncMeta'

const DELIVERY_STATUSES = new Set([
  DELIVERY_STATUS.PENDING,
  DELIVERY_STATUS.OUT_FOR_DELIVERY,
  DELIVERY_STATUS.DELIVERED,
  DELIVERY_STATUS.CANCELLED,
])

const NOTES_MAX = 500
const ITEMS_MAX = 500
const DRIVER_MAX = 80

export function sameDeliveryId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function resolveDeliveryArea({ address, postalCode, customerId }, customers = []) {
  const customer = (customers || []).find((c) => sameCustomerId(c.id, customerId))
  if (customer?.area) return customer.area
  const addr = `${address || ''} ${postalCode || ''}`.toLowerCase()
  const matched = SG_AREAS.find((area) => addr.includes(area.toLowerCase()))
  return matched || 'Other'
}

export function normalizeDeliveryRecord(delivery) {
  if (!delivery) return delivery
  const status = DELIVERY_STATUSES.has(delivery.status) ? delivery.status : DELIVERY_STATUS.PENDING
  return {
    ...delivery,
    invoiceId: delivery.invoiceId || '',
    customerId: delivery.customerId ?? null,
    customerName: delivery.customerName?.trim() || '',
    area: delivery.area || '',
    postalCode: delivery.postalCode
      ? String(delivery.postalCode).replace(/\D/g, '').slice(0, 6)
      : '',
    address: delivery.address?.trim() || '',
    schedule: delivery.schedule?.trim() || '',
    status,
    items: String(delivery.items || '').slice(0, ITEMS_MAX),
    driver: String(delivery.driver || '').slice(0, DRIVER_MAX),
    notes: String(delivery.notes || '').slice(0, NOTES_MAX),
    createdBy: delivery.createdBy || '',
    deliveredAt: delivery.deliveredAt || null,
  }
}

/**
 * @returns {{ ok: true, customerName: string, address: string, schedule: string, postalCode: string, status: string } | { ok: false, message: string }}
 */
export function validateDeliveryFields(fields, {
  customers = [], invoices = [], deliveries = [], editingId = null,
} = {}) {
  const customerName = fields.customerName?.trim()
  if (!customerName) {
    return { ok: false, message: 'Select a customer or link an invoice with customer details.' }
  }
  const address = fields.address?.trim()
  if (!address) {
    return { ok: false, message: 'Enter the delivery address (Blk / Unit / Street).' }
  }
  const schedule = fields.schedule?.trim()
  if (!schedule) {
    return { ok: false, message: 'Choose date and time for the delivery.' }
  }
  const postalCheck = validateSingaporePostal(fields.postalCode)
  if (!postalCheck.ok) return postalCheck

  if (fields.invoiceId) {
    const inv = (invoices || []).find((i) => String(i.id) === String(fields.invoiceId))
    if (!inv) {
      return { ok: false, message: `Invoice ${fields.invoiceId} was not found.` }
    }
    if (getInvoiceStatus(inv) === 'cancelled') {
      return { ok: false, message: `Invoice ${fields.invoiceId} is cancelled — choose another invoice or none.` }
    }
    const duplicate = (deliveries || []).find(
      (d) => d.invoiceId === fields.invoiceId
        && !sameDeliveryId(d.id, editingId)
        && ['scheduled', 'transit'].includes(d.status),
    )
    if (duplicate) {
      return { ok: false, message: `Invoice ${fields.invoiceId} already has an active delivery (${duplicate.id}).` }
    }
  }

  const status = fields.status || DELIVERY_STATUS.PENDING
  if (!DELIVERY_STATUSES.has(status)) {
    return { ok: false, message: 'Select a valid delivery status.' }
  }

  return {
    ok: true,
    customerName,
    address,
    schedule,
    postalCode: postalCheck.postalCode,
    status,
  }
}

export function buildDeliveryStatusPatch(nextStatus, current = {}) {
  if (!DELIVERY_STATUSES.has(nextStatus)) {
    return { ok: false, message: `Unknown delivery status: ${nextStatus}` }
  }
  const patch = { status: nextStatus }
  if (nextStatus === DELIVERY_STATUS.DELIVERED) {
    patch.deliveredAt = new Date().toISOString()
  } else if (current.status === DELIVERY_STATUS.DELIVERED) {
    patch.deliveredAt = null
  }
  return { ok: true, patch }
}

export function buildNewDeliveryRecord(fields, { customers = [], invoices = [], createdBy } = {}) {
  const check = validateDeliveryFields(fields, { customers, invoices, deliveries: [] })
  if (!check.ok) return check
  const area = resolveDeliveryArea({
    address: check.address,
    postalCode: check.postalCode,
    customerId: fields.customerId,
  }, customers)
  return {
    ok: true,
    delivery: touchUpdatedAt(normalizeDeliveryRecord({
      id: genId('DEL'),
      invoiceId: fields.invoiceId || '',
      customerId: fields.customerId || null,
      customerName: check.customerName,
      area,
      postalCode: check.postalCode,
      address: check.address,
      schedule: check.schedule,
      status: DELIVERY_STATUS.PENDING,
      items: fields.items?.trim() || '',
      driver: fields.driver?.trim() || '',
      notes: fields.notes?.trim() || '',
      createdBy: createdBy || 'Staff',
      deliveredAt: null,
    })),
  }
}

export function buildUpdatedDeliveryRecord(fields, existing, {
  customers = [], invoices = [], deliveries = [],
} = {}) {
  if (!existing) return { ok: false, message: 'Delivery not found.' }
  const check = validateDeliveryFields(fields, {
    customers, invoices, deliveries, editingId: existing.id,
  })
  if (!check.ok) return check
  const area = resolveDeliveryArea({
    address: check.address,
    postalCode: check.postalCode,
    customerId: fields.customerId,
  }, customers)
  let { deliveredAt } = existing
  if (check.status === DELIVERY_STATUS.DELIVERED && existing.status !== DELIVERY_STATUS.DELIVERED) {
    deliveredAt = new Date().toISOString()
  } else if (check.status !== DELIVERY_STATUS.DELIVERED && existing.status === DELIVERY_STATUS.DELIVERED) {
    deliveredAt = null
  }
  return {
    ok: true,
    delivery: touchUpdatedAt(normalizeDeliveryRecord({
      ...existing,
      invoiceId: fields.invoiceId ?? existing.invoiceId ?? '',
      customerId: fields.customerId || null,
      customerName: check.customerName,
      area,
      postalCode: check.postalCode,
      address: check.address,
      schedule: check.schedule,
      status: check.status,
      items: fields.items?.trim() ?? existing.items ?? '',
      driver: fields.driver?.trim() ?? existing.driver ?? '',
      notes: fields.notes?.trim() ?? existing.notes ?? '',
      deliveredAt,
      createdBy: existing.createdBy || 'Staff',
    })),
  }
}
