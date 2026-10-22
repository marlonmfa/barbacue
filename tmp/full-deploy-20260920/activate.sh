set -eu
backup=/root/deploy-backups/barbacue-full-20260920
candidate=/root/barbacue-next-full-20260920
previous=/root/barbacue-before-full-20260920
node -e 'if(!require("/root/deploy-backups/barbacue-full-20260920/preflight.json").success)process.exit(1)'
test -f "$candidate/apps/web/.next-release-20260920/BUILD_ID"
test ! -e "$previous"
kill -TERM "$(cat "$backup/candidate.pid")"
mv /root/barbacue "$previous"
if ! mv "$candidate" /root/barbacue; then mv "$previous" /root/barbacue; exit 1; fi
rollback() {
 cp "$backup/nginx-brand-snippet.conf" /etc/nginx/snippets/barbacue-brand-icons.conf
 nginx -t >/dev/null 2>&1 && systemctl reload nginx
 mv /root/barbacue /root/barbacue-failed-full-20260920
 mv "$previous" /root/barbacue
 pm2 restart barbacue >/dev/null
 echo 'Release rolled back'; exit 1
}
if ! pm2 restart barbacue >/dev/null; then rollback; fi
ready=0
for attempt in $(seq 1 30); do
 status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 -H 'Host: barbacue.cog.ia.br' http://127.0.0.1:3007/atendimento/chelas || true)
 denied=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:3007/api/admin/downloads/windows || true)
 if [ "$status" = 200 ] && [ "$denied" = 401 ]; then ready=1; break; fi
 sleep 1
done
if [ "$ready" != 1 ]; then rollback; fi
python3 - <<'PY'
from pathlib import Path
p=Path('/etc/nginx/snippets/barbacue-brand-icons.conf')
s='\n'.join(line for line in p.read_text().splitlines() if not line.startswith('sub_filter'))+'\n'
s+='''location = /api/transcribe {
 client_max_body_size 21m;
 proxy_pass http://127.0.0.1:3007;
 proxy_http_version 1.1;
 proxy_set_header Host $host;
 proxy_set_header X-Real-IP $remote_addr;
 proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 proxy_set_header X-Forwarded-Proto $scheme;
 proxy_read_timeout 75s;
}
'''
p.write_text(s)
PY
if ! nginx -t > "$backup/nginx-test.log" 2>&1; then rollback; fi
if ! systemctl reload nginx; then rollback; fi
pm2 save >/dev/null
cat /root/barbacue/apps/web/.next-release-20260920/BUILD_ID
printf '\nFull release activated\n'
