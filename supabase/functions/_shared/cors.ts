const DEFAULT_ORIGINS = [
  "https://marugen-farm-manager.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:4173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5176",
];

export function getAllowedOrigins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

export function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (hostname.endsWith(".vercel.app")) return true;
    if (hostname.endsWith(".marugenfishfarm.com")) return true;
  } catch {
    return false;
  }
  return false;
}

function originFromReferer(req: Request, allowed: string[]): string | null {
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    const refOrigin = new URL(referer).origin;
    return isAllowedOrigin(refOrigin, allowed) ? refOrigin : null;
  } catch {
    return null;
  }
}

function resolveOrigin(req: Request): string {
  const allowed = getAllowedOrigins();
  const origin = req.headers.get("origin");
  if (origin && isAllowedOrigin(origin, allowed)) return origin;
  const fromReferer = originFromReferer(req, allowed);
  if (fromReferer) return fromReferer;
  return allowed[0] || "https://marugen-farm-manager.vercel.app";
}

export function corsHeadersFor(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, prefer, x-supabase-api-version, x-session-token, x-setup-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/** @deprecated use corsHeadersFor(req) */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token, x-setup-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function optionsResponse(req: Request) {
  return new Response("ok", { headers: corsHeadersFor(req) });
}

export function jsonResponse(body: unknown, status = 200, req?: Request, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    ...(req ? corsHeadersFor(req) : corsHeaders),
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  return new Response(JSON.stringify(body), { status, headers });
}
