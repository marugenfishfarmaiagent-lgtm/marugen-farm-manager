import { useEffect, useRef } from 'react'
import { isInlineImage } from '../lib/farmImage'
import { isSupabaseConfigured } from '../lib/supabase'
import * as db from '../lib/database'

const PLACEHOLDER = '/placeholder-fish.svg'

/** Renders a cloud or local image; refreshes signed URLs on load failure. */
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

  useEffect(() => {
    retriedRef.current = false
  }, [src])

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
      src={src}
      alt={alt}
      className={className}
      onError={handleError}
      {...rest}
    />
  )
}
