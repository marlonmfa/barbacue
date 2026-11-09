#!/usr/bin/env bash
# Publica as operações iFood de 09/11/2026: web (backup + migrations 0027/0030 + candidata + troca)
# e depois o monitor com a imagem que grava os eventos (disputas, código de entrega).
# Reversão do monitor: cp backups/compose.prod.yml.before-events-20261109 compose.prod.yml && docker compose -f compose.prod.yml up -d monitor
set -euo pipefail
cd /srv/barbacue-unified-20261106
export BK_NAME=backup-ifood-20261109 EXTRA_MIGRATIONS=0027_anota_webhook_inbox.sql,0030_ifood_order_events.sql
if [ "$(cat /root/barbacue/apps/web/.next-mobile-session-20261024/BUILD_ID)" = "$(cat context/apps/web/.next-mobile-session-20261024/BUILD_ID)" ]; then
  echo "Web já publicada ($(cat context/apps/web/.next-mobile-session-20261024/BUILD_ID)); pulando a troca."
else
  python3 publish.py prepare
  python3 publish.py swap
fi
cd /root/barbacue-ifood
docker image inspect barbacue-ifood:events-20261109 >/dev/null
cp -n compose.prod.yml backups/compose.prod.yml.before-events-20261109
sed -i 's#image: barbacue-ifood:20261018#image: barbacue-ifood:events-20261109#' compose.prod.yml
if docker ps --format '{{.Image}}' | grep -qx barbacue-ifood:events-20261109; then echo 'Monitor já na imagem nova.'; else docker compose -f compose.prod.yml up -d monitor; sleep 75; fi
docker ps --format '{{.Names}} {{.Status}}' | grep ifood
docker logs --since 3m barbacue-ifood-monitor-1 2>&1 | grep -v -i -E 'token|secret' | tail -n 8
echo OK
