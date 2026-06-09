import {
  formatSGD,
  getInvoiceStatus,
  KOI_STATUS,
  CUSTOMER_KOI_STATUS,
  today,
  monthStart,
} from '../data/constants'
import { calcInvoiceAmounts } from './invoiceDesign'
import { isStockTracked } from './productCatalog'
import { isAppVisibleInvoice } from './retention'
import { filterTodayEvents } from './calendarOps'

/**
 * Pure dashboard KPI + widget metrics (shared by Dashboard UI and tests).
 * @param {object} input
 * @param {function(string): boolean} input.can - permission check for current user
 */
export function computeDashboardMetrics({
  invoices = [],
  expenses = [],
  customers = [],
  products = [],
  events = [],
  deliveries = [],
  koiFishList = [],
  customerKoiList = [],
  can,
}) {
  const canFn = typeof can === 'function' ? can : () => false
  const monthStartStr = monthStart()
  const todayStr = today()

  const monthlyRevenue = invoices
    .filter((i) => getInvoiceStatus(i) === 'paid' && (i.date || '') >= monthStartStr)
    .reduce((s, i) => s + calcInvoiceAmounts(i).total, 0)

  const openInvoices = invoices.filter((i) => {
    const status = getInvoiceStatus(i)
    return status === 'pending' || status === 'overdue'
  })
  const pendingRevenue = openInvoices.reduce((s, i) => s + calcInvoiceAmounts(i).total, 0)

  const monthlyExpenseReceipts = expenses.filter((e) => (e.date || '') >= monthStartStr)
  const monthlyExpenses = monthlyExpenseReceipts
    .filter((e) => Number(e.amount) > 0)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)

  const canInvoices = canFn('invoices')
  const canExpenses = canFn('expenses')
  const canAccounting = canFn('accounting')

  const unbookedExpenses = canExpenses ? expenses.filter((e) => !e.booked).length : 0
  const unbookedInvoices = canInvoices
    ? invoices.filter((i) => !i.booked && getInvoiceStatus(i) !== 'cancelled').length
    : 0
  const pendingAccountsCount = unbookedExpenses + unbookedInvoices

  let pendingAccountsTab = null
  let pendingAccountsSubtitle = 'Not entered in accounts'
  if (pendingAccountsCount > 0) {
    const parts = []
    if (unbookedInvoices > 0 && canInvoices) {
      parts.push(`${unbookedInvoices} invoice${unbookedInvoices === 1 ? '' : 's'}`)
    }
    if (unbookedExpenses > 0 && canExpenses) {
      parts.push(`${unbookedExpenses} receipt${unbookedExpenses === 1 ? '' : 's'}`)
    }
    if (parts.length) pendingAccountsSubtitle = parts.join(' · ')
    if (unbookedInvoices > 0 && canInvoices) pendingAccountsTab = 'invoices'
    else if (unbookedExpenses > 0 && canExpenses) pendingAccountsTab = 'expenses'
  }

  const lowStock = products.filter(
    (p) => isStockTracked(p) && p.minStock > 0 && p.stock <= p.minStock,
  )

  const todayEvents = filterTodayEvents(events, todayStr)

  const scheduledDeliveries = deliveries.filter((d) => d.status === 'scheduled').length
  const todayDeliveries = deliveries.filter((d) => (d.schedule || '').startsWith(todayStr)).length

  const recentInvoices = [...invoices]
    .filter(isAppVisibleInvoice)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5)

  const recentCustomers = [...customers]
    .sort((a, b) => (Number(b.totalSpent) || 0) - (Number(a.totalSpent) || 0))
    .slice(0, 5)

  const koiAvailable = koiFishList.filter((k) => k.status === KOI_STATUS.AVAILABLE).length
  const koiSold = koiFishList.filter((k) => k.status === KOI_STATUS.SOLD).length
  const koiInPond = customerKoiList.filter((r) => r.status === CUSTOMER_KOI_STATUS.IN_POND).length

  const kpiCards = [
    ...(canInvoices ? [{
      label: 'Revenue This Month',
      value: formatSGD(monthlyRevenue),
      subtitle: 'Paid invoices',
      tab: 'invoices',
    }] : []),
    ...(canInvoices ? [{
      label: 'Outstanding Invoices',
      value: String(openInvoices.length),
      subtitle: formatSGD(pendingRevenue),
      tab: 'invoices',
    }] : []),
    ...(canFn('inventory') ? [{
      label: 'Low Stock Alerts',
      value: String(lowStock.length),
      subtitle: lowStock.length ? lowStock.slice(0, 2).map((p) => p.name).join(', ') : 'All stocked',
      tab: 'inventory',
    }] : []),
    ...(canFn('deliveries') ? [{
      label: 'Deliveries Today',
      value: String(todayDeliveries),
      subtitle: `${scheduledDeliveries} scheduled`,
      tab: 'deliveries',
    }] : []),
    ...(canFn('koifish') ? [{
      label: 'Active Koi Fish',
      value: String(koiAvailable),
      subtitle: `${koiSold} sold`,
      tab: 'koifish',
    }] : []),
    ...(canExpenses ? [{
      label: 'Monthly Expenses',
      value: monthlyExpenses > 0
        ? formatSGD(monthlyExpenses)
        : `${monthlyExpenseReceipts.length} receipts`,
      subtitle: monthlyExpenses > 0 ? 'Legacy amounts' : 'Receipt count this month',
      tab: 'expenses',
    }] : []),
  ]

  return {
    monthStart: monthStartStr,
    todayStr,
    monthlyRevenue,
    openInvoices,
    pendingRevenue,
    monthlyExpenses,
    monthlyExpenseReceiptCount: monthlyExpenseReceipts.length,
    lowStock,
    todayEvents,
    scheduledDeliveries,
    todayDeliveries,
    recentInvoices,
    recentCustomers,
    koiAvailable,
    koiSold,
    koiInPond,
    kpiCards,
    pendingAccountsCount,
    pendingAccountsTab,
    pendingAccountsSubtitle,
    showKoiSummary: canFn('koifish') || canFn('customerkoi'),
    showPendingAccounts: canAccounting && (canExpenses || canInvoices) && pendingAccountsCount > 0,
  }
}

/** Invoice line total for dashboard display (respects discounts). */
export function dashboardInvoiceTotal(inv) {
  return calcInvoiceAmounts(inv).total
}
