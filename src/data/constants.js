export const FISH_TYPES = ['Koi', 'Arowana', 'Goldfish', 'Guppy', 'Other']
export const AROWANA_TYPES = ['Super Red', 'Cross Back Golden', 'Malaysian Golden', 'Green Arowana', 'Silver Arowana']
export const KOI_TYPES = ['Kohaku', 'Sanke', 'Showa', 'Butterfly Koi', 'Ghost Koi', 'Ogon']

export const CUSTOMER_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum']

export const PRODUCT_CATEGORIES = [
  'Fish Food', 'Water Treatment', 'Equipment', 'Accessories', 'Medicine', 'Pond Supplies',
]

export const EXPENSE_CATEGORIES = [
  'Feed', 'Transport', 'Utilities', 'Rent', 'Equipment', 'Labor', 'Medicine', 'Packaging', 'Marketing', 'Other',
]

export const SG_AREAS = [
  'Ang Mo Kio', 'Bedok', 'Bishan', 'Bukit Batok', 'Bukit Timah', 'Changi', 'Choa Chu Kang', 'Clementi',
  'Geylang', 'Hougang', 'Jurong East', 'Jurong West', 'Kallang', 'Marine Parade', 'Novena', 'Pasir Ris',
  'Punggol', 'Queenstown', 'Sembawang', 'Sengkang', 'Serangoon', 'Tampines', 'Toa Payoh', 'Woodlands', 'Yishun',
]

export const PAYNOW_UEN = '53468842B'

export const INVOICE_COMPANY = {
  name: 'Marugen Koi Farm',
  address: '21 Neo Tiew Lane 1, Singapore 718788',
  phone: '+65 9745 9730',
  email: 'koi@marugenfishfarm.com',
  website: 'marugenfishfarm.com',
}

export function formatInvoiceDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatInvoiceMoney(v) {
  return Number(v).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const ALL_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'koifish', label: 'Koi Fish' },
  { id: 'customerkoi', label: 'Customer Koi' },
  { id: 'ponds', label: 'Pond Management' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'customers', label: 'Customers' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'accounting', label: 'Accounting marks' },
  { id: 'edit', label: 'Edit records' },
  { id: 'delete', label: 'Delete records' },
  { id: 'refund', label: 'Refund sales' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'chat', label: 'AI Chat' },
  { id: 'users', label: 'Team & Permissions' },
]

export const DEFAULT_PERMISSIONS = {
  owner: ALL_PERMISSIONS.map((p) => p.id),
  staff: ['dashboard', 'inventory', 'koifish', 'customerkoi', 'ponds', 'invoices', 'customers', 'deliveries', 'calendar', 'chat'],
}

export const KOI_VARIETIES = [
  'Kohaku', 'Sanke', 'Showa', 'Butterfly Koi', 'Ghost Koi', 'Ogon', 'Tancho', 'Utsuri',
  'Bekko', 'Asagi', 'Shusui', 'Goshiki',
]

export const KOI_GRADES = ['A Grade', 'B Grade', 'C Grade', 'Show Grade', 'Jumbo']

/** Fish length in cm — stored as number; legacy inch-range strings still display as-is. */
export function normalizeKoiSizeCm(value) {
  const n = parseFloat(value)
  if (Number.isNaN(n) || n <= 0) return null
  return Math.round(n * 10) / 10
}

export function formatKoiSize(size) {
  if (size == null || size === '') return '—'
  const n = Number(size)
  if (!Number.isNaN(n) && n > 0) return `${n} cm`
  return String(size)
}

export const KOI_STATUS = {
  AVAILABLE: 'available',
  SOLD: 'sold',
  RESERVED: 'reserved',
  SICK: 'sick',
  DECEASED: 'deceased',
}

export const KOI_DEATH_CAUSES = [
  'Unknown', 'Disease', 'Water quality', 'Age', 'Injury', 'Parasite', 'Bacterial infection', 'Other',
]

export const CUSTOMER_KOI_DEATH_CAUSES = [
  'Unknown', 'Disease', 'Water quality issue', 'Old age', 'Injury', 'Parasite', 'Jumping out', 'Predator', 'Other',
]

