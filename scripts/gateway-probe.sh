#!/usr/bin/env bash
# Black-box checks of the running gateway. Usage: BASE=https://localhost HTTP_BASE=http://localhost ./scripts/gateway-probe.sh
# Optional: ADMIN_TOKEN=<admin access token> to also test the allowed admin path.
set -u
BASE=${BASE:-https://localhost}; HTTP_BASE=${HTTP_BASE:-http://localhost}; C="curl -sk --max-time 10"
pass=0; failn=0
ok()   { pass=$((pass+1)); echo "  ok   - $1"; }
bad()  { failn=$((failn+1)); echo "  FAIL - $1"; }
code() { $C -o /dev/null -w '%{http_code}' "$@"; }
expect() { local label=$1 want=$2; shift 2; local got; got=$(code "$@"); [ "$got" = "$want" ] && ok "$label ($got)" || bad "$label: expected $want got $got"; }
hdr() { $C -D - -o /dev/null "$@" | tr -d '\r'; }

echo "== transport =="
loc=$($C -o /dev/null -w '%{http_code} %{redirect_url}' "$HTTP_BASE/"); case "$loc" in 301*https*) ok "HTTP redirects to HTTPS ($loc)";; *) bad "no https redirect: $loc";; esac

echo "== security headers (HTML) =="
H=$(hdr "$BASE/")
for h in strict-transport-security content-security-policy x-content-type-options x-frame-options referrer-policy permissions-policy cross-origin-opener-policy; do echo "$H" | grep -qi "^$h:" && ok "header $h" || bad "missing header $h"; done
echo "$H" | grep -i '^content-security-policy' | grep -q "script-src 'self'" && ok "CSP script-src 'self' (no unsafe-inline/eval)" || bad "CSP script-src"
echo "$H" | grep -i '^content-security-policy' | grep -Eq "unsafe-eval|script-src[^;]*unsafe-inline" && bad "CSP allows unsafe script" || ok "CSP has no unsafe script sources"
echo "$H" | grep -i '^content-security-policy' | grep -q "frame-ancestors 'none'" && ok "CSP frame-ancestors none" || bad "CSP frame-ancestors"
echo "$H" | grep -Eqi '^server: nginx/[0-9]' && bad "server version disclosed" || ok "no server version disclosure"
echo "$H" | grep -qi '^x-powered-by' && bad "X-Powered-By present" || ok "no X-Powered-By"

echo "== API headers =="
A=$(hdr "$BASE/api/items/stats")
[ "$(echo "$A" | grep -ci '^strict-transport-security')" = 1 ] && ok "HSTS sent exactly once on API" || bad "HSTS duplicated/missing on API"
echo "$A" | grep -qi '^cache-control: no-store' && ok "API responses are no-store" || bad "API cache-control"
echo "$A" | grep -qi '^x-powered-by' && bad "API X-Powered-By" || ok "API hides X-Powered-By"

echo "== blocked paths =="
expect "matching service is not routed" 404 "$BASE/api/matching/internal/matches"
expect "internal routes hidden" 404 "$BASE/api/items/internal/users/1"
expect "gateway-verify hidden" 404 "$BASE/api/auth/internal/gateway-verify"
expect "top-level /internal hidden" 404 "$BASE/internal/x"
expect "dotfiles hidden" 404 "$BASE/.env"
expect "dot dirs hidden" 404 "$BASE/.git/config"
expect "source maps hidden" 404 "$BASE/assets/app.js.map"
expect "backup files hidden" 404 "$BASE/index.html.bak"
expect "unknown api service" 404 "$BASE/api/unknown/x"
expect "bare /api" 404 "$BASE/api"

echo "== authentication + admin pre-check =="
expect "admin route without token" 401 "$BASE/api/items/admin/items"
expect "admin route with garbage token" 401 -H 'Authorization: Bearer abc.def.ghi' "$BASE/api/claims/admin/audit"
EM="probe$RANDOM$RANDOM@example.com"
R=$($C -D /tmp/probe.hdr -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -H 'X-Requested-With: findit' -d "{\"name\":\"Probe User\",\"email\":\"$EM\",\"password\":\"Correct-Horse-Battery-9\"}")
TOKEN=$(echo "$R" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] && ok "register through gateway" || bad "register failed: $R"
CK=$(grep -i '^set-cookie' /tmp/probe.hdr | tr -d '\r')
echo "$CK" | grep -qi 'httponly' && echo "$CK" | grep -qi 'secure' && echo "$CK" | grep -qi 'samesite=strict' && echo "$CK" | grep -qi 'path=/api/auth' && ok "refresh cookie: HttpOnly; Secure; SameSite=Strict; Path=/api/auth" || bad "cookie flags: $CK"
expect "admin route with a normal user's token" 403 -H "Authorization: Bearer $TOKEN" "$BASE/api/items/admin/items"
expect "normal user cannot reach auth admin" 403 -H "Authorization: Bearer $TOKEN" "$BASE/api/auth/admin/users"
[ -n "${ADMIN_TOKEN:-}" ] && expect "admin route with admin token" 200 -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE/api/auth/admin/users"
expect "protected route without token" 401 "$BASE/api/claims/mine"
expect "refresh without CSRF header" 403 -X POST "$BASE/api/auth/refresh"

echo "== CORS / CSRF / input limits =="
expect "foreign Origin on POST is rejected" 403 -X POST -H 'Origin: https://evil.test' -H 'Content-Type: application/json' -d '{"email":"a@b.co","password":"x"}' "$BASE/api/auth/login"
P=$(hdr -X OPTIONS -H 'Origin: https://evil.test' -H 'Access-Control-Request-Method: POST' "$BASE/api/auth/login")
echo "$P" | grep -qi '^access-control-allow-origin' && bad "CORS preflight allowed for evil origin" || ok "no CORS allow-origin for foreign origin"
big=$(head -c 70000 /dev/zero | tr '\0' 'a')
expect "oversized body rejected (413)" 413 -X POST -H 'Content-Type: application/json' -d "{\"email\":\"$big\"}" "$BASE/api/auth/login"
expect "NoSQL operator payload rejected" 400 -X POST -H 'Content-Type: application/json' -d '{"email":{"$ne":null},"password":{"$ne":null}}' "$BASE/api/auth/login"
expect "malformed JSON rejected" 400 -X POST -H 'Content-Type: application/json' -d '{bad' "$BASE/api/auth/login"
B=$($C -X POST -H 'Content-Type: application/json' -d '{bad' "$BASE/api/auth/login"); echo "$B" | grep -Eq 'at .*\.js|stack|node_modules' && bad "stack trace leaked" || ok "no stack trace in error body"

echo "== rate limiting =="
n429=0; for i in $(seq 1 40); do c=$(code -X POST -H 'Content-Type: application/json' -d '{"email":"nobody@example.com","password":"wrong-password"}' "$BASE/api/auth/login"); [ "$c" = 429 ] && n429=$((n429+1)); done
[ "$n429" -gt 0 ] && ok "login flood throttled ($n429/40 got 429)" || bad "no rate limiting observed on /api/auth/login"

echo; echo "passed=$pass failed=$failn"; [ "$failn" = 0 ]
