type RateDb = ReturnType<typeof import("./supabase.ts").adminClient>;

export async function checkRateLimit(
  db: RateDb,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  const { data: row } = await db.from("api_rate_limits")
    .select("hit_count, reset_at")
    .eq("bucket_key", key)
    .maybeSingle();

  if (!row || new Date(row.reset_at) <= now) {
    await db.from("api_rate_limits").upsert({
      bucket_key: key,
      hit_count: 1,
      reset_at: resetAt.toISOString(),
    }, { onConflict: "bucket_key" });
    return true;
  }

  if ((row.hit_count || 0) >= limit) return false;

  await db.from("api_rate_limits").update({
    hit_count: (row.hit_count || 0) + 1,
  }).eq("bucket_key", key);

  return true;
}

export async function pruneRateLimits(db: RateDb) {
  await db.from("api_rate_limits").delete().lt("reset_at", new Date().toISOString());
}