/** Sold koi custody: held in a pond, taken away by customer, or deceased. */
export const CUSTOMER_KOI_STATUS = {
  IN_POND: 'in_pond',
  COLLECTED: 'collected',
  DECEASED: 'deceased',
}

export const CUSTOMER_KOI_STATUS_OPTIONS = [
  { value: CUSTOMER_KOI_STATUS.IN_POND, label: 'In pond' },
  { value: CUSTOMER_KOI_STATUS.COLLECTED, label: 'Taken away' },
  { value: CUSTOMER_KOI_STATUS.DECEASED, label: 'Deceased' },
]

export function normalizeCustomerKoiStatus(status) {
  if (status === 'alive' || !status) return CUSTOMER_KOI_STATUS.IN_POND
  return status
}

export function formatCustomerKoiStatus(status) {
  const normalized = normalizeCustomerKoiStatus(status)
  return CUSTOMER_KOI_STATUS_OPTIONS.find((o) => o.value === normalized)?.label || '—'
}

export function normalizeCustomerKoiRecord(record) {
  if (!record) return record
  return {
    ...record,
    status: normalizeCustomerKoiStatus(record.status),
    collectedDate: record.collectedDate || null,
    pondName: record.pondName || '',
    deathDate: record.deathDate || null,
    deathCause: record.deathCause || null,
    deathPhoto: record.deathPhoto || null,
    deathNotes: record.deathNotes || null,
  }
}

export const FARM_POND_GROUPS = [
  { label: 'A', count: 8 },
  { label: 'B', count: 8 },
  { label: 'C', count: 4 },
  { label: 'D', count: 4 },
  { label: 'Q', count: 14 },
]

export const FARM_POND_NAMES = FARM_POND_GROUPS.flatMap(({ label, count }) =>
  Array.from({ length: count }, (_, i) => `${label}${i + 1}`),
)

/** Standard farm ponds first, then any custom names from data. */
export function mergePondNames(...lists) {
  const seen = new Set()
  const out = []
  for (const list of lists) {
    for (const name of list) {
      const n = String(name || '').trim()
      if (!n || seen.has(n)) continue
      seen.add(n)
      out.push(n)
    }
  }
  const order = new Map(FARM_POND_NAMES.map((n, i) => [n, i]))
  return out.sort((a, b) => {
    const oa = order.has(a) ? order.get(a) : 10000
    const ob = order.has(b) ? order.get(b) : 10000
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })
}

export const POND_TYPES = [
  { value: 'koi', label: 'Koi pond' },
  { value: 'arowana', label: 'Arowana' },
  { value: 'quarantine', label: 'Quarantine' },
  { value: 'display', label: 'Display' },
]

export const MAINTENANCE_TYPES = [
  { value: 'filter_wash', label: 'Filter wash' },
  { value: 'water_change', label: 'Water change' },
  { value: 'water_test', label: 'Water test' },
  { value: 'feeding', label: 'Feeding check' },
  { value: 'other', label: 'Other' },
]

export const DEFAULT_TREATMENT_GUIDES = [
  { id: 'guide-salt', title: 'Salt dip (0.3%)', category: 'Parasite', steps: 'Dissolve pond salt to 0.3%. Monitor fish 30 min. Ensure good aeration.', warning: 'Do not use with plants.' },
  { id: 'guide-melafix', title: 'Melafix treatment', category: 'Bacterial', steps: '5ml per 40L daily for 7 days. Water change 25% before starting.', warning: 'Remove carbon from filter.' },
  { id: 'guide-pp', title: 'Potassium Permanganate', category: 'Parasite', steps: '2mg/L dip for 10-15 min in separate tank. Never overdose.', warning: 'Wear gloves. PP stains everything.' },
]

export const INITIAL_KOI_FISH = []

export const INITIAL_CUSTOMER_KOI = []

export const INITIAL_POND_DATA = {
  ponds: [],
  maintenanceLogs: [],
  treatmentLogs: [],
  reminders: [],
  treatmentGuides: [],
}

