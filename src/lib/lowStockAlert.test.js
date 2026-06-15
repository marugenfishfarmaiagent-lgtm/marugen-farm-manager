import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { wasLowStockAlertShownToday, markLowStockAlertShownToday } from './lowStockAlert.js'

const STORAGE_KEY = 'marugen_low_stock_alert_v1'
const store = new Map()
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' })

describe('lowStockAlert', () => {
  beforeEach(() => {
    store.clear()
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, v) },
      removeItem: (k) => { store.delete(k) },
    }
  })

  it('tracks daily alert per user', () => {
    assert.equal(wasLowStockAlertShownToday(7), false)
    markLowStockAlertShownToday(7)
    assert.equal(wasLowStockAlertShownToday(7), true)
    assert.equal(wasLowStockAlertShownToday(8), false)
  })

  it('stores today in Singapore timezone', () => {
    markLowStockAlertShownToday('staff-1')
    const map = JSON.parse(store.get(STORAGE_KEY))
    assert.equal(map['staff-1'], todayKey())
  })
})
