/**
 * Professional vector PDF invoice (jsPDF + autoTable).
 * Layout follows common SaaS invoice patterns: brand header, bill-to,
 * line-item table, totals summary box, PayNow payment block.
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoBase64 from '../assets/marugen-logo-base64.js'
import paynowQrUrl from '../assets/paynow-qr.png'
import { PAYNOW_UEN, formatSGD } from '../data/constants'
import { PAGE_MM, THEME, computeInvoiceTotals } from './invoiceDesign'

const imageCache = new Map()

async function loadImageDataUrl(url) {
  if (!imageCache.has(url)) {
    const res = await fetch(url)
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    imageCache.set(url, dataUrl)
  }
  return imageCache.get(url)
}

const loadPayNowQr = () => loadImageDataUrl(paynowQrUrl)

export async function generateInvoicePdf(invoice) {
  const data = computeInvoiceTotals(invoice)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const { w, margin: M } = PAGE_MM
  const R = w - M
  const brand = THEME.maroonRgb
  let y = M

  // Brand accent bar
  doc.setFillColor(...brand)
  doc.rect(0, 0, w, 2.5, 'F')

  // Logo + company (left)
  doc.addImage(logoBase64, 'PNG', M, y, 20, 20)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...brand)
  doc.text(data.company.name.toUpperCase(), M + 24, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 80, 80)
  const companyLines = [
    data.company.address,
    data.company.phone,
    data.company.email,
    data.company.website,
  ]
  companyLines.forEach((line, i) => {
    doc.text(line, M + 24, y + 11 + i * 4)
  })

  // Invoice title block (right) — FreshBooks / Stripe pattern
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(26, 26, 26)
  doc.text('INVOICE', R, y + 8, { align: 'right' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(`Invoice number`, R, y + 16, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 26, 26)
  doc.text(data.invoiceId, R, y + 21, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text('Date of issue', R, y + 28, { align: 'right' })
  doc.setTextColor(26, 26, 26)
  doc.text(data.invoiceDate, R, y + 33, { align: 'right' })

  if (data.dueDate) {
    doc.setTextColor(90, 90, 90)
    doc.text('Payment due', R, y + 40, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...brand)
    doc.text(data.dueDate, R, y + 45, { align: 'right' })
  }

  y += 52

  // Customer details
  const customerLines = [
    `Customer Name - ${data.customerName || '—'}`,
    `Phone - ${data.customerPhone || '—'}`,
    ...(data.customerEmail ? [`Email - ${data.customerEmail}`] : []),
    `Address - ${data.customerAddress || '—'}`,
  ]
  const addressLine = customerLines[customerLines.length - 1]
  const addressWrapped = doc.splitTextToSize(addressLine, w - M * 2 - 8)
  const customerBlockH = 10 + (customerLines.length - 1) * 5 + addressWrapped.length * 5
  doc.setFillColor(248, 247, 246)
  doc.roundedRect(M, y, w - M * 2, customerBlockH, 2, 2, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(26, 26, 26)
  let customerY = y + 6
  customerLines.slice(0, -1).forEach((line) => {
    doc.text(line, M + 4, customerY)
    customerY += 5
  })
  doc.text(addressWrapped, M + 4, customerY)

  y += customerBlockH + 8

  // Line items table
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['#', 'Description', 'Qty', 'Unit price', 'Amount']],
    body: data.items.length
      ? data.items.map((row) => [
          String(row.index),
          row.name,
          String(row.qty),
          data.fmt(row.price),
          data.fmt(row.lineTotal),
        ])
      : [['—', 'No line items', '—', '—', '—']],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
      textColor: [26, 26, 26],
      lineColor: [229, 229, 229],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: brand,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [252, 251, 250] },
  })

  y = doc.lastAutoTable.finalY + 10

  // Totals summary (right column box)
  const boxW = 72
  const boxX = R - boxW
  const rowH = 7
  const rows = [
    ['Subtotal', data.subtotalFmt],
    ...(data.discountAmount > 0 ? [[data.discountLabel, `-${data.discountFmt}`]] : []),
    ...(data.shipping > 0 ? [['Shipping', data.shippingFmt]] : []),
    ...(data.tax > 0 ? [['Tax (GST)', data.taxFmt]] : []),
  ]

  rows.forEach(([label, val], i) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)
    doc.text(label, boxX, y + i * rowH)
    doc.setTextColor(26, 26, 26)
    doc.text(val, R, y + i * rowH, { align: 'right' })
  })

  const dueY = y + rows.length * rowH + 4
  doc.setFillColor(...brand)
  doc.roundedRect(boxX - 2, dueY - 5, boxW + 2, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('Amount due', boxX, dueY + 2)
  doc.text(formatSGD(data.total), R - 2, dueY + 2, { align: 'right' })

  y = dueY + 18

  // Notes
  if (data.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(90, 90, 90)
    doc.text('Notes', M, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    const noteLines = doc.splitTextToSize(data.notes, w - M * 2 - 50)
    doc.text(noteLines, M, y + 5)
    y += 5 + noteLines.length * 4 + 6
  }

  // Payment block
  const payY = Math.max(y, 230)
  doc.setDrawColor(...brand)
  doc.setLineWidth(0.4)
  doc.line(M, payY, R, payY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...brand)
  doc.text('Payment instructions', M, payY + 8)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(60, 60, 60)
  doc.text('Pay via PayNow using the QR code or enter the UEN in your banking app.', M, payY + 14)
  doc.text(`UEN: ${PAYNOW_UEN}`, M, payY + 20)
  doc.text(`Amount: ${formatSGD(data.total)}`, M, payY + 26)
  doc.text(`Reference: ${data.invoiceId}`, M, payY + 32)

  const paynowQr = await loadPayNowQr()
  doc.addImage(paynowQr, 'PNG', R - 38, payY + 4, 34, 34)
  doc.setFontSize(7)
  doc.setTextColor(120, 120, 120)
  doc.text('Scan to pay', R - 21, payY + 41, { align: 'center' })

  // Footer
  const footY = 285
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(130, 130, 130)
  doc.text(
    `Thank you for your business — ${data.company.phone} | ${data.company.email}`,
    w / 2,
    footY,
    { align: 'center' },
  )

  return doc
}

function invoicePdfFilename(invoice) {
  return `${(invoice?.id || 'invoice').replace(/[^\w.-]/g, '_')}.pdf`
}

export async function getInvoicePdfFile(invoice) {
  const doc = await generateInvoicePdf(invoice)
  const blob = doc.output('blob')
  return new File([blob], invoicePdfFilename(invoice), { type: 'application/pdf' })
}

export async function downloadInvoicePdf(invoice) {
  const doc = await generateInvoicePdf(invoice)
  const filename = invoicePdfFilename(invoice)
  doc.save(filename)
  return filename
}

export async function invoicePdfBlobUrl(invoice) {
  const doc = await generateInvoicePdf(invoice)
  return URL.createObjectURL(doc.output('blob'))
}
