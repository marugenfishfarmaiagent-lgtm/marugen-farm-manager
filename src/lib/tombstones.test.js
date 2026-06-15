import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { markDeleted, peekDeletions, unmarkDeleted } from './syncDeletions.js'
import {
  applyServerTombstones,
  filterMergeDeletions,
  isRowResurrectedAfterTombstone,
  stripTombstonedRows,
} from './tombstones.js'

describe('tombstone resurrection', () => {
  it('keeps rows updated after the tombstone deleted_at', () => {
    const tombstones = [{
      entity: 'invoices',
      recordId: 'INV20260614-01',
      deletedAt: '2026-06-14T08:00:00.000Z',
    }]
    const rows = [{
      id: 'INV20260614-01',
      status: 'pending',
      updatedAt: '2026-06-14T10:00:00.000Z',
    }]
    assert.equal(isRowResurrectedAfterTombstone(rows[0], tombstones[0].deletedAt), true)
    assert.deepEqual(stripTombstonedRows(rows, 'invoices', tombstones), rows)
  })

  it('strips rows that still match an active tombstone', () => {
    const tombstones = [{
      entity: 'invoices',
      recordId: 'INV20260614-01',
      deletedAt: '2026-06-14T10:00:00.000Z',
    }]
    const rows = [{
      id: 'INV20260614-01',
      status: 'pending',
      updatedAt: '2026-06-14T08:00:00.000Z',
    }]
    assert.deepEqual(stripTombstonedRows(rows, 'invoices', tombstones), [])
  })

  it('does not mark resurrected server rows as locally deleted', () => {
    markDeleted('invoices', 'INV20260614-01')
    const tombstones = [{
      entity: 'invoices',
      recordId: 'INV20260614-01',
      deletedAt: '2026-06-14T08:00:00.000Z',
    }]
    applyServerTombstones(tombstones, {
      invoices: [{
        id: 'INV20260614-01',
        updatedAt: '2026-06-14T11:00:00.000Z',
      }],
    })
    assert.equal(peekDeletions('invoices').includes('INV20260614-01'), false)
    unmarkDeleted('invoices', 'INV20260614-01')
  })

  it('filterMergeDeletions keeps resurrected local rows in merge', () => {
    markDeleted('invoices', 'INV20260614-01')
    const tombstones = [{
      entity: 'invoices',
      recordId: 'INV20260614-01',
      deletedAt: '2026-06-14T08:00:00.000Z',
    }]
    const local = [{
      id: 'INV20260614-01',
      status: 'pending',
      updatedAt: '2026-06-14T12:00:00.000Z',
    }]
    const pending = filterMergeDeletions(
      'invoices',
      tombstones,
      local,
      [],
      peekDeletions('invoices'),
    )
    assert.deepEqual(pending, [])
    unmarkDeleted('invoices', 'INV20260614-01')
  })
})
