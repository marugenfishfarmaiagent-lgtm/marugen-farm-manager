const STORAGE_KEY = 'marugen_low_stock_alert_v1'
const APP_TIMEZONE = 'Asia/Singapore'

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE })
}

function readMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // ignore quota / private mode
  }
}

/** True when this user already received the daily low-stock toast today (SG date). */
export function wasLowStockAlertShownToday(userId) {
  if (userId == null || userId === '') return false
  const map = readMap()
  return map[String(userId)] === todayKey()
}

/** Remember that this user saw the low-stock toast for today. */
export function markLowStockAlertShownToday(userId) {
  if (userId == null || userId === '') return
  const map = readMap()
  map[String(userId)] = todayKey()
  writeMap(map)
}
