/** Titles that appear in the bell panel (team / owner activity feed). */
const TEAM_NOTIFICATION_TITLES = new Set([
  'Invoice Created',
  'Payment Received',
  'Invoice Cancelled',
  'Koi Sold',
  'Refund Complete',
  'Customer Record Created',
  'Death Recorded',
  'Marked Taken Away',
  'Marked Sick',
  'Product Deleted',
  'Sale Recorded',
  'Restocked',
  'Low Stock Alert',
  'Customer Added',
  'Customer Deleted',
  'Receipt Saved',
  'Receipt Deleted',
  'Delivery Scheduled',
  'Delivery Deleted',
  'Delivery Completed',
  'Delivery Cancelled',
  'Out for Delivery',
  'User Added',
  'User Updated',
  'User Removed',
  'User Activated',
  'User Deactivated',
  'Treatment Started',
  'Permission Denied',
  'Uploaded to Cloud',
  'Check Linked Invoices',
  // AI assistant — business actions only
  'Invoice Created (AI)',
  'Payment Received (AI)',
  'Invoice Cancelled (AI)',
  'Customer Added (AI)',
  'Customer Deleted (AI)',
  'Product Deleted (AI)',
  'Delivery Scheduled (AI)',
  'Delivery Completed (AI)',
  'Delivery Deleted (AI)',
  'Koi Sold (AI)',
  'Restocked (AI)',
])

const AI_TOAST_ONLY_TITLES = new Set([
  'Event Added (AI)',
  'Event Updated (AI)',
  'Event Deleted (AI)',
  'Delivery Updated (AI)',
  'Customer Updated (AI)',
])

export function isTeamNotification(n) {
  if (!n) return false
  if (n.team === true) return true
  if (n.team === false) return false
  if (n.title === 'Permission Denied') return true
  if (AI_TOAST_ONLY_TITLES.has(n.title)) return false
  return TEAM_NOTIFICATION_TITLES.has(n.title)
}

export function buildTeamNotification(n, currentUser) {
  const actor = n.actor || currentUser?.name || 'Unknown'
  const actorRole = n.actorRole || currentUser?.role || 'staff'
  return {
    ...n,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actor,
    actorRole,
    time: 'Just now',
    read: false,
    team: true,
  }
}

export function buildToastNotification(n) {
  return {
    ...n,
    id: n.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    team: false,
  }
}
