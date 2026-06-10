import { useEffect, useRef, useState } from 'react'
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
  const [resolvedSrc, setResolvedSrc] = useState(src)

  useEffect(() => {
    retriedRef.current = false
    setResolvedSrc(src)
  }, [src])

  useEffect(() => {
    if (!src || !isStoragePath(src)) return undefined
    if (!isSupabaseConfigured || !entity || !recordId || !field) return undefined

    let cancelled = false
    db.refreshSignedImage({ entity, id: recordId, field })
      .then((result) => {
        if (cancelled || !result?.url) return
        setResolvedSrc(result.url)
        onRefresh?.({ entity, id: recordId, field, url: result.url })
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [src, entity, recordId, field, onRefresh])

  if (!src) return null

  const handleError = async (e) => {
    e.target.onerror = null

    if (retriedRef.current || isInlineImage(src)) {
      e.target.src = PLACEHOLDER
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
          setResolvedSrc(freshUrl)
          e.target.src = freshUrl
          onRefresh?.({ entity, id: recordId, field, url: freshUrl })
          return
        }
      } else if (onRefresh) {
        onRefresh({ entity, id: recordId, field })
        return
      }
    } catch {
      /* signed URL refresh failed */
    }

    e.target.src = PLACEHOLDER
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
