#!/usr/bin/env bash
set -euo pipefail
umask 077
test "$(hostname)" = otherpages
backup=/root/deploy-backups/barbacue-routing-20261120
web=/root/barbacue/apps/web
active="$web/server.js"
target="$web/.next-routing-prod-20261120"
expected_old=l8b7MubAPUPq8HqSE_A0m
exec 9>/root/barbacue-release-checks/archive-release.lock
flock -n 9
test -s "$backup/preview-result.json"
jq -e '.historicalPdfUnchanged and .e2e.syntheticOrders == 2 and .e2e.automatic == false' "$backup/preview-result.json" >/dev/null
test "$(cat "$target/BUILD_ID")" = "$(cat "$backup/candidate-v2/.next-routing-prod-20261120/BUILD_ID")"
node /root/barbacue-release-checks/verify-dashboard-logos.mjs "$target"
old_dist=$(grep -oE '\.next[-a-zA-Z0-9]+' "$active" | sort -u)
test "$(cat "$web/$old_dist/BUILD_ID")" = "$expected_old"
cmp -s "$active" "$backup/server.before.js"
old_pid=$(pm2 pid barbacue)
bot_pid=$(pm2 pid barbacue-whatsapp)
test "$old_pid" -gt 0
test "$bot_pid" -gt 0
pm2 jlist | jq -e '[.[] | select(.name == "barbacue" or .name == "barbacue-whatsapp")] | length == 2 and all(.pm2_env.status == "online")' >/dev/null
curl -fsS 'http://127.0.0.1:18966/status?format=json' | jq -e '.status == 0' >/dev/null
curl -fsS 'http://127.0.0.1:18965/table/v1/driving/-49.0747559,-26.4915129;-49.0899599,-26.5042904?annotations=duration,distance' | jq -e '.code=="Ok" and .durations[0][1]>0' >/dev/null

runuser -u postgres -- pg_dump -Fc --dbname=barbacue >"$backup/database-prepublication.dump.part"
pg_restore --list "$backup/database-prepublication.dump.part" >"$backup/database-prepublication.list"
mv "$backup/database-prepublication.dump.part" "$backup/database-prepublication.dump"
if [ -f /root/.pm2/dump.pm2 ]; then cp -p /root/.pm2/dump.pm2 "$backup/dump.pm2.before"; fi
test "$old_pid" = "$(pm2 pid barbacue)"
test "$bot_pid" = "$(pm2 pid barbacue-whatsapp)"
cmp -s "$active" "$backup/server.before.js"

psql=(runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 -d barbacue)
if [ "$("${psql[@]}" -Atc "select to_regclass('dispatch_routes') is null")" = t ]; then
  { printf "%s\n" 'BEGIN;' 'SET LOCAL ROLE barbacue;' "SET LOCAL lock_timeout = '5s';" "SET LOCAL statement_timeout = '30s';";
    cat "$backup/migration.sql";
    printf '%s\n' 'COMMIT;';
  } | "${psql[@]}" | tee "$backup/migration-production.log"
fi
"${psql[@]}" -Atc "select enabled=false and provider='osm' and origin_latitude=-26.4915129 and origin_longitude=-49.0747559 from delivery_settings where id=1; select config->>'automatic'='false' from dispatch_settings where id=1" |
  diff - <(printf 't\nt\n')
test "$old_pid" = "$(pm2 pid barbacue)"
test "$bot_pid" = "$(pm2 pid barbacue-whatsapp)"
cmp -s "$active" "$backup/server.before.js"

swap=0
rollback() {
  code=$?
  if [ "$code" -ne 0 ] && [ "$swap" -eq 1 ]; then
    install -m 0644 "$backup/server.before.js" "$web/server.rollback-routing.js"
    mv "$web/server.rollback-routing.js" "$active"
    pm2 restart barbacue >/dev/null
    printf '%s\n' 'Runtime anterior restaurado; migração aditiva e backup preservados.' >&2
  fi
}
trap rollback EXIT
install -m 0644 "$backup/server.candidate.js" "$web/server.next-routing.js"
mv "$web/server.next-routing.js" "$active"
swap=1
DELIVERY_OSRM_URL=http://127.0.0.1:18965 \
DELIVERY_NOMINATIM_URL=http://127.0.0.1:18966 \
DELIVERY_NOMINATIM_MIN_INTERVAL_MS=50 \
DELIVERY_OSM_USER_AGENT=BarbacueDelivery/1.0 \
DELIVERY_CNEFE_INDEX_PATH=/root/barbacue-routing-staging/cnefe/address-index.json \
  pm2 restart barbacue --update-env >/dev/null

for attempt in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3007/api/store-status >/dev/null 2>&1; then break; fi
  sleep 1
done
node "$backup/verify-release.cjs" production
test "$(pm2 pid barbacue)" -gt 0
test "$(pm2 pid barbacue)" != "$old_pid"
test "$(pm2 pid barbacue-whatsapp)" = "$bot_pid"
curl -fsS --max-time 15 https://barbacue.cog.ia.br/api/store-status | jq -e 'has("open")' >/dev/null
pm2 save >/dev/null
swap=0
printf 'Build ativo %s\n' "$(cat "$target/BUILD_ID")"
