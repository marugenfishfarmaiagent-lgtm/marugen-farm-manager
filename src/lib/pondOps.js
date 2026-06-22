import { POND_TYPES, MAINTENANCE_TYPES, today } from '../data/constants'
import { normalizeAssignedUserIds } from './assignTeam'
import { touchPondData, touchUpdatedAt } from './syncMeta'

const POND_TYPE_VALUES = new Set(POND_TYPES.map((t) => t.value))
const MAINTENANCE_TYPE_VALUES = new Set(MAINTENANCE_TYPES.map((t) => t.value))
const REMINDER_REPEAT = new Set(['none', 'daily', 'weekly', 'monthly'])

export function samePondId(a, b) {
  if (a == null || b == null || a === '' || b === '') return false
  return String(a) === String(b)
}

export function parsePondVolume(value) {
  if (value === '' || value == null) return 0
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseWaterParam(value, { min = 0, max = null } = {}) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min) return null
  if (max != null && n > max) return null
  return n
}

export function validatePondFields(fields) {
  const name = fields.name?.trim()
  if (!name) {
    return { ok: false, message: 'Select or enter a pond name.' }
  }
  const volume = parsePondVolume(fields.volume)
  if (volume == null) {
    return { ok: false, message: 'Volume must be zero or greater.' }
  }
  if (fields.type && !POND_TYPE_VALUES.has(fields.type)) {
    return { ok: false, message: 'Select a valid pond type.' }
  }
  return { ok: true, name, volume }
}

export function validateMaintenanceForm(form) {
  if (!form.pondId) {
    return { ok: false, message: 'Select which pond this maintenance is for.' }
  }
  if (!form.date?.trim()) {
    return { ok: false, message: 'Choose the maintenance date.' }
  }
  if (form.type && !MAINTENANCE_TYPE_VALUES.has(form.type)) {
    return { ok: false, message: 'Select a valid maintenance type.' }
  }
  if (form.showParams) {
    for (const [key, label, opts] of [
      ['pH', 'pH', { min: 0, max: 14 }],
      ['ammonia', 'Ammonia', { min: 0 }],
      ['nitrite', 'Nitrite', { min: 0 }],
      ['saltLevel', 'Salt level', { min: 0, max: 10 }],
    ]) {
      if (form[key] !== '' && form[key] != null) {
        const parsed = parseWaterParam(form[key], opts)
        if (parsed == null) {
          return { ok: false, message: `Enter a valid ${label} value, or leave blank.` }
        }
      }
    }
  }
  return { ok: true }
}

export function validateTreatmentForm(form) {
  if (!form.pondId) {
    return { ok: false, message: 'Select which pond to treat.' }
  }
  if (!form.medicine?.trim()) {
    return { ok: false, message: 'Enter the medicine or treatment name.' }
  }
  if (!form.startDate?.trim()) {
    return { ok: false, message: 'Choose the treatment start date.' }
  }
  if (form.endDate && form.startDate && form.endDate < form.startDate) {
    return { ok: false, message: 'End date cannot be before start date.' }
  }
  return { ok: true }
}

export function validateReminderForm(form) {
  if (!form.pondId) {
    return { ok: false, message: 'Select which pond this reminder is for.' }
  }
  if (!form.dueDate?.trim()) {
    return { ok: false, message: 'Choose a due date for the reminder.' }
  }
  if (form.type && !MAINTENANCE_TYPE_VALUES.has(form.type)) {
    return { ok: false, message: 'Select a valid reminder type.' }
  }
  if (form.repeat && !REMINDER_REPEAT.has(form.repeat)) {
    return { ok: false, message: 'Select a valid repeat option.' }
  }
  return { ok: true }
}

