import { Plus } from 'lucide-react'

/** Fixed bottom-right action button — stays visible while scrolling (above mobile tab bar). */
export default function Fab({
  onClick,
  label,
  icon: Icon = Plus,
  disabled = false,
  className = '',
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`fixed z-40 right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 lg:right-6 flex items-center justify-center w-14 h-14 rounded-full bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-900 shadow-xl shadow-cyan-500/30 border border-cyan-400/40 touch-manipulation transition-all disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      <Icon size={24} strokeWidth={2.5} />
    </button>
  )
}
