/** Normalize farm_users ids for assign-team fields. */
export function normalizeAssignedUserIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  )]
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

export function isTeamNotificationForUser(row, { currentUserId, isOwner = false } = {}) {
  if (isOwner) return true
  const targets = row?.target_user_ids ?? row?.targetUserIds
  if (!targets || !Array.isArray(targets) || targets.length === 0) return true
  if (currentUserId == null) return false
  const uid = Number(currentUserId)
  return targets.some((id) => Number(id) === uid)
}
