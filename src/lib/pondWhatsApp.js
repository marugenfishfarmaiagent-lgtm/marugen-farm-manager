import { openWhatsAppShare } from './invoiceWhatsApp'

export function formatTreatmentGuideWhatsAppMessage(guide, { pondName } = {}) {
  const lines = [
    'Marugen Koi Farm — Treatment Guide',
    '',
    `📋 ${guide.title || 'Treatment guide'}`,
  ]
  if (guide.category?.trim()) lines.push(`Category: ${guide.category.trim()}`)
  if (pondName?.trim()) lines.push(`Pond: ${pondName.trim()}`)
  lines.push('', 'Steps:', guide.steps?.trim() || '—')
  if (guide.warning?.trim()) lines.push('', `⚠ Warning: ${guide.warning.trim()}`)
  lines.push('', '— Marugen Koi Farm')
  return lines.join('\n')
}

export function shareTreatmentGuideOnWhatsApp(guide, opts) {
  openWhatsAppShare(formatTreatmentGuideWhatsAppMessage(guide, opts))
}
