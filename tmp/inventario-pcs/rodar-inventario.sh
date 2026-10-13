#!/bin/zsh
# Aguarda cada PC voltar a rede COG (via salto pelo hirable) e roda o inventario.
# Uso: ./rodar-inventario.sh [horas_max=24]
DIR=${0:A:h}; OUT="$DIR/resultados"; mkdir -p "$OUT"
MAX=$(( ${1:-24} * 3600 )); START=$(date +%s)
typeset -A IP=(marlondell 10.66.0.28 barbadog 10.66.0.29 w11-pc 10.66.0.30)
SSHO=(-o BatchMode=yes -o ConnectTimeout=12 -J hirable)
pending=(marlondell barbadog w11-pc); echo "$(date "+%F %T") vigia iniciado" >> "$OUT/execucao.log"
log() { echo "$(date '+%F %T') $*" | tee -a "$OUT/execucao.log"; }
while (( ${#pending} )) && (( $(date +%s) - START < MAX )); do
  for h in $pending; do
    if ssh -o BatchMode=yes -o ConnectTimeout=8 hirable "timeout 5 bash -c '</dev/tcp/${IP[$h]}/22'" 2>/dev/null; then
      log "$h online, rodando inventario"
      if scp -q $SSHO "$DIR/Inventario-PC.ps1" "$h:inventario-cog.ps1" 2>>"$OUT/execucao.log" &&
         ssh $SSHO "$h" 'powershell -NoProfile -ExecutionPolicy Bypass -File inventario-cog.ps1 & del inventario-cog.ps1' > "$OUT/$h.txt" 2>>"$OUT/execucao.log"; then
        log "$h concluido ($(wc -l < "$OUT/$h.txt") linhas)"; pending=(${pending:#$h})
      else log "$h falhou, tentara de novo"; fi
    fi
  done
  (( ${#pending} )) && sleep 120
done
(( ${#pending} )) && log "sem resposta: $pending" || log "todos concluidos"
