import { useEffect, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { X, Flashlight, FlashlightOff, Keyboard, ScanBarcode, AlertTriangle } from 'lucide-react'

/**
 * Full-screen camera barcode scanner. Decodes continuously via @zxing/browser and
 * reports each detected code through onDetect — the caller decides what a code means
 * (look up a product, fill a form field, etc.) and calls onClose() when done.
 *
 * Mount this only while scanning is wanted (e.g. `{scanOpen && <BarcodeScannerModal ... />}`)
 * so each session starts from fresh state and releases the camera on unmount.
 *
 * Always offers a manual-entry fallback since camera access can be denied, missing,
 * or simply unreliable on farm-floor lighting/devices.
 */
export default function BarcodeScannerModal({ onClose, onDetect, title = 'Scan Barcode', hint, feedback }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const headingId = useId()
  const manualInputRef = useRef(null)
  const onDetectRef = useRef(onDetect)
  const [status, setStatus] = useState('starting') // starting | scanning | denied | unsupported | error
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualCode, setManualCode] = useState('')

  useEffect(() => {
    onDetectRef.current = onDetect
  })

  useEffect(() => {
    let cancelled = false

    import('@zxing/browser').then(async ({ BrowserMultiFormatReader }) => {
      if (cancelled) return
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported')
        return
      }
      const reader = new BrowserMultiFormatReader()
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (result) onDetectRef.current?.(result.getText())
          },
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setStatus('scanning')
        setTorchSupported(typeof controls.switchTorch === 'function')
      } catch {
        if (!cancelled) setStatus('denied')
      }
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })

    return () => {
      cancelled = true
      controlsRef.current?.stop?.()
      controlsRef.current = null
    }
  }, [])

  useEffect(() => {
    if (manualOpen) manualInputRef.current?.focus()
  }, [manualOpen])

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const toggleTorch = async () => {
    const next = !torchOn
    try {
      await controlsRef.current?.switchTorch?.(next)
      setTorchOn(next)
    } catch {
      /* torch toggle not supported on this device — ignore */
    }
  }

  const submitManual = (e) => {
    e.preventDefault()
    const code = manualCode.trim()
    if (!code) return
    onDetect?.(code, { manual: true })
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col"
    >
      <div className="safe-top flex items-center justify-between px-4 py-3 shrink-0">
        <h2 id={headingId} className="text-white font-bold text-sm flex items-center gap-2">
          <ScanBarcode size={16} className="text-cyan-400" aria-hidden />
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scanner"
          className="w-11 h-11 -mr-1.5 flex items-center justify-center rounded-full text-slate-300 hover:text-white hover:bg-white/10 active:bg-white/15 touch-manipulation"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />

        {status === 'scanning' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[72vw] max-w-xs aspect-square">
              <div className="absolute inset-0 rounded-2xl border-2 border-white/25" />
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
              ].map((cls) => (
                <div key={cls} className={`absolute w-8 h-8 border-cyan-400 ${cls}`} />
              ))}
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-cyan-400/80 motion-safe:animate-pulse" />
            </div>
          </div>
        )}

        {(status === 'starting' || status === 'denied' || status === 'unsupported' || status === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            {status === 'starting' && (
              <p className="text-slate-400 text-sm">Starting camera…</p>
            )}
            {status !== 'starting' && (
              <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-5 max-w-xs text-center space-y-2">
                <AlertTriangle size={24} className="text-amber-400 mx-auto" aria-hidden />
                <p className="text-white text-sm font-semibold">
                  {status === 'denied' ? 'Camera access denied' : status === 'unsupported' ? 'Camera not available on this device' : 'Could not start the camera'}
                </p>
                <p className="text-slate-400 text-xs">
                  {status === 'denied'
                    ? 'Allow camera access in your browser settings, or enter the barcode below.'
                    : 'Enter the barcode number below instead.'}
                </p>
              </div>
            )}
          </div>
        )}

        {hint && status === 'scanning' && !feedback && (
          <p className="absolute bottom-4 inset-x-0 text-center text-slate-300 text-xs px-6">{hint}</p>
        )}

        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`absolute bottom-4 inset-x-4 rounded-xl px-4 py-3 text-sm font-semibold text-center border ${
              feedback.tone === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>

      <div className="safe-bottom shrink-0 px-4 pt-3 pb-4 bg-slate-950 border-t border-slate-800/80 space-y-3">
        {!manualOpen ? (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="min-h-[44px] px-4 flex items-center gap-2 rounded-xl text-slate-300 text-sm font-semibold hover:text-white hover:bg-white/10 touch-manipulation"
            >
              <Keyboard size={16} aria-hidden />
              Enter barcode manually
            </button>
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-pressed={torchOn}
                aria-label={torchOn ? 'Turn off torch' : 'Turn on torch'}
                className={`w-11 h-11 flex items-center justify-center rounded-full touch-manipulation ${torchOn ? 'bg-cyan-500 text-slate-900' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                {torchOn ? <Flashlight size={18} /> : <FlashlightOff size={18} />}
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={submitManual} className="flex items-center gap-2">
            <input
              ref={manualInputRef}
              type="text"
              inputMode="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Type or paste barcode"
              className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-cyan-500 text-slate-900 text-sm font-bold disabled:opacity-40 touch-manipulation"
            >
              Use
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
