import { sanitizePermissions } from './teamOps'

export const LOGIN_PIN_MAX = 6

export function sanitizePinInput(value, maxLen = LOGIN_PIN_MAX) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLen)
}

/**
 * @returns {{ ok: true, pin: string } | { ok: false, message: string }}
 */
export function validateLoginPin(pin) {
  const raw = sanitizePinInput(pin)
  if (!raw) return { ok: false, message: 'Enter your PIN to continue.' }
  if (!/^\d{4,6}$/.test(raw)) return { ok: false, message: 'PIN must be 4–6 digits.' }
  return { ok: true, pin: raw }
}

/**
 * @returns {{ ok: true, name: string, pin: string } | { ok: false, message: string }}
 */
export function validateSetupOwnerFields({ name, pin, confirmPin }) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { ok: false, message: 'Owner name is required.' }
  if (trimmed.length > 80) return { ok: false, message: 'Name must be 80 characters or fewer.' }

  const pinCheck = validateLoginPin(pin)
  if (!pinCheck.ok) return pinCheck

  const confirm = sanitizePinInput(confirmPin)
  if (confirm !== pinCheck.pin) return { ok: false, message: 'PINs do not match.' }

  return { ok: true, name: trimmed, pin: pinCheck.pin }
}

/**
 * @returns {{ ok: true, currentPin: string, newPin: string } | { ok: false, message: string }}
 */
export function validateChangePinForm({ currentPin, newPin, confirmPin }) {
  const current = sanitizePinInput(currentPin)
  if (!/^\d{4,6}$/.test(current)) {
    return { ok: false, message: 'Enter your current 4–6 digit PIN.' }
  }

  const nextCheck = validateLoginPin(newPin)
  if (!nextCheck.ok) {
    return { ok: false, message: 'New PIN must be 4–6 digits.' }
  }
  if (nextCheck.pin === current) {
    return { ok: false, message: 'New PIN must be different from your current PIN.' }
  }

  const confirm = sanitizePinInput(confirmPin)
  if (confirm !== nextCheck.pin) return { ok: false, message: 'New PINs do not match.' }

  return { ok: true, currentPin: current, newPin: nextCheck.pin }
}

export function normalizeAuthUser(user) {
  if (!user) return null
  const role = user.role === 'owner' ? 'owner' : 'staff'
  return {
    id: user.id,
    name: String(user.name || '').trim(),
    role,
    active: user.active !== false,
    permissions: sanitizePermissions(user.permissions),
    isSystem: Boolean(user.isSystem ?? user.is_system),
  }
}

/**
 * @returns {{ ok: true, user: object, pin: string } | { ok: false, message: string, user: null }}
 */
export function findLocalUserByPin(users, pin) {
  const pinCheck = validateLoginPin(pin)
  if (!pinCheck.ok) return { ok: false, message: pinCheck.message, user: null }

  const user = (users || []).find((u) => u.active !== false && u.pin === pinCheck.pin)
  if (!user) return { ok: false, message: 'Incorrect PIN or account inactive.', user: null }

  return { ok: true, user, pin: pinCheck.pin }
}
