import { formatSGD } from '../data/constants'

/** Actions that change or remove existing data — require user confirmation in AI Chat. */
export const RISKY_AI_ACTIONS = new Set([
  'cancel_invoice',
  'delete_customer',
  'delete_product',
  'delete_delivery',
  'delete_calendar_event',
  'refund_koi_sale',
  'sell_koi',
  'update_customer',
  'update_delivery',
  'update_calendar_event',
])

export function actionConfirmKey(name, args = {}) {
  return `${name}:${JSON.stringify(args)}`
}

export function isRiskyAiAction(name) {
  return RISKY_AI_ACTIONS.has(name)
}

export function describeRiskyAction(name, args = {}, ctx = {}) {
  const a = args || {}
  switch (name) {
    case 'cancel_invoice': {
      const id = a.invoiceId || a.invoice || a.id
      const inv = ctx.invoices?.find((i) => String(i.id) === String(id))
      return `Cancel invoice ${inv?.id || id} for ${inv?.customerName || 'customer'} (${inv ? formatSGD(inv.total) : 'amount unknown'})? Stock and fish will be restored.`
    }
    case 'delete_customer': {
      const c = ctx.customers?.find((x) => x.name === (a.name || a.customerName))
      return `Delete customer ${c?.name || a.name || a.customerName}? This cannot be undone.`
    }
    case 'delete_product': {
      return `Remove product "${a.productName || a.name || a.product}" from inventory? This cannot be undone.`
    }
    case 'delete_delivery': {
      const id = a.deliveryId || a.id
      const d = ctx.deliveries?.find((x) => String(x.id) === String(id))
      return `Delete delivery ${d?.id || id} for ${d?.customerName || a.customerName || 'customer'}?`
    }
    case 'delete_calendar_event': {
      return `Delete calendar event "${a.title || a.event}" on ${a.date || 'selected date'}?`
    }
    case 'refund_koi_sale': {
      return `Refund koi sale ${a.koiId || a.koi || a.name || ''}? Fish returns to available stock.`
    }
    case 'sell_koi': {
      return `Mark koi ${a.koiId || a.koi || a.name || ''} as SOLD to ${a.customerName || a.customer}? ${a.disposition === 'keep' ? 'Kept at farm.' : 'Taken away.'}`
    }
    case 'update_customer':
      return `Update customer ${a.name || a.customerName || ''} profile?`
    case 'update_delivery':
      return `Edit delivery ${a.deliveryId || a.customerName || ''}?`
    case 'update_calendar_event':
      return `Edit event "${a.title || a.event}"?`
    default:
      return `Proceed with ${name.replace(/_/g, ' ')}?`
  }
}
