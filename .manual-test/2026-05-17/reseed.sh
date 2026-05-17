#!/usr/bin/env bash
# Manual-test reseed
# ---------------------------------------------------------------------------
# Wipes the 12 seeded accounts (3 baseline + 9 throwaway/pre-state) by ID
# and re-runs seed.sql. Intended to be invoked:
#   - once before a manual-test run, after migrations
#   - between categories (D4 protocol) to undo destructive TCs from category A
#
# Usage:
#   ./reseed.sh                          # local D1 (default)
#   ./reseed.sh --remote                 # remote D1 (not yet wired)
#
# This deletes accounts only — it does NOT touch notes / tags / media /
# directories created by TCs themselves. If a TC leaves orphans you do not
# want, extend the wipe block below.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SEED_FILE="$SCRIPT_DIR/seed.sql"

REMOTE_FLAG="--local"
if [[ "${1:-}" == "--remote" ]]; then
  REMOTE_FLAG="--remote"
fi

cd "$REPO_ROOT"

# IDs follow the seed.sql allocation scheme:
#   baseline : 01938f00-0000-7000-8000-0000000000{a|b|c}{1|2|3}
#   throwaway: 01938f01-0000-7000-8000-0000000000{1..9}{1|2|3}
USER_IDS=(
  '01938f00-0000-7000-8000-0000000000a1'
  '01938f00-0000-7000-8000-0000000000b1'
  '01938f00-0000-7000-8000-0000000000c1'
  '01938f01-0000-7000-8000-000000000011'
  '01938f01-0000-7000-8000-000000000021'
  '01938f01-0000-7000-8000-000000000031'
  '01938f01-0000-7000-8000-000000000041'
  '01938f01-0000-7000-8000-000000000051'
  '01938f01-0000-7000-8000-000000000061'
  '01938f01-0000-7000-8000-000000000071'
  '01938f01-0000-7000-8000-000000000081'
  '01938f01-0000-7000-8000-000000000091'
)

# Build a parenthesised, quoted list for SQL IN ()
join_quoted() {
  local IFS=','
  local out=""
  for id in "$@"; do
    out+="'${id}',"
  done
  echo "${out%,}"
}

USER_LIST="$(join_quoted "${USER_IDS[@]}")"

# DELETE cascades by FK in some setups but D1 does not enforce them. Delete
# child tables first. Tables not present in the schema will error — adjust
# as the schema grows.
WIPE_SQL=$(cat <<EOF
DELETE FROM directories WHERE owner_id IN (${USER_LIST});
DELETE FROM accounts WHERE user_id IN (${USER_LIST});
DELETE FROM users WHERE id IN (${USER_LIST});
EOF
)

echo "[reseed] wiping ${#USER_IDS[@]} seeded user IDs (${REMOTE_FLAG})…"
pnpm wrangler d1 execute tanstack-start-template-d1 "${REMOTE_FLAG}" --command "${WIPE_SQL}" >/dev/null

echo "[reseed] applying seed.sql…"
pnpm wrangler d1 execute tanstack-start-template-d1 "${REMOTE_FLAG}" --file "${SEED_FILE}" >/dev/null

echo "[reseed] done."
