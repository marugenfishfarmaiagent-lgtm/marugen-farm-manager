import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { A4_HEIGHT_PX, A4_WIDTH_PX } from '../lib/invoiceDesign'

/** Scales a fixed A4 invoice document to fit narrow viewports (mobile preview). */
export default function InvoicePreviewFrame({ children, className = '', resetKey = '' }) {
  const outerRef = useRef(null)
  const [scale, setScale] = useState(1)

  const measure = useCallback(() => {
    const outer = outerRef.current
    if (!outer) return
    const width = outer.getBoundingClientRect().width
    if (width <= 0) return
    setScale(Math.min(1, width / A4_WIDTH_PX))
  }, [])

  useLayoutEffect(() => {
    measure()
    const outer = outerRef.current
    if (!outer) return

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(outer)

    const raf = requestAnimationFrame(() => requestAnimationFrame(measure))
    const t1 = setTimeout(measure, 100)
    const t2 = setTimeout(measure, 350)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t1)
      clearTimeout(t2)
      ro?.disconnect()
    }
  }, [measure, resetKey])

  const isScaled = scale < 0.999
  const scaledWidth = A4_WIDTH_PX * scale
  const scaledHeight = A4_HEIGHT_PX * scale

  return (
    <div ref={outerRef} className={`w-full max-w-full min-w-0 ${className}`}>
      <div
        className="mx-auto overflow-hidden"
        style={{
          width: isScaled ? `${scaledWidth}px` : `${A4_WIDTH_PX}px`,
          maxWidth: '100%',
          height: `${scaledHeight}px`,
        }}
      >
        <div
          style={{
            width: `${A4_WIDTH_PX}px`,
            height: `${A4_HEIGHT_PX}px`,
            transform: isScaled ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
