#!/usr/bin/env bash
# List Supabase migrations in apply order (Section 5.1).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Supabase migrations (apply in this order via supabase db push or SQL Editor):"
echo ""
ls -1 supabase/migrations/*.sql | sort
echo ""
echo "Critical storage migrations (must run before koi/expense photo upload):"
echo "  • 20250615000000_expense_storage.sql"
echo "  • 20250616000000_expense_storage_private.sql"
echo "  • 20250617000000_koi_photos_storage.sql"
echo ""
echo "After all migrations:"
echo "  supabase functions deploy farm-api"
echo "  supabase functions deploy gemini-chat"
echo ""
echo "Verify buckets: run scripts/verify-storage-buckets.sql in SQL Editor"
