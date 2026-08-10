#!/usr/bin/env bash
# End-to-end smoke test for all four user types. Run against `next dev` on :3000.
set -uo pipefail
BASE=http://localhost:3000
ENVF=/Users/marlonalcantara/Repos/barbacue/barbacue/.env
ADMIN_PW=$(grep '^ADMIN_PASSWORD=' "$ENVF" | cut -d= -f2-)
BOT=$(grep '^BOT_API_TOKEN=' "$ENVF" | cut -d= -f2-)
TBL=bcd0fe42-d34c-4603-af85-d8042b369287   # active table 1
BADTBL=00000000-0000-0000-0000-000000000000
J=/tmp/e2e; mkdir -p $J
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
no(){ echo "  ❌ $1  (got: $2)"; fail=$((fail+1)); }
chk(){ [ "$2" = "$3" ] && ok "$1" || no "$1 expected=$3" "$2"; }
# helper: POST json, echo "HTTP|body"
jpost(){ curl -s -o /tmp/b -w "%{http_code}" -X POST "$1" -H 'Content-Type: application/json' ${3:-} -d "$2"; echo "|$(cat /tmp/b)"; }

echo "── A. CUSTOMER (public) ──────────────────────────"
code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/products); chk "GET /api/products 200" "$code" "200"

# Mesa QR valid → redirect mesa=ok + sets table cookie
H=$(curl -s -D - -o /dev/null --max-redirs 0 "$BASE/mesa/$TBL")
echo "$H" | grep -qi "location:.*mesa=ok" && ok "valid /mesa sets mesa=ok redirect" || no "valid /mesa redirect" "$(echo "$H"|grep -i location)"
echo "$H" | grep -qi "set-cookie: barbacue_table=" && ok "valid /mesa sets table cookie" || no "table cookie" "none"
# Mesa QR invalid → mesa=notfound, no cookie
H=$(curl -s -D - -o /dev/null --max-redirs 0 "$BASE/mesa/$BADTBL")
echo "$H" | grep -qi "location:.*mesa=notfound" && ok "invalid /mesa → notfound" || no "invalid /mesa" "$(echo "$H"|grep -i location)"
echo "$H" | grep -qi "set-cookie: barbacue_table=" && no "invalid /mesa must NOT set cookie" "cookie set" || ok "invalid /mesa sets no cookie"

# Delivery order WITH address → 201
R=$(jpost "$BASE/api/orders" '{"customerName":"Cliente Teste","customerPhone":"47999990000","deliveryAddress":"Rua A, 100, Centro","items":[{"productId":1,"qty":1}],"paymentMethod":"pix"}')
chk "delivery order w/ address → 201" "${R%%|*}" "201"
# Delivery order WITHOUT address → 422
R=$(jpost "$BASE/api/orders" '{"customerName":"Cliente Teste","customerPhone":"47999990000","items":[{"productId":1,"qty":1}],"paymentMethod":"pix"}')
chk "delivery order w/o address → 422" "${R%%|*}" "422"
echo "${R#*|}" | grep -qi "endereço" && ok "  └ message mentions endereço" || no "endereço msg" "${R#*|}"

# Dine-in order via tableToken (no address) → 201, orderType dine_in
R=$(jpost "$BASE/api/orders" "{\"customerName\":\"Mesa Cliente\",\"customerPhone\":\"47988887777\",\"tableToken\":\"$TBL\",\"orderType\":\"dine_in\",\"items\":[{\"productId\":2,\"qty\":2}],\"paymentMethod\":\"pix\"}")
chk "dine-in order (tableToken) → 201" "${R%%|*}" "201"
echo "${R#*|}" | grep -q '"orderType":"dine_in"' && ok "  └ orderType dine_in" || no "orderType" "${R#*|}"
echo "${R#*|}" | grep -q '"tableNumber":1' && ok "  └ tableNumber 1" || no "tableNumber" "${R#*|}"

# changeFor below total (cash) → 422
R=$(jpost "$BASE/api/orders" '{"customerName":"Troco Test","customerPhone":"47900001111","deliveryAddress":"Rua B, 1","items":[{"productId":2,"qty":1}],"paymentMethod":"cash","changeForCents":100}')
chk "changeFor < total → 422" "${R%%|*}" "422"

echo "── C. ADMIN vs MANAGER (security) ────────────────"
# Unauthenticated admin APIs → 401
chk "GET /api/admin/customers no-auth → 401" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/admin/customers)" "401"
chk "POST /api/admin/tables no-auth → 401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/admin/tables -H 'Content-Type: application/json' -d '{}')" "401"

# Admin login
curl -s -c $J/admin.jar -o /dev/null -X POST $BASE/api/admin/auth -H 'Content-Type: application/json' -d "{\"password\":\"$ADMIN_PW\"}"
chk "admin GET /api/admin/settings → 200" "$(curl -s -b $J/admin.jar -o /tmp/s -w '%{http_code}' $BASE/api/admin/settings)" "200"
grep -q '"pixKey"' /tmp/s && ok "  └ admin sees pixKey field" || no "admin pixKey field" "$(head -c120 /tmp/s)"

