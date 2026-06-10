import { useEffect, useRef } from 'react'
import { TEAM_SYNC_POLL_INTERVAL_MS } from '../lib/teamSyncDetect'

/**
 * Background cloud pull while the tab is visible so other users' saves appear on this device.
 */
export function useTeamSyncPoll({ enabled, onPoll, intervalMs = TEAM_SYNC_POLL_INTERVAL_MS }) {
  const onPollRef = useRef(onPoll)
  onPollRef.current = onPoll

  useEffect(() => {
    if (!enabled) return undefined

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      onPollRef.current?.()
    }

    const id = setInterval(tick, intervalMs)
    return () => clearInterval(id)
  }, [enabled, intervalMs])
}
