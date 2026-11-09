#!/usr/bin/env bash
# Liga o monitor Anota AI do Barbacue (pedidos no painel + status de volta para a Anota AI).
# Uso: ssh vps-otherpages /root/barbacue-anotaai/run-anotaai-20261109.sh
#   Opcional: CHELAS_PAGE=<24 hex> BARBADOG_PAGE=<24 hex> antes do comando para incluir essas lojas.
# Credenciais de parceiro: as do Food COG (/opt/cogfood/.env), com OK do Marlon em 09/11. Nada é impresso.
# Pedidos anteriores ao início (ANOTAAI_IMPORT_SINCE) não entram, então nada antigo vai para a cozinha.
# Parar: cd /root/barbacue-anotaai && docker compose -f compose.prod.yml down
set -euo pipefail
umask 077
cd /root/barbacue-anotaai
docker image inspect barbacue-anotaai:20261109 >/dev/null
cp build-20261109/packages/anotaai/compose.prod.yml compose.prod.yml
DB=$(python3 -c 'import json;print([a for a in json.load(open("/root/.pm2/dump.pm2")) if a.get("name")=="barbacue"][0]["DATABASE_URL"])')
mkdir -p backups && pg_dump --format=custom --no-owner --file "backups/barbacue-before-anotaai-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DB"
PAGES='[{"pageId":"6695aa65af020700192a0885","brand":"barbacue","name":"Barbacue"}'
[ -n "${CHELAS_PAGE:-}" ] && PAGES="$PAGES,{\"pageId\":\"$CHELAS_PAGE\",\"brand\":\"chelas\",\"name\":\"Chelas\"}"
[ -n "${BARBADOG_PAGE:-}" ] && PAGES="$PAGES,{\"pageId\":\"$BARBADOG_PAGE\",\"brand\":\"barbadog\",\"name\":\"Barbadog\"}"
PAGES="$PAGES]"
SINCE=$(grep -s '^ANOTAAI_IMPORT_SINCE=' .env | cut -d= -f2- || true)
[ -n "$SINCE" ] || SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "DATABASE_URL=$DB"
  grep -E '^ANOTAAI_CLIENT_(ID|SECRET)=' /opt/cogfood/.env
  echo "ANOTAAI_PAGES_JSON=$PAGES"
  echo "ANOTAAI_IMPORT_SINCE=$SINCE"
  echo "ANOTAAI_POLL_INTERVAL_MS=60000"
  echo "ANOTAAI_ACTIONS=on"
  echo "ANOTAAI_DRY_RUN=false"
} > .env.new
[ "$(grep -c '^ANOTAAI_CLIENT_' .env.new)" = 2 ] || { echo "Credenciais do Food COG não encontradas"; rm -f .env.new; exit 1; }
mv .env.new .env
ANOTAAI_IMAGE_TAG=20261109 docker compose -f compose.prod.yml up -d
sleep 100
docker ps --format '{{.Names}} {{.Status}}' | grep anotaai
docker logs --since 3m barbacue-anotaai-monitor-1 2>&1 | grep -v -i -E 'token|secret|bearer' | tail -n 10
echo "Lojas: $PAGES"; echo "Corte: $SINCE"; echo OK
