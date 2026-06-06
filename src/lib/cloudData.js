import { loadKoiFish, loadCustomerKoi, loadPondData, clearKoiLocalStorage } from './koiStorage'
import { loadWhatsappGroups, clearWhatsappGroupsLocal } from './deliveryWhatsApp'
import { DEFAULT_TREATMENT_GUIDES, INITIAL_POND_DATA, normalizeCustomerKoiRecord } from '../data/constants'

export function emptyPondData() {
  return {
    ...INITIAL_POND_DATA,
    treatmentGuides: [...DEFAULT_TREATMENT_GUIDES],
  }
}

function hasLocalKoiData() {
  const koi = loadKoiFish()
  const customerKoi = loadCustomerKoi()
  const pond = loadPondData()
  return koi.length > 0
    || customerKoi.length > 0
    || (pond.ponds?.length > 0)
    || (pond.maintenanceLogs?.length > 0)
    || (pond.treatmentLogs?.length > 0)
    || (pond.reminders?.length > 0)
}

function isCloudKoiEmpty(data) {
  if (!data) return true
  const pond = data.pondData
  return !data.koiFish?.length
    && !data.customerKoi?.length
    && (!pond
      || (!pond.ponds?.length
        && !pond.maintenanceLogs?.length
        && !pond.treatmentLogs?.length
        && !pond.reminders?.length))
}

/** Prefer cloud; one-time upload from this device's localStorage if cloud is empty. */
export function resolveCloudKoiPayload(data) {
  const cloudKoi = data?.koiFish || []
  const cloudCustomer = (data?.customerKoi || []).map(normalizeCustomerKoiRecord)
  const cloudPond = data?.pondData?.ponds != null ? data.pondData : emptyPondData()

  if (hasLocalKoiData() && isCloudKoiEmpty(data)) {
    return {
      koiFish: loadKoiFish(),
      customerKoi: loadCustomerKoi(),
      pondData: loadPondData(),
      migratedFromLocal: true,
    }
  }

  return {
    koiFish: cloudKoi,
    customerKoi: cloudCustomer,
    pondData: cloudPond,
    migratedFromLocal: false,
  }
}

export function resolveCloudWhatsappGroups(cloudGroups) {
  const local = loadWhatsappGroups()
  if (local.length > 0 && (!cloudGroups || cloudGroups.length === 0)) {
    return { groups: local, migratedFromLocal: true }
  }
  return { groups: cloudGroups || [], migratedFromLocal: false }
}

export function clearLocalOnlyStorage() {
  clearKoiLocalStorage()
  clearWhatsappGroupsLocal()
}
