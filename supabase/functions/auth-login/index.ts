import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { hashPin, verifyPin } from "../_shared/pin.ts";
import { adminClient, sessionTokenFrom, validateSession } from "../_shared/supabase.ts";

const SESSION_DAYS = 7;
const MAX_PIN_LENGTH = 32;

const OWNER_PERMISSIONS = [
  "dashboard", "inventory", "koifish", "customerkoi", "ponds",
  "invoices", "customers", "expenses", "accounting", "edit", "delete", "refund",
  "deliveries", "calendar", "chat", "users",
];

const loginRateMap = new Map<string, { count: number; reset: number }>();
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 15 * 60_000;

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

function checkLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = loginRateMap.get(key);
  if (!entry || now > entry.reset) {
    loginRateMap.set(key, { count: 1, reset: now + LOGIN_RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= LOGIN_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function isValidPin(pin: unknown): pin is string {
  const s = String(pin ?? "");
  return s.length >= 4 && s.length <= MAX_PIN_LENGTH && /^\d+$/.test(s);
}

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    permissions: row.permissions || [],
    isSystem: row.is_system || false,
    active: row.active !== false,
  };
}

async function createSession(userId: number) {
  const db = adminClient();
  const token = crypto.randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  await db.from("auth_sessions").insert({
    user_id: userId,
    token,
    expires_at: expires.toISOString(),
  });
  return token;
}

async function verifyUserPin(user: Record<string, unknown>, pin: string): Promise<boolean> {
  if (user.pin_hash && typeof user.pin_hash === "string") {
    return verifyPin(pin, user.pin_hash);
  }
  if (user.pin && user.pin === pin) {
    const db = adminClient();
    const pin_hash = await hashPin(pin);
    await db.from("farm_users").update({ pin_hash, pin: null }).eq("id", user.id);
    return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const db = adminClient();

    if (req.method === "GET") {
      const { count } = await db.from("farm_users").select("*", { count: "exact", head: true });
      const { data: publicUsers } = await db.from("farm_users")
        .select("id, name, role, active")
        .eq("active", true)
        .order("id");
      return jsonResponse({
        needsSetup: count === 0,
        hasUsers: (count || 0) > 0,
        users: (publicUsers || []).map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role,
          active: u.active !== false,
        })),
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "login") {
      const { pin } = body;
      if (!isValidPin(pin)) {
        return jsonResponse({ error: "Enter a 4–32 digit PIN" }, 400);
      }
      if (!checkLoginRateLimit(`login:${clientIp(req)}`)) {
        return jsonResponse({ error: "Too many login attempts. Try again in 15 minutes." }, 429);
      }
      const { data: users } = await db.from("farm_users").select("*").eq("active", true);
      for (const user of users || []) {
        if (await verifyUserPin(user, String(pin))) {
          const token = await createSession(user.id);
          return jsonResponse({ token, user: publicUser(user) });
        }
      }
      return jsonResponse({ error: "Incorrect PIN or account inactive" }, 401);
    }

    if (action === "setup") {
      const { count } = await db.from("farm_users").select("*", { count: "exact", head: true });
      if ((count || 0) > 0) return jsonResponse({ error: "Setup already completed" }, 400);

      const { name, pin } = body;
      if (!name?.trim() || !isValidPin(pin)) {
        return jsonResponse({ error: "Name and a 4–32 digit PIN required" }, 400);
      }
      if (!checkLoginRateLimit(`setup:${clientIp(req)}`)) {
        return jsonResponse({ error: "Too many setup attempts. Try again later." }, 429);
      }

      const permissions = OWNER_PERMISSIONS;
      const pin_hash = await hashPin(String(pin));
      const { data: created, error } = await db.from("farm_users").insert({
        name: name.trim(),
        role: "owner",
        pin_hash,
        active: true,
        permissions,
        is_system: true,
      }).select().single();
      if (error) return jsonResponse({ error: error.message }, 500);

      const token = await createSession(created.id);
      return jsonResponse({ token, user: publicUser(created) });
    }

    if (action === "logout") {
      const token = body.token;
      if (token) await db.from("auth_sessions").delete().eq("token", token);
      return jsonResponse({ ok: true });
    }

    if (action === "change_pin") {
      const sessionToken = sessionTokenFrom(req) || body.token;
      const sessionUser = await validateSession(sessionToken);
      if (!sessionUser) return jsonResponse({ error: "Unauthorized — login required" }, 401);

      const { currentPin, newPin } = body;
      if (!isValidPin(currentPin) || !isValidPin(newPin)) {
        return jsonResponse({ error: "Current and new PIN must be 4–32 digits" }, 400);
      }
      if (String(currentPin) === String(newPin)) {
        return jsonResponse({ error: "New PIN must be different from current PIN" }, 400);
      }

      const { data: row, error: fetchErr } = await db.from("farm_users").select("*").eq("id", sessionUser.id).maybeSingle();
      if (fetchErr || !row) return jsonResponse({ error: "User not found" }, 404);
      if (!(await verifyUserPin(row, String(currentPin)))) {
        return jsonResponse({ error: "Current PIN is incorrect" }, 401);
      }

      const { data: allUsers } = await db.from("farm_users").select("id, pin_hash, pin").eq("active", true);
      for (const other of allUsers || []) {
        if (other.id === sessionUser.id) continue;
        if (await verifyUserPin(other, String(newPin))) {
          return jsonResponse({ error: "This PIN is already assigned to another user" }, 400);
        }
      }

      const pin_hash = await hashPin(String(newPin));
      const { error: updateErr } = await db.from("farm_users").update({ pin_hash, pin: null }).eq("id", sessionUser.id);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500);

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
});
