import * as db from './database'
import { normalizeAssignedUserIds } from './assignTeam'

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
