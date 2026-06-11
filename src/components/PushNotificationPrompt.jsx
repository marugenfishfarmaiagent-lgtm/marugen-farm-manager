import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, X } from 'lucide-react'
import { Btn } from './ui'
import {
  dismissPushPrompt,
  disablePhoneNotifications,
  enablePhoneNotifications,
  getPushPermission,
  isPushPromptDismissed,
  isPushSupported,
  sendPushTest,
} from '../lib/webPush'

export default function PushNotificationPrompt({ addNotification }) {
  const [visible, setVisible] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setVisible(false)
      return
    }
    const permission = getPushPermission()
    setEnabled(permission === 'granted')
    setVisible(permission !== 'granted' && !isPushPromptDismissed())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleEnable = async () => {
    setBusy(true)
    try {
      const result = await enablePhoneNotifications()
      if (!result.ok) {
        addNotification?.({ type: 'error', title: 'Notifications', message: result.message })
        return
      }
      setEnabled(true)
      setVisible(false)
      addNotification?.({
        type: 'success',
        title: 'Notifications enabled',
        message: 'You will get alerts on this phone like other apps.',
      })
      try {
        await sendPushTest()
      } catch {
        // test is optional
      }
    } catch (err) {
      addNotification?.({
        type: 'error',
        title: 'Notifications',
        message: err?.message || 'Could not enable notifications.',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    setBusy(true)
    try {
      await disablePhoneNotifications()
      setEnabled(false)
      addNotification?.({ type: 'info', title: 'Notifications off', message: 'Phone alerts disabled for this device.' })
    } finally {
      setBusy(false)
    }
  }

  const handleDismiss = () => {
    dismissPushPrompt()
    setVisible(false)
  }

  if (!isPushSupported()) return null

  if (enabled) {
    return (
      <div className="bg-slate-800/80 border-b border-slate-700 px-3 py-2 sm:px-4 flex items-center gap-2 shrink-0">
        <Bell size={16} className="text-cyan-400 shrink-0" />
        <p className="text-slate-300 text-xs flex-1">Phone notifications on</p>
        <button
          type="button"
          onClick={handleDisable}
          disabled={busy}
          className="text-slate-400 hover:text-white text-xs flex items-center gap-1 touch-manipulation disabled:opacity-50"
        >
          <BellOff size={12} /> Off
        </button>
      </div>
    )
  }

  if (!visible) return null

  return (
    <div className="bg-cyan-500/10 border-b border-cyan-500/30 px-3 py-2.5 sm:px-4 flex items-start gap-2.5 shrink-0">
      <Bell size={18} className="text-cyan-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-cyan-100 text-sm font-bold">Enable phone notifications?</p>
        <p className="text-cyan-200/80 text-xs mt-0.5">
          Get team updates and reminders on your lock screen with sound (Add to Home Screen recommended).
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Btn size="sm" onClick={handleEnable} disabled={busy}>
            {busy ? 'Enabling…' : 'Enable'}
          </Btn>
          <Btn size="sm" variant="secondary" onClick={handleDismiss} disabled={busy}>
            Not now
          </Btn>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-slate-500 hover:text-white p-1 shrink-0 touch-manipulation"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
