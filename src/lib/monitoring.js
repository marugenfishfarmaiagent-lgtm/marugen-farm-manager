import * as Sentry from '@sentry/react'

let monitoringReady = false

export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return

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
