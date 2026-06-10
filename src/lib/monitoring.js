import * as Sentry from '@sentry/react'

let monitoringReady = false

/** Real Sentry DSN only — skips placeholders like "your-key@..." or Vercel notes. */
function isValidSentryDsn(dsn) {
  if (!dsn || dsn.includes('your-') || dsn.includes('Vercel env')) return false
  try {
    const url = new URL(dsn)
    return url.protocol === 'https:' && url.username.length > 10 && url.pathname.length > 1
  } catch {
    return false
  }
}

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return
  if (!isValidSentryDsn(dsn)) {
    if (import.meta.env.DEV) {
      console.warn('[monitoring] VITE_SENTRY_DSN is missing or invalid — Sentry disabled')
    }
    return
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (import.meta.env.DEV) return null
      return event
    },
  })
  monitoringReady = true
}

export function isMonitoringEnabled() {
  return monitoringReady
}

export function captureException(error, context) {
  if (!monitoringReady) {
    console.error(error, context)
    return
  }
  Sentry.captureException(error, context ? { extra: context } : undefined)
}

export { Sentry }
