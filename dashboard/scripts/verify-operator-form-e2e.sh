#!/usr/bin/env bash
# Reusable live E2E for the real /operator password form.
# Reads the canonical token from the protected local inventory; never accepts or prints it.

set -euo pipefail
set +x
umask 077

SECRET_FILE="${OPENCLAW_SECRET_FILE:-$HOME/.sj-agent-harness/secrets/openclaw-auto.env}"
SECRET_DIR="$(dirname "$SECRET_FILE")"
BASE_URL="${OSMU_BASE_URL:-https://openclaw.sj-onpremise-cloudflare-tunnel.cloud}"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/osmu-operator-form.XXXXXX")"
export BROWSE_STATE_FILE="$TMP_ROOT/gstack/browse.json"

TOKEN=""
B=""

cleanup() {
  TOKEN=""
  unset TOKEN
  if [ -n "$B" ]; then
    "$B" stop >/dev/null 2>&1 || true
  fi
  case "$TMP_ROOT" in
    "${TMPDIR:-/tmp}/osmu-operator-form."*) rm -rf -- "$TMP_ROOT" ;;
    *) printf 'ERROR: refusing to remove unexpected temp path\n' >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

fail() {
  printf 'ERROR: operator form E2E: %s\n' "$*" >&2
  exit 1
}

read_canonical_token() {
  local line=""
  local value=""
  local matches=0

  [ -f "$SECRET_FILE" ] || fail "secret inventory is missing"
  [ -r "$SECRET_FILE" ] || fail "secret inventory is unreadable"
  [ ! -L "$SECRET_FILE" ] || fail "secret inventory must not be a symlink"
  if stat -f '%Lp' "$SECRET_FILE" >/dev/null 2>&1; then
    [ "$(stat -f '%Lp' "$SECRET_DIR")" = "700" ] ||
      fail "secret inventory directory permissions must be 700"
    [ "$(stat -f '%u' "$SECRET_DIR")" = "$(id -u)" ] ||
      fail "secret inventory directory must be owned by the current user"
    [ "$(stat -f '%Lp' "$SECRET_FILE")" = "600" ] ||
      fail "secret inventory permissions must be 600"
    [ "$(stat -f '%u' "$SECRET_FILE")" = "$(id -u)" ] ||
      fail "secret inventory must be owned by the current user"
  else
    [ "$(stat -c '%a' "$SECRET_DIR")" = "700" ] ||
      fail "secret inventory directory permissions must be 700"
    [ "$(stat -c '%u' "$SECRET_DIR")" = "$(id -u)" ] ||
      fail "secret inventory directory must be owned by the current user"
    [ "$(stat -c '%a' "$SECRET_FILE")" = "600" ] ||
      fail "secret inventory permissions must be 600"
    [ "$(stat -c '%u' "$SECRET_FILE")" = "$(id -u)" ] ||
      fail "secret inventory must be owned by the current user"
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      DASHBOARD_AUTH_TOKEN=*)
        matches=$((matches + 1))
        value="${line#*=}"
        ;;
    esac
  done < "$SECRET_FILE"

  [ "$matches" -eq 1 ] || fail "DASHBOARD_AUTH_TOKEN must appear exactly once"
  [ -n "$value" ] || fail "DASHBOARD_AUTH_TOKEN is empty"
  TOKEN="$value"
}

if command -v browse >/dev/null 2>&1; then
  B="$(command -v browse)"
elif [ -x "$HOME/.claude/skills/gstack/browse/dist/browse" ]; then
  B="$HOME/.claude/skills/gstack/browse/dist/browse"
elif [ -x "$(git rev-parse --show-toplevel 2>/dev/null || true)/.claude/skills/gstack/browse/dist/browse" ]; then
  B="$(git rev-parse --show-toplevel)/.claude/skills/gstack/browse/dist/browse"
else
  fail "gstack browse binary not found"
fi
command -v jq >/dev/null 2>&1 || fail "jq binary not found"

read_canonical_token

# Enter the origin once, clear both storage scopes, then reset capture buffers so the
# pass/fail window contains only the actual form submission flow.
"$B" goto "${BASE_URL%/}/operator" >/dev/null
"$B" js "localStorage.clear(); sessionStorage.clear(); 'storage-cleared'" >/dev/null
"$B" console --clear >/dev/null
"$B" network --clear >/dev/null
"$B" goto "${BASE_URL%/}/operator" >/dev/null

TOKEN_JSON="$(printf '%s' "$TOKEN" | jq -Rs .)"
{
  printf '%s\n' \
    'const input = document.querySelector("input[type=password]");' \
    'if (!input) throw new Error("operator token input missing");' \
    'const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;'
  printf 'setter.call(input, %s);\n' "$TOKEN_JSON"
  printf '%s\n' \
    'input.dispatchEvent(new Event("input", { bubbles: true }));' \
    'input.dispatchEvent(new Event("change", { bubbles: true }));' \
    'const button = Array.from(document.querySelectorAll("button")).find((el) => el.textContent.includes("접속"));' \
    'if (!button) throw new Error("operator submit button missing");' \
    'button.click();' \
    '"submitted";'
} > "$TMP_ROOT/fill-and-submit.js"
unset TOKEN_JSON

"$B" eval "$TMP_ROOT/fill-and-submit.js" >/dev/null

FINAL_URL=""
for _ in $(seq 1 30); do
  FINAL_URL="$("$B" url)"
  case "$FINAL_URL" in
    "${BASE_URL%/}/operator/customers"*) break ;;
  esac
  sleep 1
done
case "$FINAL_URL" in
  "${BASE_URL%/}/operator/customers"*) ;;
  *) fail "did not reach /operator/customers" ;;
esac
"$B" wait --networkidle >/dev/null

RENDER_OK="$(
  "$B" js \
    "document.body.innerText.includes('운영자') && document.body.innerText.includes('고객 관리')"
)"
[ "$RENDER_OK" = "true" ] || fail "operator/customer-management shell did not render"

INVALID_PRESENT="$(
  "$B" js \
    "document.body.innerText.includes('운영자 토큰이 유효하지') || document.body.innerText.includes('이 토큰은 운영자 모드가 아닙니다')"
)"
[ "$INVALID_PRESENT" = "false" ] || fail "invalid-token copy is visible"

NETWORK_LOG="$("$B" network)"
# Reject HTTP 400-599 (4xx/5xx) observed during the form submission flow.
BAD_RESPONSES="$(
  printf '%s\n' "$NETWORK_LOG" |
    awk '/→ [45][0-9][0-9] / { count += 1 } END { print count + 0 }'
)"
[ "$BAD_RESPONSES" = "0" ] ||
  fail "observed $BAD_RESPONSES HTTP 4xx/5xx responses"

CONSOLE_LOG="$("$B" console --errors)"
CONSOLE_ERRORS="$(
  printf '%s\n' "$CONSOLE_LOG" |
    awk '/\[error\]/ { count += 1 } END { print count + 0 }'
)"
[ "$CONSOLE_ERRORS" = "0" ] ||
  fail "observed $CONSOLE_ERRORS browser console errors"

printf '[operator-form-e2e] PASS url=/operator/customers operator=yes customers=yes invalid=0 bad-http=0 console-errors=0\n'
