#!/usr/bin/env bash
# Bright Data proxy smoke test
# Confirms that a zone's credentials work and shows what exit IP/geo the proxy returns.
#
# Usage:
#   ./smoke_test.sh CUSTOMER_ID ZONE_NAME ZONE_PASSWORD [COUNTRY] [SESSION_ID]
# or via env vars:
#   BD_CUSTOMER_ID=... BD_ZONE=... BD_PASSWORD=... ./smoke_test.sh
#
# Optional:
#   COUNTRY    two-letter ISO code (us, gb, de, eu, ...)
#   SESSION_ID arbitrary string — same value returns same exit IP within the session window
#
# Exit codes:
#   0 — proxy auth worked and request returned 2xx
#   1 — argument/usage error
#   2 — proxy/network failure (auth, connect, TLS)
#   3 — got a response but it was not 2xx

set -u

CUSTOMER_ID="${1:-${BD_CUSTOMER_ID:-}}"
ZONE_NAME="${2:-${BD_ZONE:-}}"
ZONE_PASSWORD="${3:-${BD_PASSWORD:-}}"
COUNTRY="${4:-${BD_COUNTRY:-}}"
SESSION_ID="${5:-${BD_SESSION:-}}"

if [[ -z "$CUSTOMER_ID" || -z "$ZONE_NAME" || -z "$ZONE_PASSWORD" ]]; then
  cat >&2 <<EOF
usage: $0 CUSTOMER_ID ZONE_NAME ZONE_PASSWORD [COUNTRY] [SESSION_ID]
   or: BD_CUSTOMER_ID=... BD_ZONE=... BD_PASSWORD=... $0

Missing required credentials. Find them in the Bright Data control panel
under the zone's Overview tab.
EOF
  exit 1
fi

PROXY_HOST="brd.superproxy.io"
PROXY_PORT="33335"
TARGET="https://geo.brdtest.com/mygeo.json"

# Locate the CA cert. Two strategies:
#   1. Sibling assets/ directory (when this script runs from the skill folder)
#   2. BD_CA_CERT env var override
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CA_DEFAULT="$SCRIPT_DIR/../assets/brightdata_proxy_ca.crt"
CA_CERT="${BD_CA_CERT:-$CA_DEFAULT}"

# Build the username with optional targeting/session suffixes
PROXY_USER="brd-customer-${CUSTOMER_ID}-zone-${ZONE_NAME}"
[[ -n "$COUNTRY" ]]    && PROXY_USER="${PROXY_USER}-country-${COUNTRY}"
[[ -n "$SESSION_ID" ]] && PROXY_USER="${PROXY_USER}-session-${SESSION_ID}"

echo "→ proxy:    ${PROXY_HOST}:${PROXY_PORT}"
echo "→ username: ${PROXY_USER}"
echo "→ target:   ${TARGET}"
if [[ -f "$CA_CERT" ]]; then
  echo "→ ca cert:  ${CA_CERT}"
  CA_ARG=(--cacert "$CA_CERT")
else
  echo "→ ca cert:  not found at ${CA_CERT} — falling back to -k (insecure)"
  CA_ARG=(-k)
fi
echo

# Run the request, capture body + status separately
TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

HTTP_CODE="$(
  curl --silent --show-error \
       --max-time 30 \
       --proxy "${PROXY_HOST}:${PROXY_PORT}" \
       --proxy-user "${PROXY_USER}:${ZONE_PASSWORD}" \
       "${CA_ARG[@]}" \
       --output "$TMP_BODY" \
       --write-out '%{http_code}' \
       "$TARGET"
)"
CURL_EXIT=$?

if [[ $CURL_EXIT -ne 0 ]]; then
  echo "✗ curl failed with exit code $CURL_EXIT" >&2
  echo "  Common causes: bad credentials (407), unreachable host, blocked port, TLS error." >&2
  exit 2
fi

if [[ "$HTTP_CODE" != 2* ]]; then
  echo "✗ HTTP $HTTP_CODE from proxy" >&2
  cat "$TMP_BODY" >&2
  exit 3
fi

echo "✓ HTTP $HTTP_CODE"
echo

# Pretty-print if jq is around, otherwise dump raw
if command -v jq >/dev/null 2>&1; then
  jq . < "$TMP_BODY"
else
  cat "$TMP_BODY"
fi
