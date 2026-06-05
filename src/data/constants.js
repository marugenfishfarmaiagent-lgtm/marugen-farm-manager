export const FISH_TYPES = ['Koi', 'Arowana', 'Goldfish', 'Guppy', 'Betta', 'Flowerhorn', 'Discus', 'Other']
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

export const ALL_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'customers', label: 'Customers' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'chat', label: 'AI Chat' },
  { id: 'users', label: 'Team & Permissions' },
]

export const DEFAULT_PERMISSIONS = {
  owner: ALL_PERMISSIONS.map((p) => p.id),
  staff: ['dashboard', 'inventory', 'invoices', 'customers', 'deliveries', 'calendar', 'chat'],
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

export const INITIAL_PRODUCTS = [
  { id: 1, name: 'Koi Pellets (Premium)', category: 'Fish Food', sku: 'FF001', price: 28.5, cost: 14, unit: 'kg', stock: 45, minStock: 10, description: 'High protein koi pellets' },
  { id: 2, name: 'Arowana Sticks', category: 'Fish Food', sku: 'FF002', price: 55, cost: 28, unit: 'kg', stock: 20, minStock: 5, description: 'Premium arowana floating sticks' },
  { id: 3, name: 'Water Conditioner 500ml', category: 'Water Treatment', sku: 'WT001', price: 18, cost: 8, unit: 'bottle', stock: 30, minStock: 8, description: 'Removes chlorine & chloramine' },
  { id: 4, name: 'Pond Salt 2kg', category: 'Water Treatment', sku: 'WT002', price: 12, cost: 5, unit: 'bag', stock: 60, minStock: 15, description: 'Natural pond salt' },
  { id: 5, name: 'Air Pump (Large)', category: 'Equipment', sku: 'EQ001', price: 85, cost: 42, unit: 'unit', stock: 8, minStock: 2, description: 'High output air pump' },
  { id: 6, name: 'Fish Net (Medium)', category: 'Accessories', sku: 'AC001', price: 8.5, cost: 3.5, unit: 'unit', stock: 15, minStock: 5, description: 'Soft nylon fish net' },
  { id: 7, name: 'Anti-Parasite Treatment', category: 'Medicine', sku: 'MD001', price: 32, cost: 16, unit: 'bottle', stock: 12, minStock: 4, description: 'Broad spectrum treatment' },
  { id: 8, name: 'Pond Filter Media', category: 'Pond Supplies', sku: 'PS001', price: 45, cost: 20, unit: 'set', stock: 6, minStock: 2, description: 'Biological filter media set' },
]

export const INITIAL_CUSTOMERS = [
  { id: 1, name: 'Tan Wei Ming', phone: '+65 9123 4567', whatsapp: '+65 9123 4567', area: 'Tampines', fishTypes: ['Koi', 'Arowana'], tier: 'Gold', notes: 'Prefers weekend delivery', totalSpent: 3450 },
  { id: 2, name: 'Sarah Lim', phone: '+65 8234 5678', whatsapp: '+65 8234 5678', area: 'Bukit Timah', fishTypes: ['Arowana'], tier: 'Platinum', notes: 'Super Red specialist', totalSpent: 12800 },
  { id: 3, name: 'Ahmad Razif', phone: '+65 9345 6789', whatsapp: '+65 9345 6789', area: 'Jurong West', fishTypes: ['Koi'], tier: 'Silver', notes: 'Pond keeper', totalSpent: 1200 },
]

export const INITIAL_INVOICES = [
  { id: 'INV-001', customerId: 1, customerName: 'Tan Wei Ming', items: [{ name: 'Super Red Arowana 12"', qty: 1, price: 850 }], total: 850, status: 'paid', date: '2025-05-10', due: '2025-05-17', notes: '' },
  { id: 'INV-002', customerId: 2, customerName: 'Sarah Lim', items: [{ name: 'Cross Back Golden 18"', qty: 1, price: 3200 }], total: 3200, status: 'pending', date: '2025-06-01', due: '2025-06-08', notes: 'Hold for collection' },
  { id: 'INV-003', customerId: 3, customerName: 'Ahmad Razif', items: [{ name: 'Kohaku Koi 8"', qty: 3, price: 120 }, { name: 'Koi Pellets 1kg', qty: 2, price: 28.5 }], total: 417, status: 'pending', date: '2025-06-03', due: '2025-06-10', notes: '' },
]

export const INITIAL_EXPENSES = [
  { id: 1, category: 'Feed', amount: 680, date: '2025-06-01', note: 'Monthly fish feed stock', addedBy: 'owner' },
  { id: 2, category: 'Utilities', amount: 320, date: '2025-06-01', note: 'Water & electricity', addedBy: 'owner' },
  { id: 3, category: 'Transport', amount: 150, date: '2025-06-03', note: 'Delivery fuel', addedBy: 'staff' },
]

export const INITIAL_DELIVERIES = [
  { id: 'DEL-001', customerId: 1, customerName: 'Tan Wei Ming', area: 'Tampines', address: 'Blk 123 Tampines St 12 #04-56', schedule: '2025-06-07 10:00', status: 'scheduled', items: '1x Super Red Arowana', driver: 'Ali', notes: '' },
  { id: 'DEL-002', customerId: 3, customerName: 'Ahmad Razif', area: 'Jurong West', address: 'Blk 456 Jurong West Ave 6 #02-11', schedule: '2025-06-08 14:00', status: 'scheduled', items: '3x Koi, 2x Feed', driver: 'Raju', notes: 'Call before arriving' },
]

export const INITIAL_EVENTS = [
  { id: 1, title: 'Water Quality Check - All Tanks', date: '2025-06-07', time: '08:00', type: 'maintenance', note: 'Check pH, ammonia, nitrite' },
  { id: 2, title: 'Feeding Schedule - Arowana Section', date: '2025-06-07', time: '09:00', type: 'feeding', note: '3x daily, morning feed' },
  { id: 3, title: 'Restock: Koi Pellets', date: '2025-06-10', time: '10:00', type: 'purchase', note: 'Order 50kg from supplier' },
  { id: 4, title: 'Customer Visit - Sarah Lim', date: '2025-06-09', time: '15:00', type: 'customer', note: 'View new Cross Back Golden arrivals' },
]

export const LOCAL_DEMO_USERS = [
  { id: 1, name: 'Marugen Owner', role: 'owner', pin: '1234', active: true, permissions: DEFAULT_PERMISSIONS.owner, isSystem: true },
  { id: 2, name: 'Ali', role: 'staff', pin: '0000', active: true, permissions: DEFAULT_PERMISSIONS.staff },
  { id: 3, name: 'Raju', role: 'staff', pin: '1111', active: true, permissions: ['dashboard', 'inventory', 'deliveries', 'calendar'] },
]

export const DEMO_SEED = {
  customers: INITIAL_CUSTOMERS,
  products: INITIAL_PRODUCTS,
  invoices: INITIAL_INVOICES,
  expenses: INITIAL_EXPENSES,
  deliveries: INITIAL_DELIVERIES,
  events: INITIAL_EVENTS,
}
