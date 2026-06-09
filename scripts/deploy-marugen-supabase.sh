#!/usr/bin/env bash
# Deploy Marugen backend to Supabase project iqwypobdqnrpdkgebkds (Section 5.1).
# Prerequisite: supabase login (project owner account)

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-iqwypobdqnrpdkgebkds}"

echo "→ Linking project $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF"

echo "→ Applying migrations (supabase/migrations/*.sql in timestamp order) ..."
supabase db push --linked

echo "→ Deploying edge functions ..."
supabase functions deploy auth-login --project-ref "$PROJECT_REF"
supabase functions deploy farm-api --project-ref "$PROJECT_REF"
supabase functions deploy gemini-chat --project-ref "$PROJECT_REF"

if [[ -f .env ]] && grep -q '^GEMINI_API_KEY=' .env; then
  GEM="$(grep '^GEMINI_API_KEY=' .env | cut -d= -f2-)"
  echo "→ Setting GEMINI_API_KEY secret from .env ..."
  supabase secrets set "GEMINI_API_KEY=$GEM" --project-ref "$PROJECT_REF"
elif [[ -f .env ]] && grep -q '^VITE_GEMINI_API_KEY=' .env; then
  echo "⚠ Move Gemini key to Supabase secrets only — do not use VITE_GEMINI_API_KEY in production."
  GEM="$(grep '^VITE_GEMINI_API_KEY=' .env | cut -d= -f2-)"
  supabase secrets set "GEMINI_API_KEY=$GEM" --project-ref "$PROJECT_REF"
fi

echo ""
echo "✓ Supabase deploy complete."
echo ""
echo "Verify in Dashboard:"
echo "  • Storage → buckets: expense-receipts, koi-photos (both private)"
echo "  • SQL Editor → run scripts/verify-storage-buckets.sql"
echo ""
echo "Vercel env (if not set):"
echo "  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
echo "  VITE_SUPABASE_ANON_KEY=(Settings → API → anon public)"
echo ""
echo "Monitoring (Section 5.2): ./scripts/verify-monitoring.sh"
