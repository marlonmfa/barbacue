#!/usr/bin/env bash
# Captura screenshots no simulador iPad Pro 13" (2064×2752) para App Store Connect.
#
# Uso:
#   cd apps/mobile
#   bash scripts/capture_ipad_screenshots.sh
#
# O script:
#   1. Inicia o simulador iPad Pro 13" se necessário
#   2. Compila e instala o app (apontando para prod)
#   3. Captura uma screenshot inicial e abre o app
#   4. Aguarda você navegar manualmente (menu → carrinho → confirmação)
#   5. Captura uma imagem a cada Enter
#
# Saída em: store-assets/screenshots-v1.1/ipad-13/

set -euo pipefail

cd "$(dirname "$0")/.."

API_URL="${API_BASE_URL:-https://barbacue.hirableaiagents.com}"
OUT_DIR="store-assets/screenshots-v1.1/ipad-13"
BUNDLE_ID="com.lanchesdobarba.barbacue"
mkdir -p "$OUT_DIR"

# Find or boot an iPad Pro 13" simulator. Prefer one already Booted.
udid=$(xcrun simctl list devices available -j 2>/dev/null \
  | /usr/bin/python3 -c '
import sys, json
data = json.load(sys.stdin)
booted = none = None
for runtime, devs in data["devices"].items():
    for d in devs:
        if "iPad Pro 13" not in d["name"]: continue
        if d["state"] == "Booted":
            booted = d["udid"]; break
        if none is None: none = d["udid"]
    if booted: break
print(booted or none or "")
')

if [[ -z "$udid" ]]; then
  echo "✗ Nenhum simulador iPad Pro 13\" encontrado. Instale via Xcode > Settings > Components."
  exit 1
fi

state=$(xcrun simctl list devices | grep "$udid" | sed -E 's/.*\((Booted|Shutdown)\).*/\1/' | head -1)
if [[ "$state" != "Booted" ]]; then
  echo "==> Subindo simulador $udid"
  xcrun simctl boot "$udid"
  open -a Simulator
  sleep 5
fi

echo "==> Build (simulator, debug) com API=$API_URL"
flutter build ios --simulator --debug --dart-define=API_BASE_URL="$API_URL"

echo "==> Instalando .app"
xcrun simctl install "$udid" build/ios/iphonesimulator/Runner.app

echo "==> Abrindo app"
xcrun simctl launch "$udid" "$BUNDLE_ID"
sleep 3

shoot() {
  local name="$1"
  local path="$OUT_DIR/$name.png"
  xcrun simctl io "$udid" screenshot "$path"
  # Confirm dimensions for App Store Connect requirement.
  sips -g pixelWidth -g pixelHeight "$path" | awk '/pixel(Width|Height)/{print $1,$2}'
  echo "  → $path"
}

echo ""
echo "==> Pronto. Posicione o app e pressione ENTER após cada tela."
read -r -p "ENTER para capturar 01_menu... " _;          shoot 01_menu
read -r -p "ENTER para capturar 02_cart (navegue até o carrinho)... " _; shoot 02_cart
read -r -p "ENTER para capturar 03_payment (vá para a tela de pagamento)... " _; shoot 03_payment

echo ""
echo "✓ Screenshots prontos em $OUT_DIR — faça upload no App Store Connect"
echo "  (Media Manager → 13\" Display)."
