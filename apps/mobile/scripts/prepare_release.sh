#!/usr/bin/env bash
# Prepara os assets do release: ícones, splash e rebuild dos artefatos
# com a URL de produção embutida.
#
# Uso:
#   cd apps/mobile
#   bash scripts/prepare_release.sh
#
# Pré-requisitos:
#   - Flutter instalado e no PATH
#   - Para o build iOS: Xcode + cocoapods + conta Apple ativa

set -euo pipefail

cd "$(dirname "$0")/.."

API_URL="${API_BASE_URL:-https://barbacue.hirableaiagents.com}"

echo "==> 1/5 flutter pub get"
flutter pub get

echo "==> 2/5 Gerando ícones (flutter_launcher_icons)"
dart run flutter_launcher_icons

echo "==> 3/5 Gerando splash screen (flutter_native_splash)"
dart run flutter_native_splash:create

echo "==> 4/5 Build Android AAB (release)"
flutter build appbundle --release \
  --dart-define=API_BASE_URL="$API_URL"

echo "==> 5/5 Build iOS IPA (release)"
# Só roda em Mac com Xcode
if [[ "$OSTYPE" == "darwin"* ]]; then
  flutter build ipa --release \
    --dart-define=API_BASE_URL="$API_URL" \
    --export-options-plist=ios/ExportOptions.plist
else
  echo "  (pulando — iOS build só roda em macOS com Xcode)"
fi

echo ""
echo "✓ Pronto. Artefatos em:"
echo "    build/app/outputs/bundle/release/app-release.aab"
echo "    build/ios/ipa/*.ipa  (se iOS rodou)"
