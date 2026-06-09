#!/usr/bin/env bash
# Verify production monitoring endpoints (Section 5.2 smoke checks).
# Usage: ./scripts/verify-monitoring.sh [health-url]

set -euo pipefail

HEALTH_URL="${1:-https://marugen-farm-manager.vercel.app/health.json}"
ROOT_URL="${HEALTH_URL%/health.json}"

echo "→ Health check: $HEALTH_URL"
BODY="$(curl -fsSL "$HEALTH_URL")"
echo "   Response: $BODY"

if ! echo "$BODY" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "✗ health.json missing status: ok"
  exit 1
fi
echo "✓ health.json OK"

echo ""
echo "→ App root (expect HTTP 200): $ROOT_URL/"
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "$ROOT_URL/")"
if [[ "$STATUS" != "200" ]]; then
  echo "✗ App root returned HTTP $STATUS (expected 200)"
  exit 1
fi
echo "✓ App root HTTP 200"

echo ""
echo "Manual dashboard steps (cannot automate from repo):"
echo "  1. UptimeRobot → HTTP(s) monitor → $HEALTH_URL (5 min interval, keyword: ok)"
echo "  2. Vercel → marugen-farm-manager → Analytics → Enable"
echo "  3. sentry.io → React project → copy DSN → Vercel VITE_SENTRY_DSN → redeploy"
echo ""
echo "In-app monitoring status:"
if [[ -f public/health.json ]]; then
  echo "  ✓ public/health.json present (ships with build)"
else
  echo "  ✗ public/health.json missing"
  exit 1
fi
if grep -q '@vercel/analytics' src/main.jsx 2>/dev/null; then
  echo "  ✓ @vercel/analytics wired in src/main.jsx"
else
  echo "  ✗ Vercel Analytics not imported"
  exit 1
fi
if grep -q 'initMonitoring' src/main.jsx 2>/dev/null; then
  echo "  ✓ Sentry scaffold (initMonitoring) wired — active when VITE_SENTRY_DSN is set"
else
  echo "  ✗ Sentry init missing"
  exit 1
fi

echo ""
echo "✓ Automated monitoring checks passed."
