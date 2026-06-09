import { Btn } from '../ui'

export default function EmptyState({
  emoji = '🐟',
  title,
  hint = 'Click the + button to add one',
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={`text-center py-16 ${className}`}>
      <div className="text-5xl mb-3">{emoji}</div>
      <p className="text-slate-400 font-medium">{title}</p>
      {hint && <p className="text-slate-500 text-sm mt-1">{hint}</p>}
      {actionLabel && onAction && (
        <Btn className="mt-4 mx-auto" onClick={onAction}>{actionLabel}</Btn>
      )}
    </div>
  )
}
