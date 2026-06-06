import { INVOICE_COMPANY, formatInvoiceDate, formatInvoiceMoney } from '../data/constants'

/** Marugen brand + professional invoice layout tokens */
export const THEME = {
  maroon: '#601416',
  maroonRgb: [96, 20, 22],
  ink: '#1a1a1a',
  muted: '#5c5c5c',
  line: '#e5e5e5',
  surface: '#f8f7f6',
  white: '#ffffff',
}

export const PAGE_MM = { w: 210, h: 297, margin: 16 }

function roundMoney(n) {
  return Math.round(n * 100) / 100
}

/** Subtotal, discount, shipping, tax → final total */
export function calcInvoiceAmounts(invoice) {
  const allItems = invoice?.items || []
  const subtotal = roundMoney(allItems.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0,
  ))
  const shipping = roundMoney(Number(invoice?.shipping) || 0)
  const tax = roundMoney(Number(invoice?.tax) || 0)
  const discountType = invoice?.discountType || 'none'
  const discountValue = Number(invoice?.discountValue) || 0

  let discountAmount = 0
  if (discountType === 'percent' && discountValue > 0) {
    discountAmount = roundMoney(subtotal * Math.min(discountValue, 100) / 100)
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = roundMoney(Math.min(subtotal, discountValue))
  }

  const total = Math.max(0, roundMoney(subtotal - discountAmount + shipping + tax))
  return { subtotal, shipping, tax, discountType, discountValue, discountAmount, total }
}

export function computeInvoiceTotals(invoice) {
  const allItems = invoice?.items || []
  const amounts = calcInvoiceAmounts(invoice)
  const { subtotal, shipping, tax, discountType, discountValue, discountAmount } = amounts
  const total = amounts.total
  const fmt = formatInvoiceMoney
  const discountLabel = discountType === 'percent' && discountValue > 0
    ? `Discount (${discountValue}%)`
    : 'Discount'

  return {
    items: allItems.map((it, index) => {
      const qty = Number(it.qty) || 0
      const price = Number(it.price) || 0
      return {
        index: index + 1,
        name: it.name || '',
        qty,
        price,
        lineTotal: qty * price,
        priceFmt: fmt(price),
        lineFmt: fmt(qty * price),
      }
    }),
    subtotal,
    shipping,
    tax,
    discountType,
    discountValue,
    discountAmount,
    discountLabel,
    total,
    subtotalFmt: fmt(subtotal),
    shippingFmt: fmt(shipping),
    taxFmt: fmt(tax),
    discountFmt: fmt(discountAmount),
    totalFmt: fmt(total),
    invoiceId: invoice?.id || '',
    invoiceDate: formatInvoiceDate(invoice?.date),
    dueDate: invoice?.due ? formatInvoiceDate(invoice.due) : '',
    customerName: invoice?.customerName || '',
    customerPhone: invoice?.customerPhone || invoice?.customerWhatsapp || '',
    customerAddress: invoice?.customerAddress || '',
    notes: invoice?.notes || '',
    status: invoice?.status || 'pending',
    company: INVOICE_COMPANY,
    fmt,
  }
}
