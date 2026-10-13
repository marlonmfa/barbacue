#!/usr/bin/env bash
set -Eeuo pipefail
backup=/root/deploy-backups/barbacue-erp-20260920
candidate=/root/barbacue-next-erp-20260920
previous=/root/barbacue-before-erp-20260920
node -e 'if(!require("/root/deploy-backups/barbacue-erp-20260920/preflight.json").success)process.exit(1)'
test ! -e "$previous"
test -f "$candidate/apps/web/.next-erp-release-20260920/BUILD_ID"
rollback() {
 trap - ERR
 pm2 stop barbacue >/dev/null 2>&1 || true
 if [ -d "$previous" ]; then
  if [ -d /root/barbacue ]; then mv /root/barbacue /root/barbacue-failed-erp-20260920; fi
  mv "$previous" /root/barbacue
 fi
 pm2 restart barbacue >/dev/null
 echo 'Activation failed; previous release restored.'
 exit 1
}
trap rollback ERR
kill -TERM "$(cat "$backup/candidate.pid")"
pm2 stop barbacue >/dev/null
mv /root/barbacue "$previous"
mv "$candidate" /root/barbacue
pm2 restart barbacue >/dev/null
ready=0
for attempt in $(seq 1 30); do
 public=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 -H 'Host: barbacue.cog.ia.br' http://127.0.0.1:3007/api/settings || true)
 denied=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3007/api/admin/erp || true)
 if [ "$public" = 200 ] && [ "$denied" = 401 ]; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
pm2 save >/dev/null
trap - ERR
cat /root/barbacue/apps/web/.next-erp-release-20260920/BUILD_ID
printf '\nERP release activated.\n'
