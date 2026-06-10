/** Cloud persist helpers — upload images first, then sync records immediately. */

import { hasCloudSession } from './auth'
import { isSupabaseConfigured } from './supabase'
import * as db from './database'

export function assertCloudUploadReady() {
  if (!isSupabaseConfigured) return
  if (!hasCloudSession()) {
    throw new Error('Session expired. Log out and log in again, then retry.')
  }
}

export async function persistKoiFishList(list) {
  if (!isSupabaseConfigured) return
  assertCloudUploadReady()
  await db.syncKoiFish(list)
}

export async function persistCustomerKoiList(list) {
  if (!isSupabaseConfigured) return
  assertCloudUploadReady()
  await db.syncCustomerKoi(list)
}

export async function persistExpenseList(list) {
  if (!isSupabaseConfigured) return
  assertCloudUploadReady()
  await db.syncExpenses(list)
}
