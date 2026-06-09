const DEFAULT_ORIGINS = [
  "https://marugen-farm-manager.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

export function getAllowedOrigins(): string[] {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...extra])];
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    if (hostname.endsWith(".vercel.app")) return true;
  } catch {
    return false;
  }
  return false;
}

function resolveOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  const allowed = getAllowedOrigins();
  if (origin && isAllowedOrigin(origin, allowed)) return origin;
  return allowed[0] || "https://marugen-farm-manager.vercel.app";
}

export function corsHeadersFor(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token, x-setup-secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
