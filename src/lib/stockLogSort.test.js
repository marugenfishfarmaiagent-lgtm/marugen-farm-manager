import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sortStockLog } from './stockLogSort.js'

describe('sortStockLog', () => {
  it('orders manual entries by creation id (newest first)', () => {
    const t1 = Date.parse('2026-06-15T12:00:00.000Z')
    const t2 = Date.parse('2026-06-15T12:05:00.000Z')
    const rows = [
      { id: t1, type: 'restock', note: '111111', updatedAt: '2026-06-15T12:00:00.000Z' },
      { id: t2, type: 'restock', note: '2222222', updatedAt: '2026-06-15T12:05:00.000Z' },
    ]
    const sorted = sortStockLog(rows)
    assert.deepEqual(sorted.map((r) => r.note), ['2222222', '111111'])
  })

  it('puts newest manual restock above invoice sells from earlier in the day', () => {
    const rows = [
      { id: 83928374620, type: 'sell', note: 'Invoice INV20260615-05', updatedAt: '2026-06-15T09:00:00.000Z' },
      { id: Date.parse('2026-06-15T14:00:00.000Z'), type: 'restock', note: '2222222', updatedAt: '2026-06-15T14:00:00.000Z' },
      { id: Date.parse('2026-06-15T13:00:00.000Z'), type: 'use', note: 'feeding', updatedAt: '2026-06-15T13:00:00.000Z' },
    ]
    const sorted = sortStockLog(rows)
    assert.deepEqual(sorted.map((r) => r.note), [
      '2222222',
      'feeding',
      'Invoice INV20260615-05',
    ])
  })
})
