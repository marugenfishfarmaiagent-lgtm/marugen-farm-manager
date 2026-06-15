import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sortStockLog } from './stockLogSort.js'

describe('sortStockLog', () => {
  it('orders by date desc then invoice id desc', () => {
    const rows = [
      { id: 1, date: '2026-06-14', note: 'Invoice INV20260614-01', type: 'sell' },
      { id: 2, date: '2026-06-15', note: 'Invoice INV20260615-01', type: 'sell' },
      { id: 3, date: '2026-06-14', note: 'Invoice INV20260614-03', type: 'sell' },
      { id: 4, date: '2026-06-15', note: 'Invoice INV20260615-03', type: 'sell' },
      { id: 5, date: '2026-06-14', note: 'Invoice cancelled INV20260614-03', type: 'restock' },
    ]
    const sorted = sortStockLog(rows)
    assert.deepEqual(sorted.map((r) => r.note), [
      'Invoice INV20260615-03',
      'Invoice INV20260615-01',
      'Invoice INV20260614-03',
      'Invoice cancelled INV20260614-03',
      'Invoice INV20260614-01',
    ])
  })
})
