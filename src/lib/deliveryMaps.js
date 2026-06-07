export function formatDeliveryLocation(delivery) {
  if (!delivery) return ''
  const parts = [
    delivery.address?.trim(),
    delivery.postalCode ? `Singapore ${delivery.postalCode}` : '',
  ].filter(Boolean)
  return parts.join(', ')
}

export function getGoogleMapsUrl(query) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
}

export function getAppleMapsUrl(query) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(query)}`
}

export function openDeliveryMap(delivery, provider = 'google') {
  const query = formatDeliveryLocation(delivery)
  if (!query) return false
  const url = provider === 'apple' ? getAppleMapsUrl(query) : getGoogleMapsUrl(query)
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
