import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveKoiConflict } from './koiConflict.js'
import { KOI_STATUS } from '../data/constants.js'

describe('resolveKoiConflict', () => {
  it('keeps newer local sold over stale remote available (just-marked sale)', () => {
    const local = {
      id: 'KOI-1',
      status: KOI_STATUS.SOLD,
      soldTo: 1,
      updatedAt: '2026-06-15T12:00:00.000Z',
    }
    const remote = {
      id: 'KOI-1',
      status: KOI_STATUS.AVAILABLE,
      updatedAt: '2026-06-15T10:00:00.000Z',
    }
    assert.equal(resolveKoiConflict(local, remote), local)
  })

  it('prefers newer remote available over stale local sold (refund restore)', () => {
    const local = {
      id: 'KOI-1',
      status: KOI_STATUS.SOLD,
      soldTo: 1,
      updatedAt: '2026-06-15T10:00:00.000Z',
    }
    const remote = {
      id: 'KOI-1',
      status: KOI_STATUS.AVAILABLE,
      soldTo: null,
      updatedAt: '2026-06-15T12:00:00.000Z',
    }
    assert.equal(resolveKoiConflict(local, remote), remote)
  })

  it('prefers newer local available over stale remote sold (refund flush)', () => {
    const local = {
      id: 'KOI-1',
      status: KOI_STATUS.AVAILABLE,
      soldTo: null,
      updatedAt: '2026-06-15T12:00:00.000Z',
    }
    const remote = {
      id: 'KOI-1',
      status: KOI_STATUS.SOLD,
      soldTo: 1,
      updatedAt: '2026-06-15T10:00:00.000Z',
    }
    assert.equal(resolveKoiConflict(local, remote), local)
  })
})
