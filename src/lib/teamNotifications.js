import { isTeamNotificationForUser, normalizeTargetUserIds } from './assignTeam'

const STORAGE_KEY = 'marugen_last_team_notif_id'

export function getLastTeamNotifId() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(v) ? v : 0
  } catch {
    return 0
  }
}

export function setLastTeamNotifId(id) {
  try {
    const next = Math.max(getLastTeamNotifId(), Number(id) || 0)
    localStorage.setItem(STORAGE_KEY, String(next))
  } catch {
    // ignore
  }
}

function formatTeamNotifTime(iso) {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'Just now'
  const mins = Math.floor((Date.now() - t) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function mapCloudTeamNotification(row) {
  return {
    id: `team-cloud-${row.id}`,
    cloudId: Number(row.id),
    title: row.title,
    message: row.message || '',
    actor: row.actor || 'Unknown',
    actorRole: row.actor_role || row.actorRole || 'staff',
    type: row.notification_type || row.type || 'info',
    time: formatTeamNotifTime(row.created_at),
    read: false,
    team: true,
    targetUserIds: normalizeTargetUserIds(row.target_user_ids ?? row.targetUserIds),
  }
}

function isDuplicateTeamAlert(prev, row) {
  return prev.some((n) => (
    n.team
    && n.title === row.title
    && n.message === row.message
    && n.actor === row.actor
  ))
}

/**
 * Merge new rows from cloud fetch into the local bell panel (deduped, skips actor's own rows).
 */
export function mergeIncomingTeamNotifications(prev, remoteRows, { currentUserId, isOwner = false } = {}) {
  const lastId = getLastTeamNotifId()
  const existingCloudIds = new Set(
    prev.filter((n) => n.cloudId != null).map((n) => Number(n.cloudId)),
  )

  const incoming = (remoteRows || [])
    .filter((row) => {
      const id = Number(row.id)
      if (!Number.isFinite(id) || id <= lastId) return false
      if (existingCloudIds.has(id)) return false
      if (currentUserId != null && Number(row.actor_user_id) === Number(currentUserId)) return false
      if (!isTeamNotificationForUser(row, { currentUserId, isOwner })) return false
      return true
    })
    .map(mapCloudTeamNotification)
    .sort((a, b) => b.cloudId - a.cloudId)

  if (!incoming.length) return { list: prev, added: 0 }

  const deduped = incoming.filter((row) => !isDuplicateTeamAlert(prev, row))
  const maxId = Math.max(lastId, ...incoming.map((n) => n.cloudId))
  setLastTeamNotifId(maxId)

  if (!deduped.length) return { list: prev, added: 0 }

  return {
    list: [...deduped, ...prev].slice(0, 30),
    added: deduped.length,
    latest: deduped[0],
  }
}
