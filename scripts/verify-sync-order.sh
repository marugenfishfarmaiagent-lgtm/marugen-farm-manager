#!/usr/bin/env bash
# Guard against cloud sync order regressions (setState before flush).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'
FAIL=0

pass() { echo -e "${GREEN}  ✓ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; FAIL=1; }

echo "Marugen — sync order guard"

if [[ ! -f src/lib/cloudWrite.js ]]; then
  fail "src/lib/cloudWrite.js is missing"
else
  pass "cloudWrite.js present"
fi

for f in src/lib/aiActions.js src/App.jsx src/modules/KoiFish.jsx src/modules/CustomerKoi.jsx; do
  if grep -q 'cloudWrite' "$f" 2>/dev/null; then
    pass "$f imports cloudWrite"
  else
    fail "$f does not import cloudWrite (refactor required)"
  fi
done

if grep -q 'setDeliveries(nextDeliveries)' src/App.jsx && grep -A2 'setDeliveries(nextDeliveries)' src/App.jsx | grep -q 'onPersistDeliveries'; then
  fail "DeliveryModule: setDeliveries before onPersistDeliveries detected"
else
  pass "DeliveryModule save order OK"
fi

if grep -q 'setProducts(nextProducts)' src/App.jsx && grep -B1 'persistInventory(nextProducts' src/App.jsx | grep -q 'setProducts(nextProducts)'; then
  fail "InventoryModule: setState before persistInventory detected"
else
  pass "InventoryModule add order OK"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo
  echo -e "${RED}Sync order guard FAILED.${NC}"
  exit 1
fi

echo
echo -e "${GREEN}Sync order guard PASSED.${NC}"
