// Self-contained pond-data merge logic — no heavy imports so it can be tested
// in Node's test runner without bundler transforms.

function ts(record) {
  if (!record?.updatedAt) return 0
  const t = new Date(record.updatedAt).getTime()
  return Number.isFinite(t) ? t : 0
}

function reminderIsDone(row) {
  if (!row) return false
  return String(row.status || 'pending').toLowerCase() === 'done'
}

function normalizeAssignedUserIds(ids) {
  if (!Array.isArray(ids)) return []
  return ids.map(String).filter(Boolean)
}

function normalizeReminderRecord(reminder) {
  if (!reminder) return reminder
  const assignedUserIds = normalizeAssignedUserIds(reminder.assignedUserIds)
  const statusStr = String(reminder.status || 'pending').toLowerCase()
  const status = statusStr === 'done' ? 'done' : 'pending'
  if (status === 'pending') {
    const next = { ...reminder, status: 'pending', assignedUserIds }
    delete next.completedAt
    return next
  }
  return {
    ...reminder,
    status: 'done',
    assignedUserIds,
    completedAt: reminder.completedAt || new Date().toISOString().slice(0, 10),
  }
}

const POND_RECORD_MERGE_GRACE_MS = 15000

export function mergePondRecords(local = [], remote = [], { preferDone = false } = {}) {
  const map = new Map()
  const pick = (a, b) => {
    if (!a) return b
    if (!b) return a
    if (preferDone) {
      const aDone = reminderIsDone(a)
      const bDone = reminderIsDone(b)
      if (aDone !== bDone) {
        const doneRecord = aDone ? a : b
        const pendingRecord = aDone ? b : a
        // "done" is terminal — it always wins on status.
        // But if the pending record is newer (e.g. a note or assignee was edited
        // after the reminder was marked done), preserve those field edits while
        // forcing the done status. Keep the pending record's updatedAt so this
        // merged result is newer than the pending version and propagates forward.
        if (ts(pendingRecord) > ts(doneRecord)) {
          return {
            ...pendingRecord,
            status: 'done',
            completedAt: doneRecord.completedAt || pendingRecord.completedAt,
          }
        }
        return doneRecord
      }
    }
    const lt = ts(a)
    const rt = ts(b)
    if (lt >= rt) return a
    if (rt - lt < POND_RECORD_MERGE_GRACE_MS) return a
    return b
  }

  for (const row of remote || []) {
    if (row?.id == null) continue
    map.set(String(row.id), row)
  }
  for (const row of local || []) {
    if (row?.id == null) continue
    const id = String(row.id)
    const existing = map.get(id)
    map.set(id, existing ? pick(row, existing) : row)
  }
  const merged = [...map.values()]
  return preferDone ? merged.map(normalizeReminderRecord) : merged
}

/** Merge pond blob field-by-field so reminder "done" and log edits are not wiped by cloud pull. */
export function mergePondData(local, remote) {
  if (!remote || typeof remote !== 'object') return local
  if (!local || typeof local !== 'object') return remote
  const localNewer = ts(local) >= ts(remote)
  const mergedReminders = mergePondRecords(local.reminders, remote.reminders, { preferDone: true })
  const localDoneWins = (local.reminders || []).some((row) => {
    const remoteRow = (remote.reminders || []).find((r) => String(r.id) === String(row.id))
    return reminderIsDone(row) && !reminderIsDone(remoteRow)
  })
  return {
    ...(localNewer ? local : remote),
    ponds: mergePondRecords(local.ponds, remote.ponds),
    maintenanceLogs: mergePondRecords(local.maintenanceLogs, remote.maintenanceLogs),
    treatmentLogs: mergePondRecords(local.treatmentLogs, remote.treatmentLogs),
    reminders: mergedReminders,
    // Last-writer-wins for treatmentGuides so intentional deletions are not
    // resurrected by the additive union that mergePondRecords performs.
    // Fall back to the other side only if the winner has null (never saved).
    treatmentGuides: localNewer
      ? (local.treatmentGuides ?? remote.treatmentGuides)
      : (remote.treatmentGuides ?? local.treatmentGuides),
    updatedAt: localDoneWins || localNewer ? local.updatedAt : remote.updatedAt,
  }
}
