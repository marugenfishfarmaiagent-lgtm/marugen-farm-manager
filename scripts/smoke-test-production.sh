#!/usr/bin/env bash
# Section 7 — Production smoke test (automated checks + manual checklist).
# Usage: ./scripts/smoke-test-production.sh [app-url] [supabase-url]
#
# Automated: health, app shell, edge functions, PWA assets, in-repo feature wiring.
# Manual: PIN login, CRUD flows, 4h signed URLs, cross-device sync, UptimeRobot.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_URL="${1:-https://marugen-farm-manager.vercel.app}"
APP_URL="${APP_URL%/}"
SUPA_URL="${2:-https://iqwypobdqnrpdkgebkds.supabase.co}"
SUPA_URL="${SUPA_URL%/}"

PASS=0
FAIL=0
MANUAL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

pass() {
  PASS=$((PASS + 1))
  green "  ✓ $1"
}

fail() {
  FAIL=$((FAIL + 1))
  red "  ✗ $1"
}

manual() {
  MANUAL=$((MANUAL + 1))
  yellow "  ○ $1 (manual — needs PIN / second device / time)"
}

http_ok() {
  local url="$1"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
  [[ "$code" == "200" ]]
}

http_body() {
  curl -fsSL "$1" 2>/dev/null || true
}

repo_has() {
  grep -q "$1" "$2" 2>/dev/null
}

echo "Marugen Farm Manager — Section 7 smoke test"
echo "App:      $APP_URL"
echo "Supabase: $SUPA_URL"
echo ""

echo "── Automated: production endpoints ──"

if BODY="$(http_body "$APP_URL/health.json")" && echo "$BODY" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  pass "#16 /health.json → {\"status\":\"ok\"}"
else
  fail "#16 /health.json missing or invalid"
fi

if http_ok "$APP_URL/"; then
  pass "App root HTTP 200"
else
  fail "App root not HTTP 200"
fi

HTML="$(http_body "$APP_URL/")"
if echo "$HTML" | grep -qi 'Marugen Farm Manager'; then
  pass "HTML title / shell references Marugen Farm Manager"
else
  fail "App HTML shell unexpected"
fi

if echo "$HTML" | grep -q 'id="root"'; then
  pass "React mount point present"
else
  fail "React #root missing"
fi

for asset in placeholder-fish.svg manifest.webmanifest icon-192.png; do
  if http_ok "$APP_URL/$asset"; then
    pass "Static asset /$asset"
  else
    fail "Static asset /$asset not found"
  fi
done

AUTH_BODY="$(curl -s "$SUPA_URL/functions/v1/auth-login" 2>/dev/null || true)"
if echo "$AUTH_BODY" | grep -q '"hasUsers"'; then
  pass "auth-login edge function reachable ($AUTH_BODY)"
else
  fail "auth-login edge function unreachable or unexpected response"
fi

for fn in farm-api gemini-chat; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$SUPA_URL/functions/v1/$fn")"
  if [[ "$code" == "200" || "$code" == "204" ]]; then
    pass "Edge function $fn OPTIONS HTTP $code"
  else
    fail "Edge function $fn OPTIONS HTTP $code"
  fi
done

echo ""
echo "── Automated: in-repo feature wiring (deploy readiness) ──"

if repo_has 'computeDashboardMetrics' "$ROOT/src/App.jsx" \
  && repo_has 'monthlyRevenue' "$ROOT/src/lib/dashboardMetrics.js" \
  && repo_has 'kpiCards' "$ROOT/src/lib/dashboardMetrics.js"; then
  pass "#3 Dashboard KPI cards wired (dashboardMetrics + App)"
else
  fail "#3 Dashboard KPI cards missing"
fi

if [[ -f "$ROOT/src/assets/marugen-logo-base64.js" ]] && repo_has 'generateInvoicePdf' "$ROOT/src/lib/generateInvoicePdf.js"; then
  pass "#4 Invoice PDF + embedded logo"
else
  fail "#4 Invoice PDF / logo base64 missing"
fi

if repo_has 'PAYNOW' "$ROOT/src/lib/generateInvoicePdf.js" || repo_has 'paynow' "$ROOT/src/components/InvoiceDocument.jsx"; then
  pass "#5 PayNow QR block in invoice"
else
  fail "#5 PayNow QR not found"
fi

if repo_has 'driver' "$ROOT/src/App.jsx" \
  && repo_has 'deliveredAt' "$ROOT/src/lib/deliveryOps.js" \
  && repo_has 'buildDeliveryStatusPatch' "$ROOT/src/lib/deliveryOps.js"; then
  pass "#6 Delivery driver + deliveredAt status workflow"
else
  fail "#6 Delivery workflow incomplete"
fi

