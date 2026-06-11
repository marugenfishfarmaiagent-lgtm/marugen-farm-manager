const MS_PER_DAY = 86400000

export const CLOUD_RETENTION_DAYS = {
  invoice: 1095,
  expense: 1095,
  koiSold: 730,
  koiDeceased: 365,
  customerKoiDeceased: 365,
  deliveryDone: 365,
  pondLog: 730,
  stockLog: 365,
  calendarPast: 180,
  deathPhoto: 60,
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function cutoffDate(maxDays: number): string {
  const d = new Date(`${todayStr()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - maxDays)
  return d.toISOString().slice(0, 10)
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return Number.POSITIVE_INFINITY
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY
  const now = new Date(`${todayStr()}T12:00:00Z`)
  return Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY)
}

function getInvoiceStatus(inv: { status?: string; due?: string | null }): string {
  if (inv.status === "paid" || inv.status === "cancelled") return inv.status
  if (inv.due && inv.due < todayStr() && inv.status === "pending") return "overdue"
  return inv.status || "pending"
}

function isCloudKeptInvoice(inv: { status?: string; due?: string | null; date?: string | null }): boolean {
  const status = getInvoiceStatus(inv)
  if (status === "pending" || status === "overdue") return true
  return isWithinDays(inv.date, CLOUD_RETENTION_DAYS.invoice)
}

function isWithinDays(dateStr: string | null | undefined, maxDays: number): boolean {
  return daysSince(dateStr) <= maxDays
}

function filterPondDataForCloud(data: Record<string, unknown>) {
  const keepLog = (date: string | undefined) => isWithinDays(date, CLOUD_RETENTION_DAYS.pondLog)
  const maintenanceLogs = ((data.maintenanceLogs as Record<string, unknown>[]) || [])
    .filter((l) => keepLog(l.date as string))
  const treatmentLogs = ((data.treatmentLogs as Record<string, unknown>[]) || [])
    .filter((l) => keepLog((l.startDate || l.date) as string))
  const reminders = ((data.reminders as Record<string, unknown>[]) || [])
    .filter((r) => {
      const status = String(r.status || "pending").toLowerCase()
      if (status === "pending") return true
      if (status === "done") {
        return isWithinDays((r.completedAt || r.dueDate) as string, CLOUD_RETENTION_DAYS.pondLog)
      }
      return isWithinDays(r.dueDate as string, CLOUD_RETENTION_DAYS.pondLog)
    })
  return { ...data, maintenanceLogs, treatmentLogs, reminders }
}

import { deleteExpenseReceiptImages } from "./expenseStorage.ts"
import { deleteInvoicePdfs } from "./invoiceStorage.ts"
import {
  deleteCustomerKoiImages,
  deleteKoiDeathPhotosFromRows,
  deleteKoiFishImages,
} from "./koiImageStorage.ts"

/** Purge expired rows from Supabase (called on fetch). */
export async function purgeExpiredCloudData(db: ReturnType<typeof import("./supabase.ts").adminClient>) {
  const invCut = cutoffDate(CLOUD_RETENTION_DAYS.invoice)
  const expCut = cutoffDate(CLOUD_RETENTION_DAYS.expense)
  const delCut = cutoffDate(CLOUD_RETENTION_DAYS.deliveryDone)
  const evtCut = cutoffDate(CLOUD_RETENTION_DAYS.calendarPast)
  const stockCut = cutoffDate(CLOUD_RETENTION_DAYS.stockLog)
  const koiDeceasedCut = cutoffDate(CLOUD_RETENTION_DAYS.koiDeceased)
  const koiSoldCut = cutoffDate(CLOUD_RETENTION_DAYS.koiSold)
  const ckDeceasedCut = cutoffDate(CLOUD_RETENTION_DAYS.customerKoiDeceased)
  const photoCut = cutoffDate(CLOUD_RETENTION_DAYS.deathPhoto)

  const { data: expiringExpenses } = await db.from("expenses").select("id").lt("date", expCut)
  if (expiringExpenses?.length) {
    await deleteExpenseReceiptImages(db, expiringExpenses.map((r) => r.id))
  }

  const { data: expiringInvoices } = await db.from("invoices").select("id, status, due, date").lt("date", invCut)
  const invoiceIdsToPurge = (expiringInvoices || [])
    .filter((inv) => !isCloudKeptInvoice(inv))
    .map((r) => r.id)
  if (invoiceIdsToPurge.length) {
    await deleteInvoicePdfs(db, invoiceIdsToPurge)
    await db.from("invoices").delete().in("id", invoiceIdsToPurge)
  }

  const { data: expiredDeceasedKoi } = await db.from("koi_fish").select("id")
    .eq("status", "deceased").lt("death_date", koiDeceasedCut)
  if (expiredDeceasedKoi?.length) {
    await deleteKoiFishImages(db, expiredDeceasedKoi.map((r) => r.id))
  }

  const { data: expiredDeceasedCustomerKoi } = await db.from("customer_koi").select("id")
    .eq("status", "deceased").lt("death_date", ckDeceasedCut)
  if (expiredDeceasedCustomerKoi?.length) {
    await deleteCustomerKoiImages(db, expiredDeceasedCustomerKoi.map((r) => r.id))
  }

  const { data: koiDeathStrip } = await db.from("koi_fish").select("death_photo")
    .eq("status", "deceased").lt("death_date", photoCut).not("death_photo", "is", null)
  if (koiDeathStrip?.length) await deleteKoiDeathPhotosFromRows(db, koiDeathStrip)

  const { data: ckDeathStrip } = await db.from("customer_koi").select("death_photo")
    .eq("status", "deceased").lt("death_date", photoCut).not("death_photo", "is", null)
  if (ckDeathStrip?.length) await deleteKoiDeathPhotosFromRows(db, ckDeathStrip)

  await Promise.all([
    db.from("expenses").delete().lt("date", expCut),
    db.from("deliveries").delete().in("status", ["delivered", "cancelled"]).lt("schedule", `${delCut}T23:59:59`),
    db.from("events").delete().lt("date", evtCut),
    db.from("stock_activity").delete().lt("date", stockCut),
    db.from("koi_fish").delete().eq("status", "deceased").lt("death_date", koiDeceasedCut),
    db.from("customer_koi").delete().eq("status", "deceased").lt("death_date", ckDeceasedCut),
    db.from("koi_fish").update({ death_photo: null }).eq("status", "deceased").lt("death_date", photoCut).not("death_photo", "is", null),
    db.from("customer_koi").update({ death_photo: null }).eq("status", "deceased").lt("death_date", photoCut).not("death_photo", "is", null),
  ])

  const { data: soldKoi } = await db.from("koi_fish").select("id, sold_date, date_added").eq("status", "sold")
  const soldIds = (soldKoi || [])
    .filter((row) => !isWithinDays((row.sold_date || row.date_added) as string, CLOUD_RETENTION_DAYS.koiSold))
    .map((row) => row.id)
  if (soldIds.length) {
    await deleteKoiFishImages(db, soldIds)
    await db.from("koi_fish").delete().in("id", soldIds)
  }

  const { data: pondRow } = await db.from("farm_pond_data").select("data").eq("id", "default").maybeSingle()
  if (pondRow?.data && typeof pondRow.data === "object") {
    const filtered = filterPondDataForCloud(pondRow.data as Record<string, unknown>)
    await db.from("farm_pond_data").upsert({ id: "default", data: filtered }, { onConflict: "id" })
  }

  const teamNotifCut = new Date()
  teamNotifCut.setDate(teamNotifCut.getDate() - 30)
  await db.from("team_notifications").delete().lt("created_at", teamNotifCut.toISOString())
}
