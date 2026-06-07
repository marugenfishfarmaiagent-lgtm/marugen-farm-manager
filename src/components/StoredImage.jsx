import { isInlineImage } from '../lib/farmImage'

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
  if (!src) return null

  const handleError = () => {
    if (!recordId || !field || !entity || !onRefresh || isInlineImage(src)) return
    onRefresh({ entity, id: recordId, field })
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