export function formatSGD(v) {
  return `S$${Number(v).toFixed(2)}`
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

export function genId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`
}

/** Invoice number: INV + issue date (YYYYMMDD) + daily sequence, e.g. INV20260606-01 */
export function genInvoiceId(invoices = [], issueDate) {
  const dateKey = (issueDate || today()).replace(/-/g, '')
  const prefix = `INV${dateKey}-`
  let maxSeq = 0
  for (const inv of invoices) {
    const id = String(inv?.id || '')
    if (!id.startsWith(prefix)) continue
    const num = parseInt(id.slice(prefix.length), 10)
    if (!Number.isNaN(num) && num > maxSeq) maxSeq = num
  }
  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`
}

export function getInvoiceStatus(inv) {
  if (inv.status === 'paid' || inv.status === 'cancelled') return inv.status
  if (inv.due && inv.due < today() && inv.status === 'pending') return 'overdue'
  return inv.status || 'pending'
}

export function calcCustomerTier(totalSpent) {
  if (totalSpent >= 10000) return 'Platinum'
  if (totalSpent >= 5000) return 'Gold'
  if (totalSpent >= 2000) return 'Silver'
  return 'Bronze'
}

export const PAYNOW_QR_PATTERN = [
  1, 1, 1, 0, 1, 0, 1,
  1, 0, 0, 0, 1, 0, 0,
  1, 0, 1, 1, 1, 0, 1,
  0, 0, 0, 1, 0, 1, 0,
  1, 1, 1, 0, 1, 1, 1,
  0, 1, 0, 1, 0, 0, 1,
  1, 0, 1, 0, 1, 0, 1,
]

export const INITIAL_PRODUCTS = []

export const INITIAL_CUSTOMERS = []

/** Delivery fields copied from a customer record. */
export function customerDeliveryFields(customer) {
  if (!customer) {
    return { customerId: '', customerName: '', postalCode: '', address: '' }
  }
  return {
    customerId: String(customer.id),
    customerName: customer.name || '',
    postalCode: customer.postalCode || '',
    address: customer.address || '',
  }
}

export function formatInvoiceItemsForDelivery(items = []) {
  return (items || [])
    .filter((it) => it?.name)
    .map((it) => `${Number(it.qty) || 1}x ${it.name}`)
    .join(', ')
}

/** Delivery fields filled from a linked invoice + customer profile. */
export function invoiceDeliveryFields(invoice, customers = []) {
  if (!invoice) {
    return { invoiceId: '', customerId: '', customerName: '', postalCode: '', address: '', items: '' }
  }
  const customer = invoice.customerId != null && invoice.customerId !== ''
    ? customers.find((c) => String(c.id) === String(invoice.customerId))
    : customers.find((c) => c.name?.trim().toLowerCase() === invoice.customerName?.trim().toLowerCase())
  const fromCustomer = customerDeliveryFields(customer)
  return {
    invoiceId: invoice.id,
    customerId: fromCustomer.customerId || (invoice.customerId != null && invoice.customerId !== '' ? String(invoice.customerId) : ''),
    customerName: invoice.customerName || fromCustomer.customerName,
    postalCode: fromCustomer.postalCode,
    address: invoice.customerAddress || fromCustomer.address,
    items: formatInvoiceItemsForDelivery(invoice.items),
  }
}

export const INITIAL_INVOICES = []

export const INITIAL_EXPENSES = []

/** Mark whether a record was entered in external accounting software. */
export function makeBookedPatch(booked, userName) {
  return booked
    ? { booked: true, bookedAt: new Date().toISOString(), bookedBy: userName || '' }
    : { booked: false, bookedAt: null, bookedBy: '' }
}

export const INITIAL_DELIVERIES = []

export const INITIAL_EVENTS = []

/** Local-only login when Supabase is not configured. */
export const LOCAL_DEMO_USERS = [
  { id: 1, name: 'Owner', role: 'owner', pin: '1234', active: true, permissions: DEFAULT_PERMISSIONS.owner, isSystem: true },
]
