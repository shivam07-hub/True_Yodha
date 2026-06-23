#!/usr/bin/env bash
#
# set-linkedin-secrets.sh
# Reads scripts/.env.linkedin and pushes the LinkedIn credentials to the
# GitHub repo as Actions secrets, so the linkedin-outbox-publisher workflow
# can run. Secrets stay local — they are piped straight into `gh secret set`.
#
# Prereqs:
#   - gh CLI installed and authenticated:  gh auth login
#   - scripts/.env.linkedin populated (run linkedin-auth-setup.ts first)
#
set -euo pipefail

REPO="shivam07-hub/True_Yodha"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.linkedin"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install with: brew install gh" >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "gh not authenticated. Run: gh auth login" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Run: npx tsx scripts/linkedin-auth-setup.ts" >&2
  exit 1
fi

# Load the env file
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REQUIRED=(LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET LINKEDIN_REFRESH_TOKEN LINKEDIN_ORGANIZATION_URN)
OPTIONAL=(LINKEDIN_API_VERSION)

missing=0
for k in "${REQUIRED[@]}"; do
  if [[ -z "${!k:-}" ]]; then
    echo "  - $k is empty in $ENV_FILE" >&2
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  echo "Fill the missing values, then re-run." >&2
  exit 1
fi

echo "Pushing secrets to $REPO ..."
for k in "${REQUIRED[@]}" "${OPTIONAL[@]}"; do
  v="${!k:-}"
  [[ -z "$v" ]] && continue
  printf '%s' "$v" | gh secret set "$k" --repo "$REPO" --body -
  echo "  set $k"
done

echo
echo "Done. Verify with:  gh secret list --repo $REPO"
echo "Then trigger a dry run:  gh workflow run linkedin-outbox-publisher.yml --repo $REPO"
