import * as db from './database'
import { newlyAssignedUserIds, normalizeAssignedUserIds } from './assignTeam'

/**
 * Notify assigned staff via cloud push + team feed (targeted, not broadcast).
 */
export function notifyAssignedStaff({
  assignedUserIds,
  title,
  message,
  url,
  type = 'info',
  actor,
  actorRole = 'owner',
  tag,
}) {
  const ids = normalizeAssignedUserIds(assignedUserIds)
  if (!ids.length || !title) return Promise.resolve()
  return db.notifyTeamPush({
    title,
    message,
    url,
    type,
    actor,
    actorRole,
    tag: tag || `assign-${String(title).replace(/\s+/g, '-').toLowerCase()}`,
    targetUserIds: ids,
  }).catch(() => {})
}

/**
 * On create: notify all assignees. On update: notify only newly added staff.
 */
export function notifyAssignmentChange({
  previousAssignedUserIds = [],
  nextAssignedUserIds = [],
  isNew = false,
  title,
  message,
  url,
  type = 'info',
  actor,
  actorRole = 'owner',
  tag,
}) {
  const ids = isNew
    ? normalizeAssignedUserIds(nextAssignedUserIds)
    : newlyAssignedUserIds(previousAssignedUserIds, nextAssignedUserIds)
  if (!ids.length) return Promise.resolve()
  return notifyAssignedStaff({
    assignedUserIds: ids,
    title,
    message,
    url,
    type,
    actor,
    actorRole,
    tag,
  })
}
