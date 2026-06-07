/** Pond dimension units → metres */
export const POND_DIM_UNITS = [
  { value: 'cm', label: 'cm' },
  { value: 'm', label: 'm' },
  { value: 'inch', label: 'inch' },
  { value: 'ft', label: 'feet' },
]

const TO_METRES = {
  cm: 0.01,
  m: 1,
  inch: 0.0254,
  ft: 0.3048,
}

export function dimToMetres(value, unit) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const factor = TO_METRES[unit]
  if (!factor) return null
  return n * factor
}

/** Rectangular pond volume from L × W × H. Returns null if invalid. */
export function calcPondVolume({ length, width, height, unit = 'm' }) {
  const l = dimToMetres(length, unit)
  const w = dimToMetres(width, unit)
  const h = dimToMetres(height, unit)
  if (l == null || w == null || h == null) return null

  const cubicMetres = l * w * h
  const litres = cubicMetres * 1000
  const metricTons = cubicMetres // ~1 tonne per m³ of water

  return {
    cubicMetres,
    litres,
    metricTons,
    dimensionsM: { length: l, width: w, height: h },
  }
}

/**
 * Salt to raise concentration from current% to target% (weight % in water).
 * Assumes 1 L water ≈ 1 kg. Returns mass in kg and grams.
 */
export function calcSaltToAdd({ volumeLitres, currentSaltPct, targetSaltPct }) {
  const vol = Number(volumeLitres)
  const current = Number(currentSaltPct)
  const target = Number(targetSaltPct)
  if (!Number.isFinite(vol) || vol <= 0) return null
  if (!Number.isFinite(current) || current < 0) return null
  if (!Number.isFinite(target) || target < 0) return null

  const delta = target - current
  if (delta <= 0) {
    return {
      deltaPct: delta,
      kg: 0,
      grams: 0,
      alreadyAtTarget: delta === 0,
      overTarget: delta < 0,
    }
  }

  const kg = (vol * delta) / 100
  return {
    deltaPct: delta,
    kg,
    grams: kg * 1000,
    alreadyAtTarget: false,
    overTarget: false,
  }
}

/** Convert metric tons (water) to litres. */
export function tonsToLitres(tons) {
  const t = Number(tons)
  if (!Number.isFinite(t) || t <= 0) return null
  return t * 1000
}

export function formatVolumeNumber(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}
