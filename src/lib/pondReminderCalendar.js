import { MAINTENANCE_TYPES } from '../data/constants'
import { buildNewEventRecord, sortEventsBySchedule } from './calendarOps'
import { isPendingReminder } from './pondOps'
import { touchUpdatedAt } from './syncMeta'

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

/** Read-only calendar row for reminders not yet linked to an event row. */
export function reminderToVirtualCalendarEvent(reminder) {
  const fields = reminderToCalendarEventFields(reminder)
  return {
    id: `pond-rem-${reminder.id}`,
    ...fields,
    pondReminderId: reminder.id,
    isPondReminder: true,
    createdBy: 'Pond Mgmt',
  }
}

export function upsertCalendarEventForReminder(events, reminder, createdBy) {
  const fields = reminderToCalendarEventFields(reminder)
  const existing = (events || []).find((e) => e.pondReminderId === reminder.id)
  if (existing) {
    const next = (events || []).map((e) => (
      e.pondReminderId === reminder.id
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
  return (events || []).filter((e) => String(e.pondReminderId || '') !== id)
}

/** Show pond reminders on calendar even before cloud event rows are created. */
export function mergeEventsWithPondReminders(events = [], reminders = []) {
  const linked = new Set(
    (events || []).filter((e) => e.pondReminderId).map((e) => String(e.pondReminderId)),
  )
  const virtual = (reminders || [])
    .filter(isPendingReminder)
    .filter((r) => !linked.has(String(r.id)))
    .map(reminderToVirtualCalendarEvent)
  return sortEventsBySchedule([...(events || []), ...virtual])
}

/** Link pending pond reminders to calendar events; drop events for completed reminders. */
export function backfillCalendarEventsForReminders(events, reminders, createdBy) {
  const pending = (reminders || []).filter(isPendingReminder)
  const pendingIds = new Set(pending.map((r) => String(r.id)))

  let next = removeOrphanedPondReminderEvents(events || [], pendingIds)
  let changed = next.length !== (events || []).length

  for (const reminder of pending) {
    if (next.some((e) => String(e.pondReminderId) === String(reminder.id))) continue
    next = upsertCalendarEventForReminder(next, reminder, createdBy)
    changed = true
  }

  return changed ? next : (events || [])
}

function removeOrphanedPondReminderEvents(events, pendingIds) {
  return events.filter((e) => !e.pondReminderId || pendingIds.has(String(e.pondReminderId)))
}
