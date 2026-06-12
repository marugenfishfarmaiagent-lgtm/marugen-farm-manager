export function normalizeWhatsAppNumber(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('65') && digits.length === 10) return digits
  if (digits.length === 8) return `65${digits}`
  return digits
}

export function findCustomerRecord(customers, customerId, customerName) {
  if (customerId != null && customerId !== '') {
    const byId = customers.find((c) => String(c.id) === String(customerId))
    if (byId) return byId
  }
  if (customerName?.trim()) {
    const key = customerName.trim().toLowerCase()
    return customers.find((c) => c.name?.trim().toLowerCase() === key) || null
  }
  return null
}

export function findCustomerWhatsApp(customers, customerId, customerName) {
  const customer = findCustomerRecord(customers, customerId, customerName)
  return customer?.whatsapp || customer?.phone || ''
}

export function formatCustomerAddress(customer) {
  if (!customer) return ''
  const parts = []
  if (customer.address) parts.push(customer.address)
  if (customer.postalCode) parts.push(`Singapore ${customer.postalCode}`)
  return parts.join(', ')
}

export function resolveInvoiceCustomer(invoice, customers = []) {
  const customer = findCustomerRecord(customers, invoice?.customerId, invoice?.customerName)
  const phone = invoice?.customerPhone
    || invoice?.customerWhatsapp
    || customer?.whatsapp
    || customer?.phone
    || ''
  const address = invoice?.customerAddress || formatCustomerAddress(customer) || ''
  return {
    name: invoice?.customerName || customer?.name || '',
    phone,
    address,
  }
}

export function enrichInvoiceCustomer(invoice, customers = []) {
  const details = resolveInvoiceCustomer(invoice, customers)
  return {
    ...invoice,
    customerName: details.name,
    customerPhone: details.phone,
    customerAddress: details.address,
    customerWhatsapp: invoice?.customerWhatsapp || details.phone,
  }
}

export function resolveInvoiceWhatsApp(invoice, customers) {
  return invoice?.customerWhatsapp
    || findCustomerWhatsApp(customers, invoice?.customerId, invoice?.customerName)
    || ''
}

export function buildWhatsAppUrl(phone, text) {
  const number = normalizeWhatsAppNumber(phone)
  if (!number) throw new Error('No valid WhatsApp number.')
  const base = `https://api.whatsapp.com/send?phone=${number}`
  if (!text?.trim()) return base
  return `${base}&text=${encodeURIComponent(text.trim())}`
}

/** Open WhatsApp share sheet — user picks any chat or group. */
export function buildWhatsAppShareUrl(text) {
  if (!text?.trim()) return 'https://api.whatsapp.com/send'
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text.trim())}`
}

export function normalizeWhatsAppGroupLink(link) {
  const raw = String(link || '').trim()
  if (!raw) return ''
  const match = raw.match(/https?:\/\/chat\.whatsapp\.com\/[^\s?#]+/i)
  return match ? match[0] : raw
}

export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
    return true
  }
}

export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function clickWhatsAppLink(url) {
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function openWhatsAppUrl(url) {
  // Keep the farm app tab open — location.assign navigates away and breaks automation / PWA sessions.
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) clickWhatsAppLink(url)
}

/** Open WhatsApp chat — optional pre-filled message text. */
export function openWhatsAppChat(phone, text) {
  const url = buildWhatsAppUrl(phone, text)
  openWhatsAppUrl(url)
  return normalizeWhatsAppNumber(phone)
}

/** Let user choose any WhatsApp chat or group with message pre-filled. */
export function openWhatsAppShare(text) {
  openWhatsAppUrl(buildWhatsAppShareUrl(text))
}

/** Open a saved WhatsApp group invite link. */
export function openWhatsAppGroupLink(link) {
  const url = normalizeWhatsAppGroupLink(link)
  if (!url) throw new Error('Invalid WhatsApp group link.')
  openWhatsAppUrl(url)
}
