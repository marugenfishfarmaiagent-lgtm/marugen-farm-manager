/* Web Push handlers — loaded by the PWA service worker via workbox importScripts. */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() || '' }
  }

  const title = payload.title || 'Marugen Farm'
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo.png',
    badge: '/logo.png',
    tag: payload.tag || 'marugen-farm',
    renotify: true,
    silent: false,
    data: {
      url: payload.url || '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  const fullUrl = new URL(targetUrl, self.location.origin).href
  const tab = new URL(fullUrl).searchParams.get('tab')

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'push-navigate', tab, url: fullUrl })
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl)
      }
      return undefined
    }),
  )
})
