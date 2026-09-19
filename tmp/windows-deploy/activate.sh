set -eu
backup=/root/deploy-backups/barbacue-20260910T142106Z
candidate=/root/barbacue-next-20260910T142106Z
previous=/root/barbacue-before-20260910T142106Z
node -e 'const x=require("/root/deploy-backups/barbacue-20260910T142106Z/preflight.json");if(!x.success)process.exit(1)'
test -d "$candidate/apps/web/.next"
test ! -e "$previous"
kill -TERM "$(cat "$backup/candidate.pid")"
mv /root/barbacue "$previous"
if ! mv "$candidate" /root/barbacue; then mv "$previous" /root/barbacue; exit 1; fi
rollback() {
  mv /root/barbacue /root/barbacue-failed-20260910T142106Z
  mv "$previous" /root/barbacue
  pm2 restart barbacue >/dev/null
  printf 'Nova versão revertida; publicação não concluída.\n'
  exit 1
}
if ! pm2 restart barbacue >/dev/null; then rollback; fi
ready=0
for attempt in $(seq 1 30); do
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 -H 'Host: barbacue.cog.ia.br' http://127.0.0.1:3007/ || true)
  denied=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3007/api/admin/downloads/windows || true)
  if [ "$status" = 200 ] && [ "$denied" = 401 ]; then ready=1; break; fi
  sleep 1
done
if [ "$ready" != 1 ]; then rollback; fi
pm2 save >/dev/null
printf 'Publicação ativada; página pública 200 e download sem sessão 401.\n'
cat /root/barbacue/apps/web/.next/BUILD_ID
