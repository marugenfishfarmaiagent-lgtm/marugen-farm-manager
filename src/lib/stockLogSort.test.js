import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sortStockLog } from './stockLogSort.js'

describe('sortStockLog', () => {
  it('orders by most recent updatedAt first', () => {
    const rows = [
      { id: 1, date: '2026-06-15', note: 'Invoice INV20260615-01', type: 'sell', updatedAt: '2026-06-15T08:00:00.000Z' },
      { id: 2, date: '2026-06-15', note: 'feeding', type: 'use', updatedAt: '2026-06-15T12:00:00.000Z' },
      { id: 3, date: '2026-06-14', note: 'Invoice INV20260614-03', type: 'sell', updatedAt: '2026-06-15T10:00:00.000Z' },
      { id: 4, date: '2026-06-15', note: 'Manual restock', type: 'restock', updatedAt: '2026-06-15T14:00:00.000Z' },
    ]
    const sorted = sortStockLog(rows)
    assert.deepEqual(sorted.map((r) => r.note), [
      'Manual restock',
      'feeding',
      'Invoice INV20260614-03',
      'Invoice INV20260615-01',
    ])
  })

  it('falls back to numeric id when updatedAt ties', () => {
    const ts = '2026-06-15T12:00:00.000Z'
    const rows = [
      { id: 100, type: 'sell', updatedAt: ts },
      { id: 200, type: 'use', updatedAt: ts },
    ]
    const sorted = sortStockLog(rows)
    assert.deepEqual(sorted.map((r) => r.id), [200, 100])
  })
})
