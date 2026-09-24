import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

/**
 * A PWA left open (backgrounded, not force-closed) keeps running its old JS
 * forever even after a new deploy — the service worker takes over silently
 * but the already-loaded page doesn't reload itself. This surfaces a small
 * banner so a stale session can update itself instead of quietly running an
 * outdated build (which has caused fixed bugs to look "not fixed" before).
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update().catch(() => {})
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 sm:inset-x-auto sm:right-4 sm:max-w-xs z-[70] bg-slate-800 border border-cyan-500/40 rounded-2xl shadow-2xl shadow-black/40 p-4 flex items-center gap-3">
      <RefreshCw size={18} className="text-cyan-400 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-bold">App အသစ်ရရှိနေပါသည်</p>
        <p className="text-slate-400 text-xs mt-0.5">နောက်ဆုံး update ရအောင် သွင်းပါ</p>
      </div>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 min-h-[40px] px-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-bold touch-manipulation"
      >
        Update
      </button>
    </div>
  )
}