# Create a manager account (admin)
UNAME="mgr_test_$RANDOM"
R=$(curl -s -b $J/admin.jar -o /tmp/b -w '%{http_code}' -X POST $BASE/api/admin/staff -H 'Content-Type: application/json' -d "{\"name\":\"Gerente Teste\",\"username\":\"$UNAME\",\"password\":\"gerente12345\",\"role\":\"manager\"}")
[ "$R" = "201" ] || [ "$R" = "200" ] && ok "admin creates manager ($R)" || no "create manager" "$R $(cat /tmp/b)"

# Manager login
curl -s -c $J/mgr.jar -o /dev/null -X POST $BASE/api/admin/auth -H 'Content-Type: application/json' -d "{\"username\":\"$UNAME\",\"password\":\"gerente12345\"}"
chk "manager GET /api/admin/settings → 200" "$(curl -s -b $J/mgr.jar -o /tmp/m -w '%{http_code}' $BASE/api/admin/settings)" "200"
grep -q '"pixKey"' /tmp/m && no "manager must NOT see pixKey" "leaked" || ok "  └ manager pixKey redacted"
grep -q 'pixConfigured' /tmp/m && ok "  └ manager sees pixConfigured flag" || no "pixConfigured flag" "$(head -c120 /tmp/m)"
chk "manager POST /api/admin/staff → 403" "$(curl -s -o /dev/null -w '%{http_code}' -b $J/mgr.jar -X POST $BASE/api/admin/staff -H 'Content-Type: application/json' -d '{}')" "403"
chk "manager POST /api/admin/impersonate → 403" "$(curl -s -o /dev/null -w '%{http_code}' -b $J/mgr.jar -X POST $BASE/api/admin/impersonate -H 'Content-Type: application/json' -d '{}')" "403"
chk "manager POST /api/admin/tables → 201 (allowed)" "$(curl -s -o /dev/null -w '%{http_code}' -b $J/mgr.jar -X POST $BASE/api/admin/tables -H 'Content-Type: application/json' -d "{\"number\":$((RANDOM%900+100))}")" "201"

# Manager cannot change Pix (stripped): set pixKey via manager, confirm admin GET unchanged
BEFORE=$(curl -s -b $J/admin.jar $BASE/api/admin/settings | grep -o '"pixKey":[^,]*')
curl -s -b $J/mgr.jar -o /dev/null -X PATCH $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"pixKey":"HACKED-BY-MANAGER"}'
AFTER=$(curl -s -b $J/admin.jar $BASE/api/admin/settings | grep -o '"pixKey":[^,]*')
[ "$BEFORE" = "$AFTER" ] && ok "manager PATCH cannot change pixKey (stripped)" || no "pix strip" "before=$BEFORE after=$AFTER"

echo "── D. STORE CLOSED ───────────────────────────────"
curl -s -b $J/admin.jar -o /dev/null -X PATCH $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"isOpen":false}'
R=$(jpost "$BASE/api/orders" '{"customerName":"X","customerPhone":"47900000000","deliveryAddress":"Rua C, 1","items":[{"productId":1,"qty":1}],"paymentMethod":"pix"}')
chk "order while closed → 422" "${R%%|*}" "422"
echo "${R#*|}" | grep -q 'storeClosed' && ok "  └ storeClosed flag" || no "storeClosed" "${R#*|}"
curl -s -b $J/admin.jar -o /dev/null -X PATCH $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"isOpen":true}'
ok "restored isOpen=true"

echo "── B. COUPON minOrder enforcement (the bypass fix) ─"
CODE="MIN$RANDOM"
curl -s -b $J/admin.jar -o /dev/null -X POST $BASE/api/admin/coupons -H 'Content-Type: application/json' -d "{\"code\":\"$CODE\",\"discountType\":\"flat\",\"discountValue\":500,\"minOrderCents\":100000}"
# subtotal 4500 < 100000 min → coupon must be rejected at order time (422)
R=$(jpost "$BASE/api/orders" "{\"customerName\":\"Coupon Test\",\"customerPhone\":\"47900002222\",\"deliveryAddress\":\"Rua D, 1\",\"items\":[{\"productId\":1,\"qty\":1}],\"couponCode\":\"$CODE\",\"paymentMethod\":\"pix\"}")
chk "sub-min coupon on direct POST → 422" "${R%%|*}" "422"
echo "${R#*|}" | grep -qi "mínimo" && ok "  └ message mentions mínimo" || no "minimo msg" "${R#*|}"

echo "── E. LOGIN RATE LIMIT ───────────────────────────"
last=0
for i in $(seq 1 12); do
  last=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/admin/auth -H 'Content-Type: application/json' -d '{"password":"wrong-guess"}')
done
chk "brute-force login eventually → 429" "$last" "429"

echo ""
echo "════════ RESULT: $pass passed, $fail failed ════════"
