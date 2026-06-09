import { useEffect, useRef, useState } from 'react'

const A4_WIDTH_PX = (210 / 25.4) * 96
const A4_HEIGHT_PX = A4_WIDTH_PX * (297 / 210)

/** Scales a fixed A4 invoice document to fit narrow viewports (mobile preview). */
export default function InvoicePreviewFrame({ children, className = '' }) {
  const viewportRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const update = () => {
      const available = el.clientWidth
      if (!available) return
      setScale(Math.min(1, available / A4_WIDTH_PX))
    }

    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const isScaled = scale < 0.999

  return (
    <div
      ref={viewportRef}
      className={`invoice-preview-viewport w-full overflow-hidden ${className}`}
      style={isScaled ? { height: `${A4_HEIGHT_PX * scale}px` } : undefined}
    >
      <div
        className="invoice-preview-scaler mx-auto origin-top"
        style={{
          width: `${A4_WIDTH_PX}px`,
          transform: isScaled ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
        }}
      >
        {children}
      </div>
    </div>
  )
}
