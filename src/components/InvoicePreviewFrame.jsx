import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { A4_HEIGHT_PX, A4_WIDTH_PX } from '../lib/invoiceDesign'

/** Scales a fixed A4 invoice document to fit narrow viewports (mobile preview). */
export default function InvoicePreviewFrame({ children, className = '', resetKey = '' }) {
  const outerRef = useRef(null)
  const [layout, setLayout] = useState({ scale: 1, containerWidth: A4_WIDTH_PX })

  const measure = useCallback(() => {
    const outer = outerRef.current
    if (!outer) return
    const containerWidth = outer.getBoundingClientRect().width
    if (containerWidth <= 0) return
    const scale = Math.min(1, containerWidth / A4_WIDTH_PX)
    setLayout({ scale, containerWidth })
  }, [])

  useLayoutEffect(() => {
    measure()
    const outer = outerRef.current
    if (!outer) return
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(outer)
    window.addEventListener('resize', measure)
    const t = requestAnimationFrame(measure)
    return () => {
      cancelAnimationFrame(t)
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, resetKey])

  const { scale, containerWidth } = layout
  const scaledWidth = A4_WIDTH_PX * scale
  const offsetX = Math.max(0, (containerWidth - scaledWidth) / 2)

  return (
    <div
      ref={outerRef}
      className={`invoice-preview-viewport relative w-full min-w-0 overflow-hidden ${className}`}
      style={{ height: `${A4_HEIGHT_PX * scale}px` }}
    >
      <div
        className="invoice-preview-scaler absolute top-0"
        style={{
          width: `${A4_WIDTH_PX}px`,
          height: `${A4_HEIGHT_PX}px`,
          left: `${offsetX}px`,
          transform: scale < 0.999 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}
