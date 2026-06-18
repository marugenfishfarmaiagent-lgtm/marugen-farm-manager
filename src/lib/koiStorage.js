import {
  DEFAULT_TREATMENT_GUIDES, INITIAL_CUSTOMER_KOI, INITIAL_KOI_FISH, INITIAL_POND_DATA,
  normalizeCustomerKoiRecord,
} from '../data/constants'

const KEYS = {
  koiFish: 'marugen_koi_fish_v2',
  customerKoi: 'marugen_customer_koi_v2',
  ponds: 'marugen_ponds_data_v2',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return fallback
}

function write(key, data) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function loadKoiFish() {
  return read(KEYS.koiFish, INITIAL_KOI_FISH)
}

export function saveKoiFish(list) {
  write(KEYS.koiFish, list)
}

export function loadCustomerKoi() {
  const list = read(KEYS.customerKoi, INITIAL_CUSTOMER_KOI)
  return Array.isArray(list) ? list.map(normalizeCustomerKoiRecord) : INITIAL_CUSTOMER_KOI
}

export function saveCustomerKoi(list) {
  write(KEYS.customerKoi, list)
}

export function loadPondData() {
  const data = read(KEYS.ponds, null)
  if (!data) {
    return {
      ...INITIAL_POND_DATA,
      treatmentGuides: [...DEFAULT_TREATMENT_GUIDES],
    }
  }
  return {
    ...INITIAL_POND_DATA,
    ...data,
    treatmentGuides: data.treatmentGuides != null ? data.treatmentGuides : [...DEFAULT_TREATMENT_GUIDES],
  }
}

export function savePondData(data) {
  write(KEYS.ponds, data)
}

export function clearKoiLocalStorage() {
  try {
    localStorage.removeItem(KEYS.koiFish)
    localStorage.removeItem(KEYS.customerKoi)
    localStorage.removeItem(KEYS.ponds)
  } catch {
    // ignore
  }
}
