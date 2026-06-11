import { assignableStaffUsers, normalizeAssignedUserIds } from '../lib/assignTeam'
import { userInitial } from '../lib/teamOps'

export function AssigneeBadges({ users, assignedUserIds, className = '' }) {
  const ids = normalizeAssignedUserIds(assignedUserIds)
  if (!ids.length) return null
  const names = ids
    .map((id) => (users || []).find((u) => Number(u.id) === Number(id))?.name)
    .filter(Boolean)
  if (!names.length) return null
  return (
    <p className={`text-[10px] text-cyan-400/90 font-medium ${className}`}>
      Assigned: {names.join(', ')}
    </p>
  )
}

export default function StaffAssignPicker({
  users = [],
  value = [],
  onChange,
  label = 'Assign team',
  hint = 'Selected staff receive a notification.',
  excludeUserId = null,
  className = '',
}) {
  const staff = assignableStaffUsers(users, { excludeUserId })
  const selected = new Set(normalizeAssignedUserIds(value))

  const toggle = (userId) => {
    const id = Number(userId)
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange?.([...next])
  }

  if (!staff.length) {
    return (
      <div className={className}>
        <p className="text-xs font-semibold text-slate-400 mb-1">{label}</p>
        <p className="text-xs text-slate-500">No active staff accounts to assign.</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <p className="text-xs font-semibold text-slate-400 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">
        {staff.map((u) => {
          const active = selected.has(Number(u.id))
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors touch-manipulation ${
                active
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                  : 'bg-slate-800/80 border-slate-600 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                active ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300'
              }`}
              >
                {userInitial(u.name)}
              </span>
              {u.name}
            </button>
          )
        })}
      </div>
      {hint ? <p className="text-[10px] text-slate-500 mt-1.5">{hint}</p> : null}
    </div>
  )
}
