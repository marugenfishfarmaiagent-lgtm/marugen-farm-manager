import { getInvoiceStatus } from '../data/constants'

export const BACKUP_VERSION = 1

function csvCell(value) {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells) {
  return cells.map(csvCell).join(',')
}

export function backupDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

export function backupBaseName(date = new Date()) {
  return `marugen-backup-${backupDateStamp(date)}`
}

export function downloadFile(content, filename, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadFilesSequentially(files, delayMs = 450) {
  for (let i = 0; i < files.length; i += 1) {
    const { content, filename, mime } = files[i]
    downloadFile(content, filename, mime)
    if (i < files.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

export function sanitizeUsersForBackup(users = []) {
  return users.map(({ id, name, role, active, permissions, isSystem }) => ({
    id,
    name,
    role,
    active: active !== false,
    permissions: permissions || [],
    isSystem: Boolean(isSystem),
  }))
}

export function cloudFetchToState(data) {
  if (!data) return null
  return {
    users: data.users || [],
    customers: data.customers || [],
    products: data.products || [],
    invoices: data.invoices || [],
    expenses: data.expenses || [],
    deliveries: data.deliveries || [],
    events: data.events || [],
    stockLog: data.stockActivity || [],
    koiFishList: data.koiFish || [],
    customerKoiList: data.customerKoi || [],
    pondData: data.pondData || {},
    whatsappGroups: data.whatsappGroups || [],
  }
}

function summarizeInvoiceItems(items = []) {
  return items.map((it) => {
    const qty = it.qty ?? 1
    const price = it.price ?? 0
    return `${it.name || 'Item'} x${qty} @ ${price}`
  }).join('; ')
}

export function invoicesToCsv(invoices = []) {
  const header = csvRow([
    'id', 'date', 'due', 'status', 'customer_name', 'customer_phone', 'customer_whatsapp',
    'total', 'booked', 'booked_at', 'booked_by', 'discount_type', 'discount_value', 'shipping',
    'notes', 'items_summary', 'created_by',
  ])
  const rows = invoices.map((inv) => csvRow([
    inv.id,
    inv.date,
    inv.due,
    getInvoiceStatus(inv),
    inv.customerName,
    inv.customerPhone,
    inv.customerWhatsapp,
    inv.total,
    inv.booked ? 'yes' : 'no',
    inv.bookedAt || '',
    inv.bookedBy || '',
    inv.discountType || 'none',
    inv.discountValue ?? 0,
    inv.shipping ?? 0,
    inv.notes || '',
    summarizeInvoiceItems(inv.items),
    inv.createdBy || '',
  ]))
  return [header, ...rows].join('\n')
}

export function expensesToCsv(expenses = []) {
  const header = csvRow([
    'id', 'date', 'category', 'amount', 'note', 'added_by',
    'booked', 'booked_at', 'booked_by', 'image_name', 'has_receipt_image',
  ])
  const rows = expenses.map((exp) => csvRow([
    exp.id,
    exp.date,
    exp.category,
    exp.amount,
    exp.note || '',
    exp.addedBy || '',
    exp.booked ? 'yes' : 'no',
    exp.bookedAt || '',
    exp.bookedBy || '',
    exp.imageName || '',
    (exp.imageData || exp.imageUrl) ? 'yes' : 'no',
  ]))
  return [header, ...rows].join('\n')
}

export function buildBackupPayload(state, { exportedBy = 'Unknown' } = {}) {
  const data = {
    users: sanitizeUsersForBackup(state.users),
    customers: state.customers || [],
    products: state.products || [],
    invoices: state.invoices || [],
    expenses: state.expenses || [],
    deliveries: state.deliveries || [],
    events: state.events || [],
    stockLog: state.stockLog || [],
    koiFishList: state.koiFishList || [],
    customerKoiList: state.customerKoiList || [],
    pondData: state.pondData || {},
    whatsappGroups: state.whatsappGroups || [],
  }

  return {
    backupVersion: BACKUP_VERSION,
    app: 'marugen-farm-manager',
    exportedAt: new Date().toISOString(),
    exportedBy,
    counts: {
      users: data.users.length,
      customers: data.customers.length,
      products: data.products.length,
      invoices: data.invoices.length,
      expenses: data.expenses.length,
      deliveries: data.deliveries.length,
      events: data.events.length,
      stockLog: data.stockLog.length,
      koiFish: data.koiFishList.length,
      customerKoi: data.customerKoiList.length,
      whatsappGroups: data.whatsappGroups.length,
    },
    data,
  }
}

export async function exportFullBackup({ state, exportedBy, refreshFromCloud, fetchCloudData }) {
  let snapshot = state
  if (refreshFromCloud && fetchCloudData) {
    const cloud = await fetchCloudData()
    const mapped = cloudFetchToState(cloud)
    if (mapped) snapshot = mapped
  }

  const payload = buildBackupPayload(snapshot, { exportedBy })
  const base = backupBaseName()

  await downloadFilesSequentially([
    {
      content: JSON.stringify(payload, null, 2),
      filename: `${base}.json`,
      mime: 'application/json',
    },
    {
      content: invoicesToCsv(payload.data.invoices),
      filename: `${base}-invoices.csv`,
      mime: 'text/csv',
    },
    {
      content: expensesToCsv(payload.data.expenses),
      filename: `${base}-expenses.csv`,
      mime: 'text/csv',
    },
  ])

  return payload.counts
}
