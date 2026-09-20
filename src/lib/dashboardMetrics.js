import { getLowStockProducts } from './inventoryOps'

/**
 * Pure dashboard KPI + widget metrics (shared by Dashboard UI and tests).
 * @param {object} input
 * @param {function(string): boolean} input.can - permission check for current user
 */
export function computeDashboardMetrics({
  products = [],
  can,
}) {
  const canFn = typeof can === 'function' ? can : () => false

  const lowStock = getLowStockProducts(products)

  const kpiCards = [
    ...(canFn('inventory') ? [{
      label: 'Low Stock Alerts',
      value: String(lowStock.length),
      subtitle: lowStock.length ? lowStock.slice(0, 2).map((p) => p.name).join(', ') : 'All stocked',
      tab: 'inventory',
    }] : []),
    ...(canFn('inventory') ? [{
      label: 'Total Products',
      value: String(products.length),
      subtitle: 'In inventory',
      tab: 'inventory',
    }] : []),
  ]

  return {
    lowStock,
    kpiCards,
  }
}
