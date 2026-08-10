#!/usr/bin/env python3
"""App Store Connect API client for the Barbacue release flow.

Reads credentials from ~/.appstoreconnect/api_key.json (key_id, issuer_id, key)
— the same file `xcrun altool`/Transporter writes — so no secrets live in the repo.

Usage:
    python3 scripts/asc.py status                    # app + latest versions/builds
    python3 scripts/asc.py builds                    # processing state of recent builds
    python3 scripts/asc.py create-version 1.2.0      # new PREPARE_FOR_SUBMISSION version
    python3 scripts/asc.py attach-build 1.2.0 5      # bind build number 5 to version
    python3 scripts/asc.py whatsnew 1.2.0 "texto"    # release notes (pt-BR)
    python3 scripts/asc.py submit 1.2.0              # submit for review

The binary upload itself is NOT here — that is `xcrun altool --upload-app`, which
speaks Apple's proprietary transport. See publish_ios.sh.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import jwt
import urllib.request
import urllib.error

BUNDLE_ID = "com.lanchesdobarba.barbacue"
API = "https://api.appstoreconnect.apple.com/v1"
CONFIG = Path.home() / ".appstoreconnect" / "api_key.json"


def _creds() -> tuple[str, str, str]:
    if not CONFIG.exists():
        sys.exit(f"missing {CONFIG} — create it with key_id/issuer_id/key")
    cfg = json.loads(CONFIG.read_text())
    key = cfg["key"]
    # The stored key is bare base64 (no PEM armor); pyjwt needs the armored form.
    if "BEGIN" not in key:
        body = "\n".join(key[i : i + 64] for i in range(0, len(key), 64))
        key = f"-----BEGIN PRIVATE KEY-----\n{body}\n-----END PRIVATE KEY-----\n"
    return cfg["key_id"], cfg["issuer_id"], key


def token() -> str:
    key_id, issuer_id, private_key = _creds()
    now = int(time.time())
    return jwt.encode(
        {"iss": issuer_id, "iat": now, "exp": now + 15 * 60, "aud": "appstoreconnect-v1"},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def req(method: str, path: str, body: dict | None = None) -> dict:
    url = path if path.startswith("http") else f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", f"Bearer {token()}")
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        try:
            errors = json.loads(detail).get("errors", [])
            detail = "\n".join(
                f"  [{x.get('status')}] {x.get('title')}: {x.get('detail')}" for x in errors
            )
        except json.JSONDecodeError:
            pass
        sys.exit(f"ASC {method} {path} failed ({e.code}):\n{detail}")


def app_id() -> str:
    apps = req("GET", f"/apps?filter[bundleId]={BUNDLE_ID}")["data"]
    if not apps:
        sys.exit(f"no app found for bundleId {BUNDLE_ID}")
    return apps[0]["id"]


def find_version(app: str, version: str) -> dict | None:
    versions = req("GET", f"/apps/{app}/appStoreVersions?filter[versionString]={version}")["data"]
    return versions[0] if versions else None


def find_build(app: str, build_number: str) -> dict | None:
    builds = req(
        "GET", f"/builds?filter[app]={app}&filter[version]={build_number}&limit=1"
    )["data"]
    return builds[0] if builds else None


def cmd_status() -> None:
    app = app_id()
    info = req("GET", f"/apps/{app}")["data"]["attributes"]
    print(f"App: {info['name']}  ({BUNDLE_ID})  id={app}")
    print(f"  primaryLocale={info.get('primaryLocale')}  sku={info.get('sku')}\n")

    print("Versions:")
    for v in req("GET", f"/apps/{app}/appStoreVersions?limit=5")["data"]:
        a = v["attributes"]
        print(f"  {a['versionString']:<8} {a['appStoreState']:<28} released={a.get('releaseType')}")

    print("\nBuilds (latest 5):")
    for b in req("GET", f"/builds?filter[app]={app}&limit=5&sort=-uploadedDate")["data"]:
        a = b["attributes"]
        print(
            f"  build {a['version']:<4} {a.get('processingState'):<12} "
            f"expired={a.get('expired')}  uploaded={a.get('uploadedDate')}"
        )


def cmd_builds() -> None:
    app = app_id()
    for b in req("GET", f"/builds?filter[app]={app}&limit=10&sort=-uploadedDate")["data"]:
        a = b["attributes"]
        print(json.dumps({"id": b["id"], **a}, indent=2, default=str))


def cmd_create_version(version: str) -> None:
    app = app_id()
    if existing := find_version(app, version):
        print(f"version {version} already exists: {existing['attributes']['appStoreState']}")
        return
    created = req(
        "POST",
        "/appStoreVersions",
        {
            "data": {
                "type": "appStoreVersions",
                "attributes": {
                    "platform": "IOS",
                    "versionString": version,
                    # Publish as soon as review approves — matches how 1.1.0 shipped.
                    "releaseType": "AFTER_APPROVAL",
                },
                "relationships": {"app": {"data": {"type": "apps", "id": app}}},
            }
        },
    )
    print(f"created version {version} → {created['data']['id']}")


def cmd_attach_build(version: str, build_number: str) -> None:
    app = app_id()
    v = find_version(app, version) or sys.exit(f"no version {version}")
    b = find_build(app, build_number) or sys.exit(f"no build {build_number}")
    state = b["attributes"].get("processingState")
    if state != "VALID":
        sys.exit(f"build {build_number} is {state}, not VALID — wait for processing")
    req(
        "PATCH",
        f"/appStoreVersions/{v['id']}/relationships/build",
        {"data": {"type": "builds", "id": b["id"]}},
    )
    print(f"attached build {build_number} to version {version}")


def cmd_whatsnew(version: str, text: str) -> None:
    app = app_id()
    v = find_version(app, version) or sys.exit(f"no version {version}")
    locs = req("GET", f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations")["data"]
    for loc in locs:
        req(
            "PATCH",
            f"/appStoreVersionLocalizations/{loc['id']}",
            {
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "id": loc["id"],
                    "attributes": {"whatsNew": text},
                }
            },
        )
        print(f"set whatsNew for {loc['attributes']['locale']}")


def cmd_submit(version: str) -> None:
    app = app_id()
    v = find_version(app, version) or sys.exit(f"no version {version}")
    state = v["attributes"]["appStoreState"]
    if state != "PREPARE_FOR_SUBMISSION":
        sys.exit(f"version {version} is {state} — only PREPARE_FOR_SUBMISSION can be submitted")
    req(
        "POST",
        "/appStoreVersionSubmissions",
        {
            "data": {
                "type": "appStoreVersionSubmissions",
                "relationships": {
                    "appStoreVersion": {"data": {"type": "appStoreVersions", "id": v["id"]}}
                },
            }
        },
    )
    print(f"submitted {version} for review (auto-release on approval)")


COMMANDS = {
    "status": cmd_status,
    "builds": cmd_builds,
    "create-version": cmd_create_version,
    "attach-build": cmd_attach_build,
    "whatsnew": cmd_whatsnew,
    "submit": cmd_submit,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
