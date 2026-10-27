# Native Cog session — Barbacue desktop and Gestão

The existing native staff cookie stays in its original jar/memory. A verified
Cog identity takes priority only when its email uniquely maps to an active local
staff account that completed first access. Native roles and permissions remain
authoritative. Unmapped, absent, inactive, expired and unavailable Cog identities
retain the local account. There is no account or permission provisioning.

Desktop uses the published Windows 1.0.0 sources, Electron44.3.0 and printing
code, plus two main-process modules and a startup hook. Version1.0.1 never
includes the dirty/unpublished1.1/1.2 features. The opaque grant remains in main
memory and is attached only to exact first-party administrative requests. A
non-authorizing native marker prevents redundant web-bootstrap navigation even
when Cog is absent. Retail/customer and third-party requests receive no grant.

Gestão uses the existing com.lanchesdobarba.gestao identity and build2026102402.
It uses the system browser, code+PKCE S256 and exact private callback. The API
resolves the opaque grant server-to-server through the fixed Cog userinfo
endpoint and audience barbacue-native. Logout must be confirmed before either
client drops the Cog grant; the original native cookie is retained. The retry
message/button is covered by a widget regression and actual Android E2E.

## Reproduction

- `prepare_context.py DEST` reconstructs the active published web baseline and
  the five native-auth changes, verifying original input and candidate hashes.
- `build_linux.py` uses the canonical apps/web/Dockerfile sso-build-env target
  (official Node22.23.2 pinned by digest), frozen lock and existing action key
  supplied privately on Linux. It supports npm ci on a fresh reconstruction;
  copying a prior verified dependency tree is only an optimization.
- `prepare_desktop.py DEST` restores the16 captured published ASAR sources,
  applies the minimal main delta and adds two auth modules; builder/Electron
  versions are pinned in the committed native metadata. Run electron-builder
  from the installed pinned toolchain with that projectDir, Windows NSIS x64.
- `prepare_management.py DEST` reconstructs all208 submitted mobile inputs from
  their recorded revision/overlay, preserves the existing iOS icon/entitlement
  support and applies the explicit Cog delta. It excludes unrelated checkout
  changes. Flutter pubspec.lock pins the existing dependencies plus app_links.
  Build only flavor gestao, target lib/main_gestao.dart, version1.0.0,
  build2026102402, with existing private signing references.
- `build_management_ios.py SOURCE LOG` creates a private archive/IPA using only
  the existing certificate/profile. It never enables provisioning updates or
  submits a store release. Existing store reviews are preserved.

## Verification

Five native unit tests passed locally and in Linux. Five Gestão unit/widget
regressions and four existing management widget tests passed after the final
changes; the earlier full Flutter suite passed142 tests. Actual published
Electron main + Chrome + reviewed Linux IDP/Next passed mapped/role/failed and
confirmed logout/unmapped/absent/inactive/first-password cases. Actual Android
Gestão + Chrome + custom callback/PKCE + real Linux services passed five cases,
including a real retry after failed revocation. Native cookies/settings and
fixture account counts remained unchanged. No production test account/session,
orders, payments, email, push or printing was used.

Screenshots were committed before evaluation:8d6faba/66a2961 (desktop),
fcfc877/a94aeef (Gestão). Both final evaluations PASS. Reports distinguish the
initial loading/technical-message failures and their verified corrections.
The candidate preserves115 routes,14 identical CSS files, action key and lock.
All34 production tables were encrypted before disk and restored with identical
row fingerprints in a network-isolated RAM clone before publication.

Physical-phone validation and public store distribution remain pending. The
Apple Individual membership restriction is documented in the overall task;
no current review or public mobile release is changed by these build scripts.
See published.json/windows-published.json when publication is completed.
