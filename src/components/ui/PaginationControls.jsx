export default function PaginationControls({
  page,
  setPage,
  hasPrev,
  hasNext,
  totalItems,
  pageSize,
  className = '',
  reserveFabSpace = false,
}) {
  if (totalItems <= pageSize) return null

  return (
    <div className={`flex flex-wrap gap-2 items-center justify-end mt-4 ${reserveFabSpace ? 'pb-20 pr-16' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => setPage((p) => Math.max(0, p - 1))}
        disabled={!hasPrev}
        className="px-3 py-1.5 bg-slate-700 rounded-lg text-sm text-slate-200 disabled:opacity-40 touch-manipulation"
      >
        Previous
      </button>
      <span className="text-slate-400 text-sm">
        Page {page + 1} · {totalItems} total
      </span>
      <button
        type="button"
        onClick={() => setPage((p) => p + 1)}
        disabled={!hasNext}
        className="px-3 py-1.5 bg-slate-700 rounded-lg text-sm text-slate-200 disabled:opacity-40 touch-manipulation"
      >
        Next
      </button>
    </div>
  )
}
