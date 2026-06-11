#!/usr/bin/env bash
# Generate VAPID keys for Web Push. Add output to .env and Supabase secrets.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required (Node.js)."
  exit 1
fi

echo "Generating VAPID keys..."
npx --yes web-push@3.6.7 generate-vapid-keys

echo ""
echo "Add to .env:"
echo "  VITE_VAPID_PUBLIC_KEY=<Public Key>"
echo "  VAPID_PUBLIC_KEY=<Public Key>"
echo "  VAPID_PRIVATE_KEY=<Private Key>"
echo "  VAPID_SUBJECT=mailto:your-farm-email@example.com"
echo ""
echo "Then deploy secrets:"
echo "  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:... --project-ref iqwypobdqnrpdkgebkds"
