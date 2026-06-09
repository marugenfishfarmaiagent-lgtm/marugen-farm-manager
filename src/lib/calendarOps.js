import { today } from '../data/constants'
import { touchUpdatedAt } from './syncMeta'

export const EVENT_TYPE_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'feeding', label: 'Feeding' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'customer', label: 'Customer visit' },
  { value: 'other', label: 'Other' },
]

const EVENT_TYPE_VALUES = new Set(EVENT_TYPE_OPTIONS.map((t) => t.value))
const TITLE_MAX = 120
const NOTE_MAX = 500
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Events table uses BIGINT ids — keep client ids numeric. */
export function newEventId(existingEvents = []) {
  let id = Date.now()
  const ids = new Set((existingEvents || []).map((e) => String(e.id)))
  while (ids.has(String(id))) id += 1
  return id
}

export function sameEventId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function normalizeEventRecord(event) {
  if (!event) return event
  const type = EVENT_TYPE_VALUES.has(event.type) ? event.type : 'other'
  const timeRaw = String(event.time || '09:00').trim()
  const time = TIME_RE.test(timeRaw) ? timeRaw : '09:00'
  return {
    ...event,
    title: String(event.title || '').trim().slice(0, TITLE_MAX),
    date: String(event.date || '').trim(),
    time,
    type,
    note: String(event.note || '').slice(0, NOTE_MAX),
    createdBy: event.createdBy || '',
  }
}

/**
 * @returns {{ ok: true, title: string, date: string, time: string, type: string, note: string } | { ok: false, message: string }}
 */
export function validateEventFields(fields) {
  const title = fields.title?.trim()
  if (!title) {
    return { ok: false, message: 'Enter an event title.' }
  }
  if (title.length > TITLE_MAX) {
    return { ok: false, message: `Title must be ${TITLE_MAX} characters or fewer.` }
  }
  const date = fields.date?.trim()
  if (!date) {
    return { ok: false, message: 'Choose an event date.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: 'Choose a valid event date.' }
  }
  const timeRaw = (fields.time || '09:00').trim()
  if (!TIME_RE.test(timeRaw)) {
    return { ok: false, message: 'Choose a valid time (HH:MM).' }
  }
  const type = fields.type || 'other'
  if (!EVENT_TYPE_VALUES.has(type)) {
    return { ok: false, message: 'Select a valid event type.' }
  }
  if (fields.note != null && String(fields.note).length > NOTE_MAX) {
    return { ok: false, message: `Note must be ${NOTE_MAX} characters or fewer.` }
  }
  return {
    ok: true,
    title,
    date,
    time: timeRaw,
    type,
    note: fields.note?.trim() || '',
  }
}

export function buildNewEventRecord(fields, { createdBy, existingEvents = [] } = {}) {
  const check = validateEventFields(fields)
  if (!check.ok) return check
  return {
    ok: true,
    event: touchUpdatedAt(normalizeEventRecord({
      id: newEventId(existingEvents),
      title: check.title,
      date: check.date,
      time: check.time,
      type: check.type,
      note: check.note,
      createdBy: createdBy || 'Staff',
    })),
  }
}

export function buildUpdatedEventRecord(fields, existing) {
  if (!existing) return { ok: false, message: 'Event not found.' }
  const check = validateEventFields({
    title: fields.title ?? existing.title,
    date: fields.date ?? existing.date,
    time: fields.time ?? existing.time,
    type: fields.type ?? existing.type,
    note: fields.note ?? existing.note,
  })
  if (!check.ok) return check
  return {
    ok: true,
    event: touchUpdatedAt(normalizeEventRecord({
      ...existing,
      title: check.title,
      date: check.date,
      time: check.time,
      type: check.type,
      note: check.note,
      createdBy: existing.createdBy || fields.createdBy || 'Staff',
    })),
  }
}

/** Sort key for calendar lists and dashboard widgets. */
export function sortEventsBySchedule(events = []) {
  return [...events].sort(
    (a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`),
  )
}

export function filterTodayEvents(events = [], dateStr = today()) {
  return sortEventsBySchedule(events.filter((e) => e.date === dateStr))
}
