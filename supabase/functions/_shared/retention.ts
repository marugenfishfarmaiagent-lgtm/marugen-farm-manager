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
    .filter((r) => r.status === "pending" || isWithinDays(r.dueDate as string, CLOUD_RETENTION_DAYS.pondLog))
  return { ...data, maintenanceLogs, treatmentLogs, reminders }
}

import { deleteExpenseReceiptImages } from "./expenseStorage.ts"

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

  await Promise.all([
    db.from("invoices").delete().lt("date", invCut),
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
    await db.from("koi_fish").delete().in("id", soldIds)
  }

  const { data: pondRow } = await db.from("farm_pond_data").select("data").eq("id", "default").maybeSingle()
  if (pondRow?.data && typeof pondRow.data === "object") {
    const filtered = filterPondDataForCloud(pondRow.data as Record<string, unknown>)
    await db.from("farm_pond_data").upsert({ id: "default", data: filtered }, { onConflict: "id" })
  }
}
