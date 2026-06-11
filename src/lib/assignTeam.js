/** Normalize farm_users ids for assign-team fields (arrays, JSON/PG string forms). */
export function normalizeAssignedUserIds(value) {
  if (value == null || value === '') return []

  let raw = value
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        raw = JSON.parse(trimmed)
      } catch {
        return []
      }
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const inner = trimmed.slice(1, -1).trim()
      raw = inner ? inner.split(',').map((part) => part.trim()) : []
    } else {
      const n = Number(trimmed)
      return Number.isFinite(n) && n > 0 ? [n] : []
    }
  }

  if (!Array.isArray(raw)) return []
  return [...new Set(
    raw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  )]
}

export function sameAssignedTeam(a, b) {
  const left = normalizeAssignedUserIds(a).sort((x, y) => x - y)
  const right = normalizeAssignedUserIds(b).sort((x, y) => x - y)
  if (left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

/** Staff newly added to an assignment (for update notifications). */
export function newlyAssignedUserIds(previousIds, nextIds) {
  const prev = new Set(normalizeAssignedUserIds(previousIds))
  return normalizeAssignedUserIds(nextIds).filter((id) => !prev.has(id))
}

export function assignableStaffUsers(users = [], { excludeUserId = null } = {}) {
  const exclude = excludeUserId != null ? Number(excludeUserId) : null
  return (users || []).filter((u) => (
    u.active !== false
    && u.role === 'staff'
    && (exclude == null || Number(u.id) !== exclude)
  ))
}

export function formatAssignedStaffNames(users, assignedUserIds) {
  const ids = new Set(normalizeAssignedUserIds(assignedUserIds))
  if (!ids.size) return ''
  return (users || [])
    .filter((u) => ids.has(Number(u.id)))
    .map((u) => u.name)
    .filter(Boolean)
    .join(', ')
}

/** Bell/push targeting list — null means broadcast (legacy rows). */
export function normalizeTargetUserIds(value) {
  if (value == null) return null
  const ids = normalizeAssignedUserIds(value)
  return ids.length ? ids : null
}

/** Bell panel rows visible to the signed-in user (owner sees all). */
export function filterNotificationsForUser(notifications, { currentUserId, isOwner = false } = {}) {
  return (notifications || []).filter((row) => (
    isTeamNotificationForUser(row, { currentUserId, isOwner })
  ))
}

export function isTeamNotificationForUser(row, { currentUserId, isOwner = false } = {}) {
  if (isOwner) return true
  const raw = row?.target_user_ids ?? row?.targetUserIds
  if (raw == null) return true
  const targets = normalizeAssignedUserIds(raw)
  if (!targets.length) return false
  if (currentUserId == null) return false
  return targets.includes(Number(currentUserId))
}
