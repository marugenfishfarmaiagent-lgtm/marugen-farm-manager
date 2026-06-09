import { useEffect, useMemo, useState } from 'react'
import { LIST_PAGE_SIZE } from '../data/constants'

export function usePagination(items, pageSize = LIST_PAGE_SIZE, resetKey = '') {
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage(0)
  }, [resetKey])

  const totalItems = items?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1)
  const safePage = Math.min(page, totalPages - 1)

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

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
