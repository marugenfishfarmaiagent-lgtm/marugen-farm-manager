#!/usr/bin/env bash
# Deploy Marugen backend to Supabase project iqwypobdqnrpdkgebkds
# Prerequisite: supabase login (must be marugenfishfarmaiagent@gmail.com account)

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="iqwypobdqnrpdkgebkds"

echo "→ Linking project $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF"

echo "→ Applying database patch ..."
supabase db query -f supabase/setup_marugen_project.sql --linked

echo "→ Deploying edge functions ..."
supabase functions deploy auth-login --project-ref "$PROJECT_REF"
supabase functions deploy farm-api --project-ref "$PROJECT_REF"
supabase functions deploy gemini-chat --project-ref "$PROJECT_REF"

if [[ -f .env ]] && grep -q '^VITE_GEMINI_API_KEY=' .env; then
  GEM="$(grep '^VITE_GEMINI_API_KEY=' .env | cut -d= -f2-)"
  echo "→ Setting GEMINI_API_KEY secret ..."
  supabase secrets set "GEMINI_API_KEY=$GEM" --project-ref "$PROJECT_REF"
fi

echo "✓ Done. Update Vercel env:"
echo "  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
echo "  VITE_SUPABASE_ANON_KEY=(Settings → API → anon public)"
