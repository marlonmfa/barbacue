#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${ROUTING_DATA_DIR:?Configure ROUTING_DATA_DIR para um novo diretório absoluto}"
case "$ROUTING_DATA_DIR" in
  /*) ;;
  *) echo "ROUTING_DATA_DIR deve ser absoluto." >&2; exit 2 ;;
esac
source_url=${ROUTING_PBF_URL:-https://download.geofabrik.de/south-america/brazil/sul/sul-latest.osm.pbf}
case "$source_url" in
  https://download.geofabrik.de/south-america/brazil/sul/*.osm.pbf) ;;
  *) echo "Use um extrato Sul do Geofabrik via HTTPS." >&2; exit 2 ;;
esac
routing_dir=$(cd -- "$(dirname -- "$0")" && pwd)
compose=(docker compose -f "$routing_dir/compose.yml")

# Cada versão usa seu próprio diretório. Nunca substitua dados montados no OSRM.
mkdir -- "$ROUTING_DATA_DIR"
curl -fLSs --retry 3 "$source_url" -o "$ROUTING_DATA_DIR/sul.osm.pbf"
printf '%s\n' "$source_url" > "$ROUTING_DATA_DIR/source-url"
sha256sum "$ROUTING_DATA_DIR/sul.osm.pbf" > "$ROUTING_DATA_DIR/source.sha256"
"${compose[@]}" build extract osrm
"${compose[@]}" run --rm -T --interactive=false extract extract --strategy smart \
  --bbox=-49.35,-26.73,-48.91,-26.31 \
  --output=/data/jaragua.osm.pbf /data/sul.osm.pbf
chmod 644 "$ROUTING_DATA_DIR/jaragua.osm.pbf"
osrm=(docker run --rm --network none --cpus 2 --memory 2g -v "$ROUTING_DATA_DIR:/data" barbacue-routing-osrm:6.0.0)
"${osrm[@]}" osrm-extract --threads 2 -p /opt/car.lua /data/jaragua.osm.pbf
"${osrm[@]}" osrm-partition --threads 2 /data/jaragua.osrm
"${osrm[@]}" osrm-customize --threads 2 /data/jaragua.osrm
touch "$ROUTING_DATA_DIR/prepared"
