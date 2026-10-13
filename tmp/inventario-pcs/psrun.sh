#!/bin/zsh
# Uso: ./psrun.sh <host> <arquivo.ps1 | -c 'comando'>  -> roda PowerShell remoto via -EncodedCommand (sem problemas de aspas)
h=$1; shift
if [[ $1 == -c ]]; then code=$2; else code=$(cat "$1"); fi
enc=$(printf '%s' "\$ProgressPreference='SilentlyContinue'; try{[Console]::OutputEncoding=[Text.Encoding]::UTF8}catch{}; $code" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')
ssh -o BatchMode=yes -o ConnectTimeout=12 -J hirable "$h" "powershell -NoProfile -NonInteractive -EncodedCommand $enc" 2>&1 | grep -v '^Pseudo-terminal' | tr -d '\r'
