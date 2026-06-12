import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from '../data/constants'

const PERMISSION_IDS = new Set(ALL_PERMISSIONS.map((p) => p.id))
const NAME_MAX = 80

export function sameUserId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function sanitizePermissions(permissions) {
  return [...new Set((permissions || []).filter((p) => PERMISSION_IDS.has(p)))]
}

export function normalizeUserRecord(user) {
  if (!user) return user
  const role = user.role === 'owner' ? 'owner' : 'staff'
  return {
    ...user,
    name: String(user.name || '').trim().slice(0, NAME_MAX),
    role,
    active: user.active !== false,
    permissions: sanitizePermissions(user.permissions),
    isSystem: Boolean(user.isSystem ?? user.is_system),
  }
}

export function countActiveOwners(users = []) {
  return users.filter((u) => u.role === 'owner' && u.active !== false).length
}

export function isLastActiveOwner(users, userId) {
  const user = users.find((u) => sameUserId(u.id, userId))
  if (!user || user.role !== 'owner' || user.active === false) return false
  return countActiveOwners(users) <= 1
}

/**
 * @returns {{ ok: true, pin: string } | { ok: false, message: string }}
 */
export function validateUserPin(pin, { required = false } = {}) {
  const raw = String(pin ?? '').trim()
  if (!raw) {
    if (required) return { ok: false, message: 'A 4–6 digit PIN is required.' }
    return { ok: true, pin: '' }
  }
  if (!/^\d{4,6}$/.test(raw)) {
    return { ok: false, message: 'PIN must be 4–6 digits.' }
  }
  return { ok: true, pin: raw }
}

/**
 * @returns {{ ok: true, name: string, role: string, permissions: string[], active: boolean, pin: string } | { ok: false, message: string }}
 */
export function validateUserFields(fields, { isNew, users = [], editUser = null, currentUserId = null } = {}) {
  const name = fields.name?.trim()
  if (!name) return { ok: false, message: 'Name is required.' }
  if (name.length > NAME_MAX) {
    return { ok: false, message: `Name must be ${NAME_MAX} characters or fewer.` }
  }

  const role = fields.role === 'owner' ? 'owner' : 'staff'
  const permissions = sanitizePermissions(fields.permissions)
  if (!permissions.length) {
    return { ok: false, message: 'Select at least one permission.' }
  }

  const pinChanging = Boolean(String(fields.pin ?? '').trim())
  const pinCheck = validateUserPin(fields.pin, { required: isNew })
  if (!pinCheck.ok) return pinCheck

  const active = fields.active !== false

  if (editUser) {
    if (editUser.isSystem && role !== 'owner') {
      return { ok: false, message: 'The system owner account must remain an owner.' }
    }
    if (isLastActiveOwner(users, editUser.id)) {
      if (role !== 'owner') {
        return { ok: false, message: 'At least one active owner must remain.' }
      }
      if (!permissions.includes('users')) {
        return { ok: false, message: 'Last owner must keep Team permission.' }
      }
      if (!active) {
        return { ok: false, message: 'Cannot deactivate the only active owner.' }
      }
    }
    if (sameUserId(editUser.id, currentUserId) && !active) {
      return { ok: false, message: 'You cannot deactivate your own account.' }
    }
  }

  return {
    ok: true,
    name,
    role,
    permissions,
    active,
    pin: pinCheck.pin,
    pinChanging,
  }
}

export function getUserDeleteBlockReason(user, { users = [], currentUserId = null } = {}) {
  if (!user) return 'User not found.'
  if (sameUserId(user.id, currentUserId)) return 'You cannot delete your own account.'
  if (user.isSystem) return 'The system owner account cannot be removed.'
  if (user.role === 'owner' && user.active !== false && countActiveOwners(users) <= 1) {
    return 'At least one active owner is required.'
  }
  return null
}

export function getUserDeactivateBlockReason(user, { users = [], currentUserId = null } = {}) {
  if (!user) return 'User not found.'
  if (sameUserId(user.id, currentUserId)) return 'You cannot deactivate your own account.'
  if (user.role === 'owner' && user.active !== false && countActiveOwners(users) <= 1) {
    return 'At least one active owner is required.'
  }
  return null
}

export function defaultPermissionsForRole(role) {
  return [...(DEFAULT_PERMISSIONS[role === 'owner' ? 'owner' : 'staff'] || DEFAULT_PERMISSIONS.staff)]
}

export function permissionsEqual(a, b) {
  const left = sanitizePermissions(a).sort()
  const right = sanitizePermissions(b).sort()
  return left.length === right.length && left.every((perm, index) => perm === right[index])
}

/** True when name, role, active, or permissions differ after normalization. */
export function userProfileChanged(current, remote) {
  const left = normalizeUserRecord(current)
  const right = normalizeUserRecord(remote)
  if (!left || !right) return false
  return left.name !== right.name
    || left.role !== right.role
    || left.active !== right.active
    || !permissionsEqual(left.permissions, right.permissions)
}

export function userInitial(name) {
  const ch = String(name || '').trim()[0]
  return ch ? ch.toUpperCase() : '?'
}
