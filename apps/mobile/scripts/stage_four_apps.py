#!/usr/bin/env python3
"""Stage verified local builds; never upload, sign, or read credentials."""
import argparse
import hashlib
import json
import plistlib
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

MOBILE = Path(__file__).resolve().parents[1]
ROOT = MOBILE.parents[1]
APPS = {"gestao": "Barbacue Gestão", "barbacue": "BARBACUE", "chelas": "Chelas", "barbadog": "Barbadog"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=["android", "ios-simulator", "ios-device"])
    args = parser.parse_args()
    artifacts = []
    aapt = None
    if args.platform == "android":
        properties = (MOBILE / "android/local.properties").read_text()
        sdk = re.search(r"^sdk.dir=(.+)$", properties, re.M)
        if not sdk:
            raise SystemExit("Configure sdk.dir em android/local.properties.")
        candidates = sorted((Path(sdk[1].strip()) / "build-tools").glob("*/aapt"))
        if not candidates:
            raise SystemExit("Android build-tools/aapt não encontrado.")
        aapt = candidates[-1]
    for slug, name in APPS.items():
        expected_id = f"com.lanchesdobarba.{slug}"
        if args.platform == "android":
            source = MOBILE / f"build/app/outputs/flutter-apk/app-{slug}-release.apk"
            if not source.is_file():
                raise SystemExit(f"Build ausente: {source}")
            metadata = subprocess.check_output([str(aapt), "dump", "badging", str(source)], text=True)
            package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", metadata)
            if not package or package[1] != expected_id:
                raise SystemExit(f"Identidade Android incorreta: {slug}")
            version, number = package[3], package[2]
            suffix = "apk"
        else:
            simulator = args.platform == "ios-simulator"
            folder = "Debug-iphonesimulator" if simulator else "Release-iphoneos"
            variant = "simulator" if simulator else "device"
            source = MOBILE / f"build/ios-{slug}-{variant}/Build/Products/{folder}/Runner.app"
            if not source.is_dir():
                raise SystemExit(f"Build ausente: {source}")
            with (source / "Info.plist").open("rb") as handle:
                metadata = plistlib.load(handle)
            if metadata["CFBundleIdentifier"] != expected_id:
                raise SystemExit(f"Identidade iOS incorreta: {slug}")
            expected_platform = "IOSSIMULATOR" if simulator else "IOS"
            binaries = [source / metadata["CFBundleExecutable"]]
            binaries.extend(path / path.stem for path in (source / "Frameworks").glob("*.framework"))
            for binary in binaries:
                details = subprocess.check_output(["xcrun", "vtool", "-show-build", str(binary)], text=True)
                platforms = [line.split()[-1] for line in details.splitlines() if line.strip().startswith("platform ")]
                if not platforms or any(value != expected_platform for value in platforms):
                    raise SystemExit(f"Biblioteca da plataforma incorreta: {binary}: {platforms}")
            version, number = metadata["CFBundleShortVersionString"], metadata["CFBundleVersion"]
            suffix = "app.zip"
        artifacts.append({"slug": slug, "name": name, "bundleId": expected_id, "version": version,
                          "buildNumber": number, "source": source, "filename": f"{slug}-{args.platform}.{suffix}"})

    destination = ROOT / "output/mobile" / args.platform
    destination.mkdir(parents=True, exist_ok=True)
    for item in artifacts:
        target = destination / item["filename"]
        source = item.pop("source")
        if args.platform == "android":
            shutil.copy2(source, target)
        else:
            subprocess.run(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(source), str(target)], check=True)
        digest = hashlib.sha256()
        with target.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        item["sha256"] = digest.hexdigest()
        item["bytes"] = target.stat().st_size
    source_files = [MOBILE / "pubspec.yaml", MOBILE / "pubspec.lock", MOBILE / "android/app/build.gradle.kts",
                    MOBILE / "android/gradle.properties", MOBILE / "ios/Runner.xcodeproj/project.pbxproj"]
    for folder in ["lib", "assets", "scripts", "android/app/src", "ios/Runner"]:
        source_files.extend(path for path in (MOBILE / folder).rglob("*")
                            if path.is_file() and path.suffix not in [".pyc"] and "__pycache__" not in path.parts)
    source_hashes = {str(path.relative_to(MOBILE)): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in sorted(source_files) if path.is_file()}
    manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "platform": args.platform,
                "published": False, "distribution": "local-apk" if args.platform == "android" else
                "simulator-only" if args.platform == "ios-simulator" else "unsigned-device-build",
                "gitRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "workingTreeModified": bool(subprocess.check_output(["git", "status", "--porcelain", "--", "apps/mobile"], cwd=ROOT, text=True)),
                "sourceSha256": source_hashes, "apps": artifacts}
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    (destination / "SHA256SUMS").write_text("".join(f"{item['sha256']}  {item['filename']}\n" for item in artifacts))
    print(destination)


if __name__ == "__main__":
    main()
