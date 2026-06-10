import { MAINTENANCE_TYPES } from '../data/constants'
import { buildNewEventRecord, sortEventsBySchedule } from './calendarOps'
import { isPendingReminder } from './pondOps'
import { touchUpdatedAt } from './syncMeta'

function recordTs(record) {
  if (!record?.updatedAt) return 0
  const t = new Date(record.updatedAt).getTime()
  return Number.isFinite(t) ? t : 0
}

function sameReminderLink(a, b) {
  return String(a || '').trim() === String(b || '').trim()
}

export function reminderActionLabel(type) {
  return MAINTENANCE_TYPES.find((m) => m.value === type)?.label || type || 'Maintenance'
}

/** Human-readable lines for pond reminder cards and calendar titles. */
export function reminderDisplayLines(reminder) {
  const action = reminderActionLabel(reminder?.type)
  const pondName = reminder?.pondName || 'Pond'
  return {
    action,
    title: `${pondName} — ${action}`,
    subtitle: `${reminder?.dueDate || ''} · ${reminder?.dueTime || '09:00'}`.replace(/^ · /, ''),
    note: String(reminder?.note || '').trim(),
  }
}

export function reminderToCalendarEventType(reminderType) {
  if (reminderType === 'feeding') return 'feeding'
  return 'maintenance'
}

export function reminderToCalendarEventFields(reminder) {
  const { title, note } = reminderDisplayLines(reminder)
  return {
    title,
    date: reminder.dueDate,
    time: reminder.dueTime || '09:00',
    type: reminderToCalendarEventType(reminder.type),
    note,
  }
}

function reminderFieldsMatchEvent(reminder, event) {
  const fields = reminderToCalendarEventFields(reminder)
  return (
    event.title === fields.title
    && event.date === fields.date
    && (event.time || '09:00') === fields.time
    && event.type === fields.type
    && (event.note || '') === (fields.note || '')
  )
}

/** Stable key so calendar backfill does not run on every pond blob reference change. */
export function pendingRemindersSyncKey(reminders = []) {
  return (reminders || [])
    .filter(isPendingReminder)
    .map((r) => [
      r.id,
      r.dueDate,
      r.dueTime,
      r.type,
      r.pondName,
      r.note,
      r.status,
    ].join(':'))
    .sort()
    .join('|')
}

/** Keep one calendar row per linked pond reminder (newest wins). */
export function dedupeEventsByPondReminderId(events = []) {
  const unlinked = []
  const linkedByReminderId = new Map()

  for (const event of events || []) {
    const linkId = String(event?.pondReminderId || '').trim()
    if (!linkId) {
      unlinked.push(event)
      continue
    }
    const existing = linkedByReminderId.get(linkId)
    if (!existing || recordTs(event) >= recordTs(existing)) {
      linkedByReminderId.set(linkId, event)
    }
  }

  return [...unlinked, ...linkedByReminderId.values()]
}

export function upsertCalendarEventForReminder(events, reminder, createdBy) {
  const fields = reminderToCalendarEventFields(reminder)
  const existing = (events || []).find((e) => sameReminderLink(e.pondReminderId, reminder.id))
  if (existing) {
    if (reminderFieldsMatchEvent(reminder, existing)) return events || []
    const next = (events || []).map((e) => (
      sameReminderLink(e.pondReminderId, reminder.id)
        ? touchUpdatedAt({ ...e, ...fields, pondReminderId: reminder.id })
        : e
    ))
    return next
  }
  const built = buildNewEventRecord(fields, { createdBy, existingEvents: events })
  if (!built.ok) return events || []
  return [...(events || []), { ...built.event, pondReminderId: reminder.id }]
}

export function removeCalendarEventForReminder(events, reminderId) {
  const id = String(reminderId)
  const next = (events || []).filter((e) => !sameReminderLink(e.pondReminderId, id))
  return next.length === (events || []).length ? (events || []) : next
}

/** Link pending pond reminders to calendar events; drop events for completed/deleted reminders. */
export function backfillCalendarEventsForReminders(events, reminders, { createdBy, pondsReady = true } = {}) {
  if (!pondsReady) return events || []

  const allReminders = reminders || []
  const pending = allReminders.filter(isPendingReminder)
  const pendingIds = new Set(pending.map((r) => String(r.id)))
  const knownIds = new Set(allReminders.map((r) => String(r.id)))

  let next = dedupeEventsByPondReminderId(events || [])
  let changed = next.length !== (events || []).length
  const withoutStale = removeStalePondReminderEvents(next, pendingIds, knownIds)
  if (withoutStale.length !== next.length) changed = true
  next = withoutStale

  for (const reminder of pending) {
    if (next.some((e) => sameReminderLink(e.pondReminderId, reminder.id))) continue
    const updated = upsertCalendarEventForReminder(next, reminder, createdBy)
    if (updated !== next) {
      next = updated
      changed = true
    }
  }

  return changed ? next : (events || [])
}

function removeStalePondReminderEvents(events, pendingIds, knownIds) {
  return (events || []).filter((e) => {
    if (!e.pondReminderId) return true
    const linkId = String(e.pondReminderId)
    if (pendingIds.has(linkId)) return true
    // Reminder still exists but is done — drop linked calendar row.
    if (knownIds.has(linkId)) return false
    // Reminder deleted from pond data — drop linked calendar row.
    return false
  })
}

/** @deprecated Virtual overlay caused duplicate rows; calendar uses linked events only. */
export function mergeEventsWithPondReminders(events = []) {
  return sortEventsBySchedule(dedupeEventsByPondReminderId(events))
}
