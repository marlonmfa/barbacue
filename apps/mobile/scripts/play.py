#!/usr/bin/env python3
"""Google Play Developer API client for the Barbacue release flow.

Credentials: a service-account JSON. Looked up in this order —
  $PLAY_CREDENTIALS, ~/.config/play/play-store-credentials.json, ~/Downloads/play-store-credentials.json

Usage:
    python3 scripts/play.py status                      # tracks + releases + edit sanity
    python3 scripts/play.py upload <aab> [track]        # upload AAB, default track=internal
    python3 scripts/play.py promote <versionCode> <track>
    python3 scripts/play.py testers                     # closed-testing tester counts (the production gate)

Play requires every write to happen inside an "edit" that is then committed; an
uncommitted edit changes nothing, so each command here opens and commits its own.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload

PACKAGE = os.environ.get("PLAY_PACKAGE", "com.lanchesdobarba.barbacue")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]

CANDIDATES = [
    os.environ.get("PLAY_CREDENTIALS"),
    str(Path.home() / ".config" / "play" / "play-store-credentials.json"),
    str(Path.home() / "Downloads" / "play-store-credentials.json"),
]


def client():
    for c in CANDIDATES:
        if c and Path(c).exists():
            creds = service_account.Credentials.from_service_account_file(c, scopes=SCOPES)
            return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    sys.exit("no Play credentials found; set $PLAY_CREDENTIALS to the service-account JSON")


def _edits(svc):
    return svc.edits()


def cmd_status() -> None:
    svc = client()
    try:
        edit = _edits(svc).insert(body={}, packageName=PACKAGE).execute()
    except HttpError as e:
        sys.exit(f"cannot open edit (is the service account linked to this app?):\n{e}")
    eid = edit["id"]
    try:
        tracks = _edits(svc).tracks().list(packageName=PACKAGE, editId=eid).execute()
        print(f"Package: {PACKAGE}\n")
        for t in tracks.get("tracks", []):
            print(f"track: {t['track']}")
            for r in t.get("releases", []):
                codes = r.get("versionCodes", [])
                print(
                    f"   name={r.get('name'):<12} status={r.get('status'):<12} "
                    f"versionCodes={codes} fraction={r.get('userFraction')}"
                )
            if not t.get("releases"):
                print("   (no releases)")
            print()

        bundles = _edits(svc).bundles().list(packageName=PACKAGE, editId=eid).execute()
        print("bundles in library:", [b["versionCode"] for b in bundles.get("bundles", [])])
    finally:
        # Read-only: never commit, so we don't accidentally mutate the listing.
        _edits(svc).delete(packageName=PACKAGE, editId=eid).execute()


def cmd_testers() -> None:
    """Closed-testing headcount — the gate on production access for personal accounts."""
    svc = client()
    edit = _edits(svc).insert(body={}, packageName=PACKAGE).execute()
    eid = edit["id"]
    try:
        tracks = _edits(svc).tracks().list(packageName=PACKAGE, editId=eid).execute()
        for t in tracks.get("tracks", []):
            if t["track"] in ("production",):
                continue
            print(f"{t['track']}: releases={len(t.get('releases', []))}")
        print(
            "\nNOTE: the Play API does not expose tester counts or the 14-day clock.\n"
            "Check Play Console -> Testing -> Closed testing -> your track -> Testers.\n"
            "Production access needs 12+ opted-in testers running the app for 14 continuous days."
        )
    finally:
        _edits(svc).delete(packageName=PACKAGE, editId=eid).execute()


def cmd_upload(aab: str, track: str = "internal") -> None:
    if not Path(aab).exists():
        sys.exit(f"no such AAB: {aab}")
    svc = client()
    edit = _edits(svc).insert(body={}, packageName=PACKAGE).execute()
    eid = edit["id"]
    try:
        print(f"uploading {aab} ...")
        media = MediaFileUpload(aab, mimetype="application/octet-stream", resumable=True)
        bundle = _edits(svc).bundles().upload(
            packageName=PACKAGE, editId=eid, media_body=media
        ).execute()
        code = bundle["versionCode"]
        print(f"uploaded versionCode={code}")

        _edits(svc).tracks().update(
            packageName=PACKAGE,
            editId=eid,
            track=track,
            body={"releases": [{"versionCodes": [str(code)], "status": "completed"}]},
        ).execute()
        _edits(svc).commit(packageName=PACKAGE, editId=eid).execute()
        print(f"committed: versionCode {code} live on track '{track}'")
    except HttpError as e:
        _edits(svc).delete(packageName=PACKAGE, editId=eid).execute()
        sys.exit(f"upload failed:\n{e}")


def cmd_promote(version_code: str, track: str) -> None:
    svc = client()
    edit = _edits(svc).insert(body={}, packageName=PACKAGE).execute()
    eid = edit["id"]
    try:
        _edits(svc).tracks().update(
            packageName=PACKAGE,
            editId=eid,
            track=track,
            body={"releases": [{"versionCodes": [str(version_code)], "status": "completed"}]},
        ).execute()
        _edits(svc).commit(packageName=PACKAGE, editId=eid).execute()
        print(f"promoted versionCode {version_code} to '{track}'")
    except HttpError as e:
        _edits(svc).delete(packageName=PACKAGE, editId=eid).execute()
        # FAILED_PRECONDITION here means the Console setup/production-access gate, not a bug.
        sys.exit(f"promote failed:\n{e}")


COMMANDS = {
    "status": cmd_status,
    "testers": cmd_testers,
    "upload": cmd_upload,
    "promote": cmd_promote,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](*sys.argv[2:])
