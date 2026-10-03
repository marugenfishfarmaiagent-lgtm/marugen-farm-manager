import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'marugen-theme'
const META_COLORS = { light: '#f8fafc', dark: '#0f172a' }
const listeners = new Set()

function systemTheme() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme])
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || storedTheme() || systemTheme()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* storage blocked (private mode) — theme still applies for this session */
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (storedTheme()) return
    applyTheme(systemTheme())
    listeners.forEach((l) => l())
  })
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark')
  return { theme, setTheme, toggleTheme: () => setTheme(theme === 'light' ? 'dark' : 'light') }
}
