const KEYS = {
  products: 'marugen_products_v1',
  stockLog: 'marugen_stock_log_v1',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return fallback
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function loadProducts() {
  const list = read(KEYS.products, [])
  return Array.isArray(list) ? list : []
}

export function saveProducts(list) {
  write(KEYS.products, list)
}

export function loadStockLog() {
  const list = read(KEYS.stockLog, [])
  return Array.isArray(list) ? list : []
}

export function saveStockLog(list) {
  write(KEYS.stockLog, list)
}