if repo_has 'StoredImage' "$ROOT/src/App.jsx" || repo_has 'StoredImage' "$ROOT/src/modules/KoiFish.jsx"; then
  pass "#7–8 Expense/koi signed URL refresh (StoredImage)"
else
  fail "#7–8 StoredImage not wired"
fi

if repo_has 'deathPhoto' "$ROOT/src/modules/CustomerKoi.jsx" && repo_has 'DECEASED' "$ROOT/src/modules/CustomerKoi.jsx"; then
  pass "#10 Customer koi deceased + death photo workflow"
else
  fail "#10 Customer koi death workflow missing"
fi

if [[ -f "$ROOT/src/components/PondWaterChart.jsx" ]] && repo_has 'PondWaterChart' "$ROOT/src/modules/PondManagement.jsx"; then
  pass "#11 Pond water parameter chart"
else
  fail "#11 PondWaterChart missing"
fi

if repo_has 'buildChatApiThread' "$ROOT/src/lib/chatOps.js" \
  && repo_has 'buildChatApiThread' "$ROOT/src/App.jsx" \
  && repo_has 'MAX_CHAT_HISTORY' "$ROOT/supabase/functions/gemini-chat/index.ts"; then
  pass "#12–13 AI chat + conversation history"
else
  fail "#12–13 AI chat history missing"
fi

if repo_has 'DEFAULT_PERMISSIONS' "$ROOT/src/data/constants.js" && repo_has 'hasPermission' "$ROOT/src/App.jsx"; then
  pass "#14 Staff permission gating"
else
  fail "#14 Permission system missing"
fi

if repo_has 'cloudPull' "$ROOT/src/App.jsx" || repo_has 'syncFromCloud' "$ROOT/src/lib/database.js"; then
  pass "#15 Cloud sync layer present"
else
  fail "#15 Cloud sync not found"
fi

if grep -q 'Marugen Farm Manager' "$ROOT/index.html" 2>/dev/null; then
  pass "8.1 index.html title"
else
  fail "8.1 title missing"
fi

if [[ -f "$ROOT/public/favicon.png" || -f "$ROOT/public/favicon-32.png" ]]; then
  pass "8.2 favicon assets in public/"
else
  fail "8.2 favicon missing"
fi

if grep -q 'theme-color.*#0f172a' "$ROOT/index.html" 2>/dev/null; then
  pass "8.3 PWA theme-color #0f172a"
else
  fail "8.3 theme-color not set"
fi

if repo_has 'Loader2' "$ROOT/src/App.jsx" && repo_has 'LoadingScreen' "$ROOT/src/App.jsx"; then
  pass "8.4 Auth boot loading spinner"
else
  fail "8.4 loading spinner missing"
fi

if repo_has 'lastSyncAt' "$ROOT/src/App.jsx" && repo_has 'Last synced' "$ROOT/src/App.jsx"; then
  pass "8.5 Last sync indicator"
else
  fail "8.5 last sync indicator missing"
fi

echo ""
echo "── Production UI (no PIN — limited) ──"

if echo "$HTML" | grep -q 'modulepreload\|assets/index'; then
  pass "Vite production bundle referenced in HTML"
else
  fail "Production JS bundle not detected in HTML"
fi

manual "#1 Login with PIN — desktop browser"
manual "#2 Login with PIN — mobile PWA (Add to Home Screen)"
manual "#3 Confirm 6 KPI cards show live numbers after login"
manual "#4 Create invoice → PDF → logo + customer phone/email/address"
manual "#5 Scan PayNow QR on generated invoice PDF"
manual "#6 Create delivery → driver → status → Google/Apple Maps link"
manual "#7 Upload expense receipt → verify in Supabase Storage bucket"
manual "#8 Re-open expense photo after 4+ hours (signed URL refresh)"
manual "#9 Add koi + photo → appears in stock list"
manual "#10 Mark customer koi deceased + upload death photo"
manual "#11 Add pond water reading → chart shows history"
manual "#12 AI Chat question in Burmese → relevant answer"
manual "#13 AI follow-up → remembers prior message"
manual "#14 Staff PIN → restricted modules hidden"
manual "#15 Change on device A → appears on device B"
manual "#17 UptimeRobot — pause/resume monitor to test email alert"

echo ""
echo "── Summary ──"
green "  Passed (automated): $PASS"
if [[ "$FAIL" -gt 0 ]]; then
  red "  Failed (automated): $FAIL"
else
  echo "  Failed (automated): 0"
fi
yellow "  Manual steps remaining: $MANUAL"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  red "Automated smoke checks FAILED — fix before production sign-off."
  exit 1
fi

green "Automated smoke checks PASSED."
yellow "Complete the $MANUAL manual steps above before deploy sign-off."
exit 0
