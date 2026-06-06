import { useId } from 'react'
import { X } from 'lucide-react'
import { FARM_POND_GROUPS, FARM_POND_NAMES } from '../data/constants'

const fieldClass = 'w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all'

export function Badge({ children, className = '' }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>{children}</span>
}

export function Card({ children, className = '' }) {
  return <div className={`bg-slate-800/60 border border-slate-700/50 rounded-xl ${className}`}>{children}</div>
}

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[900px]' }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full ${sizes[size]} max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl safe-top`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700 shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-white pr-2">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-2 -mr-1 rounded-lg hover:bg-slate-700 transition-colors touch-manipulation"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

export function PondNameInput({ label = 'Pond name', value, onChange, className = '', required, placeholder = 'Select or type pond name' }) {
  const listId = useId()
  const quickVal = FARM_POND_NAMES.includes(value) ? value : ''

  return (
    <div className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={quickVal}
          onChange={(e) => { if (e.target.value) onChange({ target: { value: e.target.value } }) }}
          className={`sm:max-w-[9.5rem] shrink-0 ${fieldClass}`}
          aria-label={`${label} quick pick`}
        >
          <option value="">Quick pick…</option>
          {FARM_POND_GROUPS.map(({ label: group, count }) => (
            <optgroup key={group} label={`Pond ${group}`}>
              {Array.from({ length: count }, (_, i) => {
                const name = `${group}${i + 1}`
                return <option key={name} value={name}>{name}</option>
              })}
            </optgroup>
          ))}
        </select>
        <input
          type="text"
          value={value}
          onChange={onChange}
          list={listId}
          placeholder={placeholder}
          required={required}
          className={`flex-1 min-w-0 ${fieldClass}`}
        />
        <datalist id={listId}>
          {FARM_POND_NAMES.map((n) => <option key={n} value={n} />)}
        </datalist>
      </div>
    </div>
  )
}

export function Input({ label, value, onChange, type = 'text', placeholder, className = '', required, min, max, step, readOnly, inputMode }) {
  const isDateTimeField = type === 'date' || type === 'time' || type === 'datetime-local'
  return (
    <div className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>}
      {isDateTimeField ? (
        <div className="w-full max-w-full min-w-0 overflow-hidden">
          <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} max={max} step={step} readOnly={readOnly} inputMode={inputMode} className={`datetime-field ${fieldClass} ${readOnly ? 'opacity-80 cursor-default' : ''}`} />
        </div>
      ) : (
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} min={min} max={max} step={step} readOnly={readOnly} inputMode={inputMode} className={`${fieldClass} ${readOnly ? 'opacity-80 cursor-default' : ''}`} />
      )}
    </div>
  )
}

export function Select({ label, value, onChange, options, className = '', required }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>}
      <select value={value} onChange={onChange} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all">
        {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </div>
  )
}

export function Textarea({ label, value, onChange, placeholder, rows = 3, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</label>}
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all resize-none" />
    </div>
  )
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', className = '', disabled, type = 'button', title }) {
  const variants = {
    primary: 'bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold shadow-lg shadow-cyan-500/20',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30',
    success: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30',
    ghost: 'text-slate-400 hover:text-white hover:bg-slate-700',
  }
  const sizes = { sm: 'px-3 py-2 text-xs min-h-[40px]', md: 'px-4 py-2.5 text-sm min-h-[44px]', lg: 'px-6 py-3 text-base min-h-[48px]' }
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`rounded-lg transition-all flex items-center gap-1.5 touch-manipulation ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      {children}
    </button>
  )
}
