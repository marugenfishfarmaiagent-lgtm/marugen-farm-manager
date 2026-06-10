import { today, getInvoiceStatus, KOI_STATUS, CUSTOMER_KOI_STATUS } from '../data/constants'

/**
 * App default view — from agreed summary table.
 * Older records may still exist in cloud until cloud retention expires.
 */
export const APP_VIEW_DAYS = {
  invoice: 730,
  expense: 730,
  koiDeceased: 90,
  customerKoiDeceased: 180,
  deliveryDone: 180,
  pondLog: 365,
  stockLog: 730,
  calendarPast: 180,
}

/**
 * Cloud retention — ~half+ of original analysis table.
 */
export const CLOUD_RETENTION_DAYS = {
  invoice: 1095,
  expense: 1095,
  koiSold: 730,
  koiDeceased: 365,
  customerKoiDeceased: 365,
  deliveryDone: 365,
  pondLog: 730,
  stockLog: 365,
  calendarPast: 180,
  deathPhoto: 60,
}

export function daysSince(dateStr) {
  if (!dateStr) return Infinity
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return Infinity
  const now = new Date(`${today()}T12:00:00`)
  return Math.floor((now - d) / 86400000)
}

export function isWithinDays(dateStr, maxDays) {
  return daysSince(dateStr) <= maxDays
}

export function isAppVisibleInvoice(inv) {
  const status = getInvoiceStatus(inv)
  if (status === 'pending' || status === 'overdue') return true
  return isWithinDays(inv.date, APP_VIEW_DAYS.invoice)
}

export function isCloudKeptInvoice(inv) {
  const status = getInvoiceStatus(inv)
  if (status === 'pending' || status === 'overdue') return true
  return isWithinDays(inv.date, CLOUD_RETENTION_DAYS.invoice)
}

export function isAppVisibleExpense(exp) {
  return isWithinDays(exp.date, APP_VIEW_DAYS.expense)
}

export function isCloudKeptExpense(exp) {
  return isWithinDays(exp.date, CLOUD_RETENTION_DAYS.expense)
}

export function isAppVisibleDelivery(d) {
  if (d.status === 'delivered' || d.status === 'cancelled') {
    return isWithinDays(d.schedule?.slice(0, 10), APP_VIEW_DAYS.deliveryDone)
  }
  return true
}

export function isCloudKeptDelivery(d) {
  if (d.status === 'delivered' || d.status === 'cancelled') {
    return isWithinDays(d.schedule?.slice(0, 10), CLOUD_RETENTION_DAYS.deliveryDone)
  }
  return true
}

export function isAppVisibleEvent(ev) {
  const todayStr = today()
  if (!ev.date || ev.date >= todayStr) return true
  return isWithinDays(ev.date, APP_VIEW_DAYS.calendarPast)
}

export function isCloudKeptEvent(ev) {
  const todayStr = today()
  if (!ev.date || ev.date >= todayStr) return true
  return isWithinDays(ev.date, CLOUD_RETENTION_DAYS.calendarPast)
}

export function isAppVisibleStockLog(entry) {
  return isWithinDays(entry.date, APP_VIEW_DAYS.stockLog)
}

export function isCloudKeptStockLog(entry) {
  return isWithinDays(entry.date, CLOUD_RETENTION_DAYS.stockLog)
}

export function isAppVisibleKoiFarm(k) {
  if (k.status === KOI_STATUS.DECEASED) {
    return isWithinDays(k.deathDate, APP_VIEW_DAYS.koiDeceased)
  }
  return true
}

export function isCloudKeptKoiFarm(k) {
  if (k.status === KOI_STATUS.DECEASED) {
    return isWithinDays(k.deathDate, CLOUD_RETENTION_DAYS.koiDeceased)
  }
  if (k.status === KOI_STATUS.SOLD) {
    return isWithinDays(k.soldDate || k.dateAdded, CLOUD_RETENTION_DAYS.koiSold)
  }
  return true
}

export function isAppVisibleCustomerKoi(r) {
  if (r.status === CUSTOMER_KOI_STATUS.DECEASED) {
    return isWithinDays(r.deathDate, APP_VIEW_DAYS.customerKoiDeceased)
  }
  return true
}

export function isCloudKeptCustomerKoi(r) {
  if (r.status === CUSTOMER_KOI_STATUS.DECEASED) {
    return isWithinDays(r.deathDate, CLOUD_RETENTION_DAYS.customerKoiDeceased)
  }
  return true
}

export function shouldKeepDeathPhoto(deathDate) {
  return isWithinDays(deathDate, CLOUD_RETENTION_DAYS.deathPhoto)
}

