import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { isInlineImage, isStoragePath } from '../lib/farmImage'
import { isSupabaseConfigured } from '../lib/supabase'
import * as db from '../lib/database'

const PLACEHOLDER = '/placeholder-fish.svg'

/** Renders a cloud or local image; resolves storage paths and refreshes expired signed URLs. */
export default function StoredImage({
  src,
  alt = '',
  className = '',
  entity,
  recordId,
  field,
  onRefresh,
  ...rest
}) {
  const retriedRef = useRef(false)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [refreshState, setRefreshState] = useState({ src, url: null })
  const [broken, setBroken] = useState(false)
  const resolvedSrc = refreshState.src === src && refreshState.url ? refreshState.url : src

  useEffect(() => {
    retriedRef.current = false
    setBroken(false)
  }, [src])

  useEffect(() => {
    if (!src || !isStoragePath(src)) return undefined
    if (!isSupabaseConfigured || !entity || !recordId || !field) return undefined

    let cancelled = false
    db.refreshSignedImage({ entity, id: recordId, field })
      .then((result) => {
        if (cancelled || !result?.url) return
        setRefreshState({ src, url: result.url })
        setBroken(false)
        onRefresh?.({ entity, id: recordId, field, url: result.url })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [src, entity, recordId, field, onRefresh, refreshVersion])

  if (!src) return null

  const handleRetry = () => {
    setBroken(false)
    retriedRef.current = false
    setRefreshVersion((v) => v + 1)
  }

  const handleError = async (e) => {
    e.target.onerror = null

    if (retriedRef.current || isInlineImage(src)) {
      e.target.src = PLACEHOLDER
      setBroken(true)
      return
    }

    if (!recordId || !field || !entity) {
      e.target.src = PLACEHOLDER
      return
    }

    retriedRef.current = true

    try {
      if (isSupabaseConfigured) {
        const result = await db.refreshSignedImage({ entity, id: recordId, field })
        const freshUrl = result?.url
        if (freshUrl) {
          setRefreshState({ src, url: freshUrl })
          e.target.src = freshUrl
          onRefresh?.({ entity, id: recordId, field, url: freshUrl })
          return
        }
      } else if (onRefresh) {
        onRefresh({ entity, id: recordId, field })
        return
      }
    } catch {
      /* refresh failed — fall through to broken state */
    }

    e.target.src = PLACEHOLDER
    setBroken(true)
  }

  // When all retries exhaust, show a retry button so the user knows the photo
  // is temporarily unavailable (expired URL) rather than missing.
  if (broken) {
    return (
      <div className={`relative flex items-center justify-center bg-slate-900/50 ${className}`}>
        <button
          type="button"
          onClick={handleRetry}
          className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors p-3 touch-manipulation"
          title="Photo unavailable — tap to retry"
        >
          <RotateCcw size={18} />
          <span className="text-[11px] font-medium">Tap to reload</span>
        </button>
      </div>
    )
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={handleError}
      {...rest}
    />
  )
}
