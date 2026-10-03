import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Dark mode' : 'Light mode'}
      className={`p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors touch-manipulation ${className}`}
    >
      {isLight ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
