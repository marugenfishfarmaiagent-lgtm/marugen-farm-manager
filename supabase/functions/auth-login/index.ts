import { corsHeadersFor, jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { hashPin, verifyPin } from "../_shared/pin.ts";
import {
  clearSessionCookieHeader,
  sessionCookieHeader,
  sessionTokenFromCookie,
} from "../_shared/sessionCookie.ts";
import { adminClient, sessionTokenFrom, validateSession } from "../_shared/supabase.ts";

const SESSION_DAYS = 7;
const MAX_PIN_LENGTH = 32;

const OWNER_PERMISSIONS = [
  "dashboard", "inventory", "koifish", "customerkoi", "ponds",
  "invoices", "customers", "expenses", "accounting", "edit", "delete", "refund",
  "deliveries", "calendar", "chat", "users",
];

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || req.headers.get("cf-connecting-ip")
    || "unknown";
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

function setupSecretOk(req: Request, bodySecret?: unknown): boolean {
  const required = Deno.env.get("FARM_SETUP_SECRET");
  if (!required) return true;
  const provided = String(bodySecret ?? req.headers.get("x-setup-secret") ?? "");
  return provided.length > 0 && provided === required;
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

function authJson(body: Record<string, unknown>, req: Request, status = 200, token?: string) {
  const extra: Record<string, string> = {};
  if (token) extra["Set-Cookie"] = sessionCookieHeader(token);
  const payload = token ? { ...body, sessionToken: token } : body;
  return jsonResponse(payload, status, req, extra);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const db = adminClient();

    if (req.method === "GET") {
      if (!(await checkRateLimit(db, `auth-status:${clientIp(req)}`, 60, 60_000))) {
        return jsonResponse({ error: "Too many requests" }, 429, req);
      }
      const { count } = await db.from("farm_users").select("*", { count: "exact", head: true });
      return jsonResponse({
        needsSetup: count === 0,
        hasUsers: (count || 0) > 0,
      }, 200, req);
    }

    const body = await req.json();
    const { action } = body;

    if (action === "login") {
      const { pin } = body;
      if (!isValidPin(pin)) {
        return jsonResponse({ error: "Enter a 4–32 digit PIN" }, 400, req);
      }
      if (!(await checkRateLimit(db, `login:${clientIp(req)}`, 10, 15 * 60_000))) {
        return jsonResponse({ error: "Too many login attempts. Try again in 15 minutes." }, 429, req);
      }
      const { data: users } = await db.from("farm_users").select("*").eq("active", true);
      for (const user of users || []) {
        if (await verifyUserPin(user, String(pin))) {
          const token = await createSession(user.id);
          return authJson({ user: publicUser(user) }, req, 200, token);
        }
      }
      return jsonResponse({ error: "Incorrect PIN or account inactive" }, 401, req);
    }

    if (action === "setup") {
      const { count } = await db.from("farm_users").select("*", { count: "exact", head: true });
      if ((count || 0) > 0) return jsonResponse({ error: "Setup already completed" }, 400, req);

      if (!setupSecretOk(req, body.setupSecret)) {
        return jsonResponse({ error: "Invalid setup authorization" }, 403, req);
      }

      const { name, pin } = body;
      if (!name?.trim() || !isValidPin(pin)) {
        return jsonResponse({ error: "Name and a 4–32 digit PIN required" }, 400, req);
      }
      if (!(await checkRateLimit(db, `setup:${clientIp(req)}`, 5, 60 * 60_000))) {
        return jsonResponse({ error: "Too many setup attempts. Try again later." }, 429, req);
      }

      const pin_hash = await hashPin(String(pin));
      const { data: created, error } = await db.from("farm_users").insert({
        name: name.trim(),
        role: "owner",
        pin_hash,
        active: true,
        permissions: OWNER_PERMISSIONS,
        is_system: true,
      }).select().single();
      if (error) return jsonResponse({ error: error.message }, 500, req);

      const token = await createSession(created.id);
      return authJson({ user: publicUser(created) }, req, 200, token);
    }

    if (action === "logout") {
      const token = body.token || sessionTokenFromCookie(req) || sessionTokenFrom(req);
      if (token) await db.from("auth_sessions").delete().eq("token", token);
      return jsonResponse({ ok: true }, 200, req, { "Set-Cookie": clearSessionCookieHeader() });
    }

    if (action === "change_pin") {
      const sessionToken = sessionTokenFrom(req);
      const sessionUser = await validateSession(sessionToken);
      if (!sessionUser) return jsonResponse({ error: "Unauthorized — login required" }, 401, req);

      const { currentPin, newPin } = body;
      if (!isValidPin(currentPin) || !isValidPin(newPin)) {
        return jsonResponse({ error: "Current and new PIN must be 4–32 digits" }, 400, req);
      }
      if (String(currentPin) === String(newPin)) {
        return jsonResponse({ error: "New PIN must be different from current PIN" }, 400, req);
      }

      const { data: row, error: fetchErr } = await db.from("farm_users").select("*").eq("id", sessionUser.id).maybeSingle();
      if (fetchErr || !row) return jsonResponse({ error: "User not found" }, 404, req);
      if (!(await verifyUserPin(row, String(currentPin)))) {
        return jsonResponse({ error: "Current PIN is incorrect" }, 401, req);
      }

      const { data: allUsers } = await db.from("farm_users").select("id, pin_hash, pin").eq("active", true);
      for (const other of allUsers || []) {
        if (other.id === sessionUser.id) continue;
        if (await verifyUserPin(other, String(newPin))) {
          return jsonResponse({ error: "This PIN is already assigned to another user" }, 400, req);
        }
      }

      const pin_hash = await hashPin(String(newPin));
      const { error: updateErr } = await db.from("farm_users").update({ pin_hash, pin: null }).eq("id", sessionUser.id);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500, req);

      return jsonResponse({ ok: true }, 200, req);
    }

    return jsonResponse({ error: "Unknown action" }, 400, req);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500, req);
  }
});
