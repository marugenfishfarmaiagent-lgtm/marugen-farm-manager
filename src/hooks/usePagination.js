import { useCallback, useMemo, useState } from 'react'
import { LIST_PAGE_SIZE } from '../data/constants'

export function usePagination(items, pageSize = LIST_PAGE_SIZE, resetKey = '') {
  const [pageState, setPageState] = useState({ key: resetKey, page: 0 })

  const page = pageState.key === resetKey ? pageState.page : 0

  const setPage = useCallback((updater) => {
    setPageState((prev) => {
      const current = prev.key === resetKey ? prev.page : 0
      const nextPage = typeof updater === 'function' ? updater(current) : updater
      return { key: resetKey, page: nextPage }
    })
  }, [resetKey])

  const totalItems = items?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1)
  const safePage = Math.min(page, totalPages - 1)

  const paginatedItems = useMemo(
    () => (items || []).slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize],
  )

  return {
    page: safePage,
    setPage,
    paginatedItems,
    pageSize,
    totalItems,
    hasNext: (safePage + 1) * pageSize < totalItems,
    hasPrev: safePage > 0,
    totalPages,
  }
}
