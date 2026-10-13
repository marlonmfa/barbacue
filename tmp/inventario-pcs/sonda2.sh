#!/bin/zsh
cd ${0:A:h}
for h in marlondell barbadog w11-pc; do (
  ssh -o BatchMode=yes -J hirable $h 'powershell -NoProfile -Command "[Console]::In.ReadToEnd() | Set-Content -Encoding UTF8 $env:USERPROFILE\sonda2-cog.ps1"' < Sonda2.ps1 &&
  ssh -o BatchMode=yes -J hirable $h 'powershell -NoProfile -ExecutionPolicy Bypass -File sonda2-cog.ps1 & del sonda2-cog.ps1' > resultados/sonda2-$h.txt 2>&1
  echo "$h sonda2 fim $?" >> resultados/sonda.log ) & done; wait
