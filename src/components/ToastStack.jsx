import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react'

function ToastIcon({ type }) {
  const cls = 'shrink-0'
  if (type === 'warning') return <AlertTriangle size={16} className={`${cls} text-amber-400`} />
  if (type === 'success') return <CheckCircle size={16} className={`${cls} text-emerald-400`} />
  if (type === 'error') return <XCircle size={16} className={`${cls} text-red-400`} />
  return <Info size={16} className={`${cls} text-cyan-400`} />
}

export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null

  const regular = toasts.filter((t) => !t.prominent)
  const prominent = toasts.filter((t) => t.prominent)

  const renderToast = (t, className = '') => (
    <div
      key={t.id}
      className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border backdrop-blur shadow-xl ${className}`}
      role="alert"
    >
      <ToastIcon type={t.type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-semibold leading-tight">{t.title}</p>
        {t.message && <p className="text-xs text-slate-300 mt-0.5 leading-snug">{t.message}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        className="text-slate-500 hover:text-white p-0.5 shrink-0 touch-manipulation"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )

  return (
    <>
      {prominent.length > 0 && (
        <div className="fixed top-[calc(3.25rem+env(safe-area-inset-top))] left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-[70] flex flex-col gap-2 pointer-events-none">
          {prominent.map((t) => renderToast(
            t,
            t.type === 'error'
              ? 'border-red-500/70 bg-red-950/95 ring-2 ring-red-500/30'
              : t.type === 'warning'
                ? 'border-amber-500/70 bg-amber-950/95 ring-2 ring-amber-500/30'
                : 'border-cyan-500/50 bg-slate-900/95',
          ))}
        </div>
      )}
      {regular.length > 0 && (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-6 right-3 sm:right-6 z-[60] flex flex-col gap-2 max-w-[min(100vw-1.5rem,360px)] pointer-events-none">
      {regular.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border border-slate-600/60 bg-slate-800/95 backdrop-blur shadow-xl"
          role="status"
        >
          <ToastIcon type={t.type} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-semibold leading-tight">{t.title}</p>
            {t.message && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{t.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-slate-500 hover:text-white p-0.5 shrink-0 touch-manipulation"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
      )}
    </>
  )
}
