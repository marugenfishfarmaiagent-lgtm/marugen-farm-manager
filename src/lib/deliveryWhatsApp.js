import {
  copyTextToClipboard,
  findCustomerRecord,
  findCustomerWhatsApp,
  normalizeWhatsAppGroupLink,
  openWhatsAppChat,
  openWhatsAppGroupLink,
  openWhatsAppShare,
} from './invoiceWhatsApp'

export const WHATSAPP_GROUPS_STORAGE_KEY = 'marugen_whatsapp_groups'

export function loadWhatsappGroups() {
  try {
    const raw = localStorage.getItem(WHATSAPP_GROUPS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore corrupt storage
  }
  return []
}

export function saveWhatsappGroups(groups) {
  localStorage.setItem(WHATSAPP_GROUPS_STORAGE_KEY, JSON.stringify(groups))
}

export function clearWhatsappGroupsLocal() {
  try {
    localStorage.removeItem(WHATSAPP_GROUPS_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function formatDeliverySchedule(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDeliveryWhatsAppMessage(delivery) {
  const lines = [
    'Marugen Koi Farm — Delivery Schedule',
    '',
    `Ref: ${delivery.id}`,
    `Customer: ${delivery.customerName}`,
    `Date & Time: ${formatDeliverySchedule(delivery.schedule)}`,
  ]
  const addressParts = [delivery.address, delivery.postalCode ? `Singapore ${delivery.postalCode}` : ''].filter(Boolean)
  if (addressParts.length) lines.push(`Address: ${addressParts.join(', ')}`)
  if (delivery.area) lines.push(`Area: ${delivery.area}`)
  if (delivery.items) lines.push(`Items: ${delivery.items}`)
  if (delivery.invoiceId) lines.push(`Invoice: ${delivery.invoiceId}`)
  if (delivery.driver) lines.push(`Driver: ${delivery.driver}`)
  if (delivery.notes) lines.push(`Notes: ${delivery.notes}`)
  lines.push('', 'Thank you! — Marugen Koi Farm')
  return lines.join('\n')
}

export function formatDeliveryRecipientLabel(recipient) {
  if (!recipient) return ''
  if (recipient.type === 'phone' && recipient.phone) {
    return `${recipient.label}${recipient.subtitle ? ` — ${recipient.subtitle}` : ''} (${recipient.phone})`
  }
  return `${recipient.label}${recipient.subtitle ? ` — ${recipient.subtitle}` : ''}`
}

export function resolveDeliveryWhatsApp(delivery, customers) {
  return findCustomerWhatsApp(customers, delivery?.customerId, delivery?.customerName)
}

/** Recipients available when sending a delivery schedule on WhatsApp. */
export function buildDeliveryWhatsAppRecipients(delivery, customers = [], groups = []) {
  const recipients = []
  const seen = new Set()

  const pushPhone = (id, label, phone, subtitle = '') => {
    const p = String(phone || '').trim()
    if (!p) return
    const key = p.replace(/\D/g, '')
    if (!key || seen.has(key)) return
    seen.add(key)
    recipients.push({ id, label, phone: p, subtitle, type: 'phone' })
  }

  const deliveryCustomer = findCustomerRecord(customers, delivery?.customerId, delivery?.customerName)
  pushPhone(
    'delivery-customer',
    delivery.customerName || 'Customer',
    deliveryCustomer?.whatsapp || deliveryCustomer?.phone,
    'This delivery customer',
  )

  for (const c of customers) {
    if (deliveryCustomer && c.id === deliveryCustomer.id) continue
    pushPhone(`customer-${c.id}`, c.name, c.whatsapp || c.phone, c.area || 'Customer contact')
  }

  for (const g of groups) {
    const link = normalizeWhatsAppGroupLink(g?.link)
    if (!g?.name?.trim() || !link) continue
    recipients.push({
      id: `group-${g.id}`,
      label: g.name.trim(),
      subtitle: 'WhatsApp group',
      type: 'group',
      groupLink: link,
    })
  }

  recipients.push({
    id: 'whatsapp-share',
    label: 'Choose chat or group in WhatsApp',
    subtitle: 'Pick any contact or group',
    type: 'share',
  })

  return recipients
}

export async function sendDeliveryToRecipient(delivery, recipient) {
  const message = formatDeliveryWhatsAppMessage(delivery)
  if (!recipient) throw new Error('No recipient selected.')

  if (recipient.type === 'share') {
    openWhatsAppShare(message)
    return { mode: 'share', label: recipient.label }
  }

  if (recipient.type === 'group') {
    await copyTextToClipboard(message)
    openWhatsAppGroupLink(recipient.groupLink)
    return { mode: 'group', label: recipient.label }
  }

  const phone = recipient.phone?.trim()
  if (!phone) throw new Error('No valid WhatsApp number.')
  openWhatsAppChat(phone, message)
  return { mode: 'phone', label: recipient.label || phone }
}

export function sendDeliveryScheduleWhatsApp(delivery, customers, phoneOverride) {
  const phone = phoneOverride || resolveDeliveryWhatsApp(delivery, customers)
  if (!phone?.trim()) {
    const err = new Error('NO_PHONE')
    err.needsPhone = true
    throw err
  }
  openWhatsAppChat(phone, formatDeliveryWhatsAppMessage(delivery))
  return phone
}
