#!/bin/zsh
cd ${0:A:h}
for h in marlondell barbadog w11-pc; do (
  ssh -o BatchMode=yes -J hirable $h 'powershell -NoProfile -Command "[Console]::In.ReadToEnd() | Set-Content -Encoding UTF8 $env:USERPROFILE\sonda-cog.ps1"' < Sonda-Impressoras-iFood.ps1 &&
  ssh -o BatchMode=yes -J hirable $h 'powershell -NoProfile -ExecutionPolicy Bypass -File sonda-cog.ps1 & del sonda-cog.ps1' > resultados/sonda-$h.txt 2>&1
  echo "$h fim $?" >> resultados/sonda.log ) & done; wait