/** Build a storable maintenance log (no UI-only fields). */
export function buildMaintenanceLogEntry(form, { pond, performedBy }) {
  const entry = {
    id: form.id,
    pondId: pond.id,
    pondName: pond.name,
    type: form.type || 'water_test',
    date: form.date || today(),
    notes: form.notes?.trim() || '',
    performedBy: performedBy || '',
  }
  if (form.showParams) {
    const pH = parseWaterParam(form.pH, { min: 0, max: 14 })
    const ammonia = parseWaterParam(form.ammonia, { min: 0 })
    const nitrite = parseWaterParam(form.nitrite, { min: 0 })
    const saltLevel = parseWaterParam(form.saltLevel, { min: 0, max: 10 })
    if (pH != null) entry.pH = pH
    if (ammonia != null) entry.ammonia = ammonia
    if (nitrite != null) entry.nitrite = nitrite
    if (saltLevel != null) entry.saltLevel = saltLevel
  }
  if (form.washFilter) entry.washFilter = true
  if (form.waterChange) entry.waterChange = true
  if (form.unilight) entry.unilight = true
  const medTypes = (form.medicineTypes || []).filter(Boolean)
  if (medTypes.length > 0) entry.medicineTypes = medTypes
  return entry
}

export function applyMaintenanceToPond(pond, form) {
  const date = form.date || today()
  const patch = { lastChecked: date }

  if (form.showParams) {
    const saltLevel = parseWaterParam(form.saltLevel, { min: 0, max: 10 })
    if (saltLevel != null) { patch.lastSalt = saltLevel; patch.lastSaltDate = date }
    // keep existing pH/NH3/NO2 in pond data for backward-compat even though not shown on card
    const pH = parseWaterParam(form.pH, { min: 0, max: 14 })
    const ammonia = parseWaterParam(form.ammonia, { min: 0 })
    const nitrite = parseWaterParam(form.nitrite, { min: 0 })
    if (pH != null) patch.lastpH = pH
    if (ammonia != null) patch.lastAmmonia = ammonia
    if (nitrite != null) patch.lastNitrite = nitrite
  }
  if (form.washFilter) patch.lastWashFilter = date
  if (form.waterChange) patch.lastWaterChange = date
  if (form.unilight) patch.lastUnilight = date
  const medTypes = (form.medicineTypes || []).filter(Boolean)
  if (medTypes.length > 0) { patch.lastMedicineTypes = medTypes; patch.lastMedicineDate = date }

  const hasAnyUpdate = Object.keys(patch).length > 1 // more than just lastChecked
  if (!hasAnyUpdate && !form.showParams) return pond
  return { ...pond, ...patch }
}

export function findPondById(ponds, pondId) {
  return (ponds || []).find((p) => samePondId(p.id, pondId)) || null
}

export function normalizeReminderStatus(status) {
  const value = String(status || 'pending').toLowerCase()
  return value === 'done' ? 'done' : 'pending'
}

export function isPendingReminder(reminder) {
  if (!reminder) return false
  return normalizeReminderStatus(reminder.status) === 'pending'
}

export function isDoneReminder(reminder) {
  if (!reminder) return false
  return normalizeReminderStatus(reminder.status) === 'done'
}

/** Keep status and completedAt consistent after cloud merge or local edits. */
export function normalizeReminderRecord(reminder) {
  if (!reminder) return reminder
  const assignedUserIds = normalizeAssignedUserIds(reminder.assignedUserIds)
  const status = normalizeReminderStatus(reminder.status)
  if (status === 'pending') {
    const next = { ...reminder, status: 'pending', assignedUserIds }
    delete next.completedAt
    return next
  }
  return {
    ...reminder,
    status: 'done',
    assignedUserIds,
    completedAt: reminder.completedAt || today(),
  }
}

/** Mark a pending reminder complete; returns { changed, data }. */
export function markReminderCompleteInPondData(pondData, reminderId) {
  if (!pondData || reminderId == null) return { changed: false, data: pondData }
  const reminders = pondData.reminders || []
  const id = String(reminderId)
  const target = reminders.find((x) => String(x.id) === id)
  if (!target || !isPendingReminder(target)) return { changed: false, data: pondData }

  const nextReminders = reminders.map((x) => (
    String(x.id) === id
      ? touchUpdatedAt(normalizeReminderRecord({ ...x, status: 'done', completedAt: today() }))
      : x
  ))
  return {
    changed: true,
    data: touchPondData({ ...pondData, reminders: nextReminders }),
  }
}

export function isDuplicatePondName(ponds, name, excludeId = null) {
  const normalized = name.trim().toLowerCase()
  return (ponds || []).some(
    (p) => !samePondId(p.id, excludeId) && p.name?.trim().toLowerCase() === normalized,
  )
}
