import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'

/** Portaled to body so the bar stays pinned to the viewport while main content scrolls. */
export default function MobileBottomNav({ items, activeTab, onSelect }) {
  if (typeof document === 'undefined' || !items?.length) return null

  return createPortal(
    <BottomNavInner items={items} activeTab={activeTab} onSelect={onSelect} />,
    document.body,
  )
}

function BottomNavInner({ items, activeTab, onSelect }) {
  const scrollRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    const el = activeRef.current
    const container = scrollRef.current
    if (!el || !container) return
    const elLeft = el.offsetLeft
    const elRight = elLeft + el.offsetWidth
    const containerLeft = container.scrollLeft
    const containerRight = containerLeft + container.offsetWidth
    if (elLeft < containerLeft + 16) {
      container.scrollTo({ left: elLeft - 16, behavior: 'smooth' })
    } else if (elRight > containerRight - 16) {
      container.scrollTo({ left: elRight - container.offsetWidth + 16, behavior: 'smooth' })
    }
  }, [activeTab])

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur border-t border-slate-800 safe-bottom-nav lg:hidden"
      aria-label="Main navigation"
    >
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-hide gap-0.5 px-1 py-1.5"
        >
          {items.map((item) => (
            <button
              key={item.id}
              ref={item.id === activeTab ? activeRef : null}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex flex-col items-center justify-center min-w-[4.25rem] px-2 py-2 rounded-xl transition-all touch-manipulation shrink-0 ${activeTab === item.id ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500'}`}
            >
              <item.icon size={20} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span className="text-[10px] font-bold mt-1 truncate max-w-[4rem]">{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
        {/* Right-edge fade — signals more items exist */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900/95 to-transparent" />
      </div>
    </nav>
  )
}
