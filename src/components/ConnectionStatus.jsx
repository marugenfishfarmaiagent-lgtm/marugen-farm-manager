import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, WifiOff, CloudOff } from 'lucide-react'
import { getConnectionState, onConnectionChange } from '../lib/connectionManager'
import { Btn } from './ui'

export default function ConnectionStatus({
  cloudSync,
  cloudError,
  cloudRetrying,
  onRetry,
  isFromCache,
  cacheCachedAt,
  syncFailCount = 0,
}) {
  const [conn, setConn] = useState(getConnectionState)

  useEffect(() => onConnectionChange(setConn), [])

  const browserOffline = !conn.isOnline
  const apiDown = conn.isOnline && !conn.isApiReachable
  const syncPaused = Boolean(cloudError) && !cloudSync
  const syncWarning = Boolean(cloudError) && cloudSync && syncFailCount > 0

  if (!browserOffline && !apiDown && !syncPaused && !syncWarning && !isFromCache) {
    return null
  }

  if (browserOffline) {
    return (
      <div className="bg-amber-900/90 border-b border-amber-700 px-3 py-2.5 sm:px-4 flex items-center gap-2.5 shrink-0">
        <WifiOff size={18} className="text-amber-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-amber-100 text-sm font-bold">Offline — no internet</p>
          <p className="text-amber-200/80 text-xs mt-0.5">
            You can still view cached data. Changes will sync when you reconnect.
          </p>
        </div>
      </div>
    )
  }

  if (isFromCache && !syncPaused) {
    const cachedLabel = cacheCachedAt
      ? new Date(cacheCachedAt).toLocaleTimeString()
      : 'earlier'
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/40 px-3 py-2 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
        <p className="text-amber-200/90 text-xs flex-1">
          Showing cached data from {cachedLabel}. Connecting to cloud…
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={cloudRetrying}
          className="text-amber-300 text-xs underline hover:no-underline disabled:opacity-50 shrink-0"
        >
          {cloudRetrying ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>
    )
  }

  if (apiDown && !syncPaused) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/40 px-3 py-2.5 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <CloudOff size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-amber-100 text-sm font-bold">Cloud temporarily unreachable</p>
            <p className="text-amber-200/80 text-xs mt-0.5">
              Internet is on but Supabase is not responding. Retrying automatically…
            </p>
          </div>
        </div>
        <Btn
          size="sm"
          variant="secondary"
          onClick={onRetry}
          disabled={cloudRetrying}
          className="w-full sm:w-auto justify-center border-amber-500/40 text-amber-100 hover:bg-amber-500/20 shrink-0"
        >
          <RefreshCw size={14} className={cloudRetrying ? 'animate-spin' : ''} />
          {cloudRetrying ? 'Checking…' : 'Retry now'}
        </Btn>
      </div>
    )
  }

  if (syncWarning) {
    return (
      <div className="bg-cyan-900/40 border-b border-cyan-700/50 px-3 py-2 sm:px-4 shrink-0">
        <p className="text-cyan-200 text-xs">
          Cloud save delayed ({syncFailCount}/3) — still trying. {cloudError}
        </p>
      </div>
    )
  }

  if (syncPaused) {
    return (
      <div className="bg-amber-500/15 border-b border-amber-500/50 px-3 py-3 sm:px-4 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-amber-100 text-sm font-bold">Cloud save paused — Local mode</p>
            <p className="text-amber-200/90 text-xs mt-0.5 leading-relaxed">
              New changes are on this device only until sync succeeds. Avoid refresh until saved.
            </p>
            {cloudError && (
              <p className="text-amber-300/70 text-[11px] mt-1 truncate" title={cloudError}>{cloudError}</p>
            )}
          </div>
        </div>
        <Btn
          size="sm"
          variant="secondary"
          onClick={onRetry}
          disabled={cloudRetrying}
          className="w-full sm:w-auto justify-center border-amber-500/40 text-amber-100 hover:bg-amber-500/20 shrink-0"
        >
          <RefreshCw size={14} className={cloudRetrying ? 'animate-spin' : ''} />
          {cloudRetrying ? 'Saving…' : 'Retry save'}
        </Btn>
      </div>
    )
  }

  return null
}
