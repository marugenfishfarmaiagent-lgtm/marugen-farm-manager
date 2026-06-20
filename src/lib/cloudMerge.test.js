import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveKoiConflict } from './koiConflict.js'
import { mergePondData } from './pondMerge.js'
import { KOI_STATUS } from '../data/constants.js'

function makePond(reminders, updatedAt = '2026-01-01T10:00:00.000Z') {
  return { ponds: [], maintenanceLogs: [], treatmentLogs: [], reminders, treatmentGuides: [], updatedAt }
}

function makeReminder(id, status, updatedAt, extra = {}) {
  return { id, status, updatedAt, pondId: 'P1', type: 'water_test', dueDate: '2026-01-01', ...extra }
}

describe('mergePondData — reminder done status', () => {
  it('local DONE beats remote PENDING when local is newer', () => {
    const local = makePond(
      [makeReminder('R1', 'done', '2026-01-01T10:00:10.000Z', { completedAt: '2026-01-01' })],
      '2026-01-01T10:00:10.000Z',
    )
    const remote = makePond(
      [makeReminder('R1', 'pending', '2026-01-01T10:00:00.000Z')],
      '2026-01-01T10:00:00.000Z',
    )
    const merged = mergePondData(local, remote)
    const r = merged.reminders.find((x) => x.id === 'R1')
    assert.equal(r.status, 'done', 'should stay done when local is newer')
  })

  it('local DONE beats remote PENDING even when remote is newer (done is terminal)', () => {
    const local = makePond(
      [makeReminder('R1', 'done', '2026-01-01T10:00:00.000Z', { completedAt: '2026-01-01' })],
      '2026-01-01T10:00:00.000Z',
    )
    const remote = makePond(
      [makeReminder('R1', 'pending', '2026-01-01T10:00:10.000Z', { note: 'Updated note' })],
      '2026-01-01T10:00:10.000Z',
    )
    const merged = mergePondData(local, remote)
    const r = merged.reminders.find((x) => x.id === 'R1')
    assert.equal(r.status, 'done', 'done is terminal — remote pending must not revert it')
  })

  it('preserves content edits from newer pending record while keeping done status', () => {
    const local = makePond(
      [makeReminder('R1', 'done', '2026-01-01T10:00:00.000Z', { completedAt: '2026-01-01', note: 'old note' })],
      '2026-01-01T10:00:00.000Z',
    )
    const remote = makePond(
      [makeReminder('R1', 'pending', '2026-01-01T10:00:10.000Z', { note: 'Updated note' })],
      '2026-01-01T10:00:10.000Z',
    )
    const merged = mergePondData(local, remote)
    const r = merged.reminders.find((x) => x.id === 'R1')
    assert.equal(r.status, 'done', 'status must be done')
    assert.equal(r.note, 'Updated note', 'content edit from newer pending record must be preserved')
    assert.ok(r.completedAt, 'completedAt must be carried over from done record')
  })

  it('remote DONE beats local PENDING (sync from another device)', () => {
    const local = makePond(
      [makeReminder('R1', 'pending', '2026-01-01T10:00:00.000Z')],
      '2026-01-01T10:00:00.000Z',
    )
    const remote = makePond(
      [makeReminder('R1', 'done', '2026-01-01T10:00:10.000Z', { completedAt: '2026-01-01' })],
      '2026-01-01T10:00:10.000Z',
    )
    const merged = mergePondData(local, remote)
    const r = merged.reminders.find((x) => x.id === 'R1')
    assert.equal(r.status, 'done', 'remote done must win over local pending')
  })
})

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
