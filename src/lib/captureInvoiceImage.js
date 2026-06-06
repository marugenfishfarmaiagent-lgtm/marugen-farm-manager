import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import html2canvas from 'html2canvas'
import InvoiceDocument from '../components/InvoiceDocument'

function waitForImages(el) {
  const imgs = [...el.querySelectorAll('img')]
  return Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              img.onload = resolve
              img.onerror = resolve
              setTimeout(resolve, 2500)
            }),
    ),
  )
}

export async function captureInvoiceImage(invoice) {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;opacity:0;pointer-events:none'
  document.body.appendChild(host)

  const root = createRoot(host)
  root.render(createElement(InvoiceDocument, { invoice }))

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })

  const el = host.querySelector('.invoice-document')
  if (!el) {
    root.unmount()
    host.remove()
    throw new Error('Could not render invoice for capture.')
  }

  await waitForImages(el)

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: el.offsetWidth,
    height: el.scrollHeight,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  })

  root.unmount()
  host.remove()
  return canvas
}

export async function invoiceImageBlob(invoice) {
  const canvas = await captureInvoiceImage(invoice)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not export invoice image.'))),
      'image/png',
      0.92,
    )
  })
}

export async function invoiceImageFile(invoice) {
  const blob = await invoiceImageBlob(invoice)
  const filename = `${(invoice?.id || 'invoice').replace(/[^\w.-]/g, '_')}.png`
  return new File([blob], filename, { type: 'image/png' })
}
