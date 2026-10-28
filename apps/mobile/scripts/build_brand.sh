#!/usr/bin/env bash
set -euo pipefail

# Gradle uses this project's configured Flutter SDK. Use the same executable
# for CLI/config generation so native-asset hook caches share one Dart runtime.
if [[ -f android/local.properties ]]; then
  barbacue_flutter_sdk="$(sed -n 's/^flutter.sdk=//p' android/local.properties | head -n 1)"
  if [[ -n "$barbacue_flutter_sdk" && -x "$barbacue_flutter_sdk/bin/flutter" ]]; then
    export PATH="$barbacue_flutter_sdk/bin:$PATH"
  fi
fi

brand="${1:-}"
platform="${2:-android}"

case "$brand" in
  gestao)
    display_name="Barbacue Gestão"
    bundle_id="com.lanchesdobarba.gestao"
    host="barbacue.cog.ia.br"
    app_icon="AppIcon-gestao"
    launch_storyboard="LaunchScreen"
    build_name="1.1.0"
    build_number="2026102403"
    signing_args=(CODE_SIGN_STYLE=Manual "CODE_SIGN_IDENTITY=Apple Distribution" "PROVISIONING_PROFILE_SPECIFIER=Gestao AppStore")
    ;;
  barbacue)
    display_name="BARBACUE"
    bundle_id="com.lanchesdobarba.barbacue"
    host="barbacue.cog.ia.br"
    app_icon="AppIcon"
    launch_storyboard="LaunchScreen"
    build_name="1.2.5"
    build_number="2026102401"
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
    build_name="1.0.1"
    build_number="2026102401"
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
    build_name="1.0.1"
    build_number="2026102401"
    signing_args=(
      CODE_SIGN_STYLE=Manual
      "CODE_SIGN_IDENTITY=Apple Distribution"
      "PROVISIONING_PROFILE_SPECIFIER=Barbadog AppStore AssocDomains"
    )
    ;;
  *)
    echo "Uso: $0 {gestao|barbacue|chelas|barbadog} {android|android-apk|ios|ios-device|ios-simulator}"
    exit 2
    ;;
esac

target="lib/main_${brand}.dart"
define="RELEASE_BRAND_ENDPOINT=true"
entitlements="Runner/Runner.entitlements"
info_plist="Runner/Info.plist"
if [[ "$brand" == "gestao" ]]; then entitlements="Runner/Management.entitlements"; info_plist="Runner/Info-Gestao.plist"; fi

case "$platform" in
  android|android-apk)
    android_format="appbundle"
    if [[ "$platform" == "android-apk" ]]; then android_format="apk"; fi
    flutter build "$android_format" --release --flavor "$brand" -t "$target" \
      --build-name="$build_name" --build-number="$build_number" \
      --dart-define="$define"
    if [[ "$platform" == "android-apk" ]]; then
      echo "APK: build/app/outputs/flutter-apk/app-${brand}-release.apk"
    else
      echo "AAB: build/app/outputs/bundle/${brand}Release/app-${brand}-release.aab"
    fi
    ;;
  ios-simulator)
    flutter build ios --config-only --simulator --debug -t "$target" \
      --build-name="$build_name" --build-number="$build_number" \
      --dart-define="$define"
    xcodebuild -quiet -workspace ios/Runner.xcworkspace -scheme Runner \
      -configuration Debug -sdk iphonesimulator \
      -destination "generic/platform=iOS Simulator" \
      -derivedDataPath "build/ios-simulator-work" \
      ONLY_ACTIVE_ARCH=YES ARCHS="$(uname -m)" \
      APP_DISPLAY_NAME="$display_name" APP_HOST="$host" APP_ICON="$app_icon" \
      APP_BUNDLE_ID="$bundle_id" APP_LAUNCH_STORYBOARD="$launch_storyboard" \
      CODE_SIGN_ENTITLEMENTS="$entitlements" \
      APP_INFO_PLIST="$info_plist" \
      FLUTTER_TARGET="$target" \
      CODE_SIGNING_ALLOWED=NO build
    mkdir -p "build/ios-${brand}-simulator/Build/Products/Debug-iphonesimulator"
    ditto "build/ios-simulator-work/Build/Products/Debug-iphonesimulator/Runner.app" \
      "build/ios-${brand}-simulator/Build/Products/Debug-iphonesimulator/Runner.app"
    echo "App: build/ios-${brand}-simulator/Build/Products/Debug-iphonesimulator/Runner.app"
    ;;
  ios-device)
    # Reproducible device compilation without store registration or signing.
    flutter build ios --config-only --release --no-codesign -t "$target" \
      --build-name="$build_name" --build-number="$build_number" \
      --dart-define="$define"
    xcodebuild -quiet -workspace ios/Runner.xcworkspace -scheme Runner \
      -configuration Release -sdk iphoneos \
      -destination "generic/platform=iOS" \
      -derivedDataPath "build/ios-device-work" \
      APP_DISPLAY_NAME="$display_name" APP_HOST="$host" APP_ICON="$app_icon" \
      APP_BUNDLE_ID="$bundle_id" APP_LAUNCH_STORYBOARD="$launch_storyboard" \
      CODE_SIGN_ENTITLEMENTS="$entitlements" \
      APP_INFO_PLIST="$info_plist" \
      FLUTTER_TARGET="$target" CODE_SIGNING_ALLOWED=NO build
    mkdir -p "build/ios-${brand}-device/Build/Products/Release-iphoneos"
    ditto "build/ios-device-work/Build/Products/Release-iphoneos/Runner.app" \
      "build/ios-${brand}-device/Build/Products/Release-iphoneos/Runner.app"
    echo "App sem assinatura: build/ios-${brand}-device/Build/Products/Release-iphoneos/Runner.app"
    ;;
  ios)
    # Creates a store archive with the correct product identity and the
    # brand-specific App Store provisioning profile.
    flutter build ios --config-only --release --no-codesign -t "$target" \
      --build-name="$build_name" --build-number="$build_number" \
      --dart-define="$define"
    archive="$(pwd)/build/ios/archive/${brand}.xcarchive"
    xcodebuild -jobs 2 -workspace ios/Runner.xcworkspace -scheme Runner \
      -configuration Release -archivePath "$archive" \
      -destination "generic/platform=iOS" -derivedDataPath "build/ios-release-work" \
      APP_DISPLAY_NAME="$display_name" APP_HOST="$host" APP_ICON="$app_icon" \
      APP_BUNDLE_ID="$bundle_id" APP_LAUNCH_STORYBOARD="$launch_storyboard" \
      CODE_SIGN_ENTITLEMENTS="$entitlements" \
      APP_INFO_PLIST="$info_plist" \
      FLUTTER_TARGET="$target" \
      "${signing_args[@]}" \
      -allowProvisioningUpdates archive
    case "$brand" in
      gestao) export_options="ios/ExportOptions-Gestao.plist" ;;
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
