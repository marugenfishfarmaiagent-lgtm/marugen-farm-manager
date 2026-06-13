/**
 * Cloud-first write orchestration for Marugen Farm Manager.
 *
 * Standard order:
 *   1. markDeleted (optional, deletes only)
 *   2. cloud flush
 *   3. local persist (optional)
 *   4. React setState
 *
 * On failure: unmarkDeleted + best-effort local persist rollback + rethrow.
 */

import { markDeleted, unmarkDeleted } from './syncDeletions.js'

function applyDeleteMarks(deleteMeta) {
  if (!deleteMeta?.entity) return
  if (deleteMeta.id != null && deleteMeta.id !== '') {
    markDeleted(deleteMeta.entity, deleteMeta.id)
  }
  if (Array.isArray(deleteMeta.ids)) {
    deleteMeta.ids.forEach((id) => markDeleted(deleteMeta.entity, id))
  }
}

function revertDeleteMarks(deleteMeta) {
  if (!deleteMeta?.entity) return
  if (deleteMeta.id != null && deleteMeta.id !== '') {
    unmarkDeleted(deleteMeta.entity, deleteMeta.id)
  }
  if (Array.isArray(deleteMeta.ids)) {
    deleteMeta.ids.forEach((id) => unmarkDeleted(deleteMeta.entity, id))
  }
}

/**
 * @param {object} options
 * @param {*} [options.snapshot] — rollback value for persistLocal
 * @param {*} options.next — payload to write
 * @param {(value: *) => void} [options.setState]
 * @param {(value: *) => Promise<void>|void} [options.flush] — cloud sync
 * @param {(value: *) => Promise<void>|void} [options.persistLocal]
 * @param {{ entity: string, id?: string, ids?: string[] }} [options.deleteMeta]
 */
export async function writeCloudFirst({
  snapshot,
  next,
  setState,
  flush,
  persistLocal,
  deleteMeta,
} = {}) {
  applyDeleteMarks(deleteMeta)

  try {
    if (typeof flush === 'function') {
      await flush(next)
    }
    if (typeof persistLocal === 'function') {
      await persistLocal(next)
    }
    if (typeof setState === 'function') {
      setState(next)
    }
    return next
  } catch (err) {
    revertDeleteMarks(deleteMeta)
    if (typeof persistLocal === 'function' && snapshot !== undefined) {
      try {
        await persistLocal(snapshot)
      } catch {
        /* best-effort local rollback */
      }
    }
    throw err
  }
}

/**
 * Inventory / stock log dual-state writes.
 */
export async function writeInventoryCloudFirst({
  nextProducts,
  nextStockLog,
  setProducts,
  setStockLog,
  flush,
  deleteMeta,
} = {}) {
  applyDeleteMarks(deleteMeta)

  try {
    if (typeof flush === 'function') {
      await flush(nextProducts, nextStockLog)
    }
    if (typeof setProducts === 'function') {
      setProducts(nextProducts)
    }
    if (typeof setStockLog === 'function') {
      setStockLog(nextStockLog)
    }
    return { nextProducts, nextStockLog }
  } catch (err) {
    revertDeleteMarks(deleteMeta)
    throw err
  }
}

/** Koi / customer-koi lists — cloud flush only (no duplicate persist+flush). */
export async function writeListCloudFirst({
  snapshot,
  next,
  setState,
  flush,
  isCloudConfigured = false,
  deleteMeta,
} = {}) {
  if (!isCloudConfigured || typeof flush !== 'function') {
    if (typeof setState === 'function') setState(next)
    return next
  }
  return writeCloudFirst({ snapshot, next, setState, flush, deleteMeta })
}
