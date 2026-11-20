#!/usr/bin/env bash
set -euo pipefail
umask 077
test "$(hostname)" = otherpages
b=/root/deploy-backups/barbacue-routing-20261120
web=/root/barbacue/apps/web
d=.next-routing-prod-20261120-r2
old=.next-routing-prod-20261120
exec 9>/root/barbacue-release-checks/archive-release.lock
flock -n 9
grep -Fq "${old}\"" "$web/server.js"
test "$(cat "$web/$old/BUILD_ID")" = GVDXitSeYZ2MU8CwSirU6
node /root/barbacue-release-checks/verify-dashboard-logos.mjs "$b/candidate-theme/$d"
diff <(jq -r 'keys[]' "$web/$old/server/app-paths-manifest.json") \
     <(jq -r 'keys[]' "$b/candidate-theme/$d/server/app-paths-manifest.json")
old_pid=$(pm2 pid barbacue)
bot_pid=$(pm2 pid barbacue-whatsapp)
test "$old_pid" -gt 0
test "$bot_pid" -gt 0
test ! -e "$web/$d"
cp -a "$b/candidate-theme/$d" "$web/$d"
node /root/barbacue-release-checks/verify-dashboard-logos.mjs "$web/$d"
cp -p "$web/server.js" "$b/server.routing-v1.js"
test "$old_pid" = "$(pm2 pid barbacue)"
test "$bot_pid" = "$(pm2 pid barbacue-whatsapp)"
swap=0
rollback() {
  code=$?
  if [ "$code" -ne 0 ] && [ "$swap" -eq 1 ]; then
    install -m 0644 "$b/server.routing-v1.js" "$web/server.rollback-routing.js"
    mv "$web/server.rollback-routing.js" "$web/server.js"
    pm2 restart barbacue >/dev/null
    printf '%s\n' 'Runtime anterior restaurado.' >&2
  fi
}
trap rollback EXIT
install -m 0644 "$b/server.theme.js" "$web/server.next-routing.js"
mv "$web/server.next-routing.js" "$web/server.js"
swap=1
pm2 restart barbacue >/dev/null
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3007/api/store-status >/dev/null 2>&1; then break; fi
  sleep 1
done
ROUTING_RELEASE_DIST="$d" node "$b/verify-release.cjs" production
test "$(pm2 pid barbacue)" -gt 0
test "$(pm2 pid barbacue)" != "$old_pid"
test "$(pm2 pid barbacue-whatsapp)" = "$bot_pid"
curl -fsS --max-time 15 https://barbacue.cog.ia.br/api/store-status | jq -e 'has("open")' >/dev/null
pm2 save >/dev/null
swap=0
printf 'Build ativo %s\n' "$(cat "$web/$d/BUILD_ID")"
