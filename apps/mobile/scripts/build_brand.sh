#!/usr/bin/env bash
set -euo pipefail

brand="${1:-}"
platform="${2:-android}"

case "$brand" in
  barbacue)
    display_name="BARBACUE"
    bundle_id="com.lanchesdobarba.barbacue"
    host="barbacue.cog.ia.br"
    app_icon="AppIcon"
    launch_storyboard="LaunchScreen"
    build_name="1.2.4"
    build_number="14"
    signing_args=(
      CODE_SIGN_STYLE=Manual
      "CODE_SIGN_IDENTITY=Apple Distribution"
      "PROVISIONING_PROFILE_SPECIFIER=Barbacue AppStore AssocDomains"
    )
    ;;
  chelas)
    display_name="Chelas"
    bundle_id="com.lanchesdobarba.chelas"
    host="chelas.hirableaiagents.com"
    app_icon="AppIcon-chelas"
    launch_storyboard="LaunchScreenChelas"
    build_name="1.0.0"
    build_number="3"
    signing_args=(
      CODE_SIGN_STYLE=Manual
      "CODE_SIGN_IDENTITY=Apple Distribution"
      "PROVISIONING_PROFILE_SPECIFIER=Chelas AppStore AssocDomains"
    )
    ;;
  barbadog)
    display_name="Barbadog"
    bundle_id="com.lanchesdobarba.barbadog"
    host="barbadog.hirableaiagents.com"
    app_icon="AppIcon-barbadog"
    launch_storyboard="LaunchScreenBarbadog"
    build_name="1.0.0"
    build_number="3"
    signing_args=(
      CODE_SIGN_STYLE=Manual
      "CODE_SIGN_IDENTITY=Apple Distribution"
      "PROVISIONING_PROFILE_SPECIFIER=Barbadog AppStore AssocDomains"
    )
    ;;
  *)
    echo "Uso: $0 {barbacue|chelas|barbadog} {android|ios|ios-simulator}"
    exit 2
    ;;
esac

target="lib/main_${brand}.dart"
define="RELEASE_BRAND_ENDPOINT=true"

case "$platform" in
  android)
    # Android build 15 fixes release network access; the iOS release remains 14.
    if [[ "$brand" == "barbacue" ]]; then build_number="15"; fi
    flutter build appbundle --release --flavor "$brand" -t "$target" \
      --build-name="$build_name" --build-number="$build_number" \
      --dart-define="$define"
    echo "AAB: build/app/outputs/bundle/${brand}Release/app-${brand}-release.aab"
    ;;
  ios-simulator)
    flutter build ios --simulator --debug -t "$target" \
      --dart-define="$define"
    xcodebuild -quiet -workspace ios/Runner.xcworkspace -scheme Runner \
      -configuration Debug -sdk iphonesimulator \
      -derivedDataPath "build/ios-${brand}-simulator" \
      APP_DISPLAY_NAME="$display_name" APP_HOST="$host" APP_ICON="$app_icon" \
      APP_BUNDLE_ID="$bundle_id" APP_LAUNCH_STORYBOARD="$launch_storyboard" \
      FLUTTER_TARGET="$target" \
      CODE_SIGNING_ALLOWED=NO build
    echo "App: build/ios-${brand}-simulator/Build/Products/Debug-iphonesimulator/Runner.app"
    ;;
  ios)
    # Creates a store archive with the correct product identity and the
    # brand-specific App Store provisioning profile.
    flutter build ios --release --no-codesign -t "$target" \
      --build-name="$build_name" --build-number="$build_number" \
      --dart-define="$define"
    archive="$(pwd)/build/ios/archive/${brand}.xcarchive"
    xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner \
      -configuration Release -archivePath "$archive" \
      APP_DISPLAY_NAME="$display_name" APP_HOST="$host" APP_ICON="$app_icon" \
      APP_BUNDLE_ID="$bundle_id" APP_LAUNCH_STORYBOARD="$launch_storyboard" \
      FLUTTER_TARGET="$target" \
      "${signing_args[@]}" \
      -allowProvisioningUpdates archive
    case "$brand" in
      barbacue) export_options="ios/ExportOptions.plist" ;;
      chelas) export_options="ios/ExportOptions-Chelas.plist" ;;
      barbadog) export_options="ios/ExportOptions-Barbadog.plist" ;;
    esac
    xcodebuild -exportArchive -archivePath "$archive" \
      -exportPath "build/ios/ipa/$brand" -exportOptionsPlist "$export_options"
    echo "Archive: $archive"
    ;;
  *)
    echo "Plataforma inválida: $platform"
    exit 2
    ;;
esac