function stripDeathPhoto(record) {
  if (!record.deathPhoto || shouldKeepDeathPhoto(record.deathDate)) return record
  return { ...record, deathPhoto: null }
}

function filterPondLogsForCloud(pondData) {
  if (!pondData || typeof pondData !== 'object') return pondData
  const keepLog = (date) => isWithinDays(date, CLOUD_RETENTION_DAYS.pondLog)
  const keepReminder = (r) => {
    if (r.status === 'pending') return true
    if (r.status === 'done') return isWithinDays(r.completedAt || r.dueDate, CLOUD_RETENTION_DAYS.pondLog)
    return isWithinDays(r.dueDate, CLOUD_RETENTION_DAYS.pondLog)
  }
  return {
    ...pondData,
    maintenanceLogs: (pondData.maintenanceLogs || []).filter((l) => keepLog(l.date)),
    treatmentLogs: (pondData.treatmentLogs || []).filter((l) => keepLog(l.startDate || l.date)),
    reminders: (pondData.reminders || []).filter(keepReminder),
  }
}

export function filterPondLogsForApp(pondData) {
  if (!pondData || typeof pondData !== 'object') return pondData
  const keepLog = (date) => isWithinDays(date, APP_VIEW_DAYS.pondLog)
  const keepReminder = (r) => {
    if (r.status === 'pending') return true
    if (r.status === 'done') return isWithinDays(r.completedAt || r.dueDate, APP_VIEW_DAYS.pondLog)
    return isWithinDays(r.dueDate, APP_VIEW_DAYS.pondLog)
  }
  return {
    ...pondData,
    maintenanceLogs: (pondData.maintenanceLogs || []).filter((l) => keepLog(l.date)),
    treatmentLogs: (pondData.treatmentLogs || []).filter((l) => keepLog(l.startDate || l.date)),
    reminders: (pondData.reminders || []).filter(keepReminder),
  }
}

/** Remove cloud-expired rows and strip old death photos. Returns cleaned data + purge stats. */
export function applyCloudRetention(data) {
  const stats = {
    invoices: 0,
    expenses: 0,
    deliveries: 0,
    events: 0,
    stockLog: 0,
    koiFish: 0,
    customerKoi: 0,
    pondLogs: 0,
    deathPhotos: 0,
  }

  const invoices = (data.invoices || []).filter((i) => {
    if (!isCloudKeptInvoice(i)) { stats.invoices++; return false }
    return true
  })

  const expenses = (data.expenses || []).filter((e) => {
    if (!isCloudKeptExpense(e)) { stats.expenses++; return false }
    return true
  })

  const deliveries = (data.deliveries || []).filter((d) => {
    if (!isCloudKeptDelivery(d)) { stats.deliveries++; return false }
    return true
  })

  const events = (data.events || []).filter((e) => {
    if (!isCloudKeptEvent(e)) { stats.events++; return false }
    return true
  })

  const stockLog = (data.stockLog || []).filter((l) => {
    if (!isCloudKeptStockLog(l)) { stats.stockLog++; return false }
    return true
  })

  const koiFishList = (data.koiFishList || []).filter((k) => {
    if (!isCloudKeptKoiFarm(k)) { stats.koiFish++; return false }
    return true
  }).map((k) => {
    const next = stripDeathPhoto(k)
    if (next.deathPhoto !== k.deathPhoto) stats.deathPhotos++
    return next
  })

  const customerKoiList = (data.customerKoiList || []).filter((r) => {
    if (!isCloudKeptCustomerKoi(r)) { stats.customerKoi++; return false }
    return true
  }).map((r) => {
    const next = stripDeathPhoto(r)
    if (next.deathPhoto !== r.deathPhoto) stats.deathPhotos++
    return next
  })

  const pondBefore = data.pondData || {}
  const pondData = filterPondLogsForCloud(pondBefore)
  stats.pondLogs = (
    (pondBefore.maintenanceLogs?.length || 0) - (pondData.maintenanceLogs?.length || 0)
    + (pondBefore.treatmentLogs?.length || 0) - (pondData.treatmentLogs?.length || 0)
    + (pondBefore.reminders?.length || 0) - (pondData.reminders?.length || 0)
  )

  return {
    data: {
      users: data.users,
      customers: data.customers || [],
      products: data.products || [],
      whatsappGroups: data.whatsappGroups || [],
      invoices,
      expenses,
      deliveries,
      events,
      stockLog,
      koiFishList,
      customerKoiList,
      pondData,
    },
    stats,
    purged: Object.values(stats).some((n) => n > 0),
  }
}

export function retentionSummaryLabel() {
  return 'App view: invoices/expenses 2y · deceased koi 90d · customer koi deceased 6mo · done deliveries 6mo · pond logs 1y'
}
