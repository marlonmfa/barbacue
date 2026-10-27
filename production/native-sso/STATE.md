# Native Barbacue SSO — publication in progress, global task incomplete

2026-10-27: desktop Electron44.3 main + Chrome + reviewed Linux IDP + Next
candidate passed priority, permission, failed/confirmed logout, unmapped, absent,
inactive and first-password fallback. Original native cookie/settings unchanged.
Linux/local native units5PASS. Desktop screenshot commits8d6faba/66a2961 final
visual PASS (fixed an initial loading capture and real redundant web-bootstrap
navigation bug for absent Cog using a non-authorizing native marker).

Gestão Android + Chrome + real provider/Next + custom callback/PKCE passed
mapped/failed revoke/retry/confirmed native restore/unmapped/absent. Native cookie
unchanged. Unit/widget regressions5PASS; existing management widgets4PASS;
earlier full suite142PASS. Targeted analyze clean. Screenshotsfcfc877/a94aeef
final visual PASS (fixed menu obscuring logout failure, technical exception
prefix and retry button invoking refresh rather than revocation).

Published208mobile inputs reconstructed/hash-verified; existing iOS icon and
empty entitlement captured separately. Published Windows1.0 baseline16ASAR
sources retained; candidate1.0.1 adds only Cog modules/hooks/version metadata,
14original files unchanged including settings/preload/printing. InstallerSHA
94f713695bb342701a0e7f47dddbb58f8701514bd95fd6032e4e3ee3b3e164ab.
Dirty/unpublished1.1/1.2 desktop changes were not included. Only main Cog hooks
were staged against committed main; dirty working-tree edits remain unstaged.
The three previously untracked published Management modules are now versioned
explicitly with their release provenance, not by staging the whole mobile tree.

Linux candidate HX7FMLvv55-3axoaV1mfm compiled with frozen lock, original action
key, all115routes and14byte-identical CSS preserved. Production34table backup
encrypted before disk and restored in a network-none/tmpfs clone: every row
fingerprint equal. No production test login/account or business mutation used.

Production before publication: PM2 Barbacue ddc06e2/F1ePobsynvuHYfaNFf-56,
Windows1.0.0, providerb32b with7clients; barbacue-native not registered yet.
Consult published.json/windows-published.json/provider report for later changes.
Private Gestão Android2026102402 built; iOS archive building with existing
Gestao AppStore profile and no provisioning-update flag. No current review,
public mobile release or physical-phone installation changed.

Owned QA: builder /mnt/dados/barbacue-native-cog-20261026, internalnetwork
10.247.99.0/28, containers barbacue-native-qa-20261026-{idp,api,db}; separate
barbacue-native-restore-20261026 network-none/tmpfs. Mac SSH92782 forwards
54795API/54796IDP/54797webcontrol; screenshot receiver29179 port54801;
owned read-only emulator5566 now4096MB (95544) after old UI automation OOM.
Provider QA a69e config digest differs from productionb32b; all rootfs layers
were verified identical. QA source only rewrites fixed userinfo/revoke endpoints
through a guarded preload; production has no alternate issuer configuration.
Remove only these owned QA containers/networks/tunnels after final verification.
Keep private signed artifacts, archived source, backups and operational data.

Global remaining: finish Barbacue publication/artifact validation, implement the
two Garten native guichês, final aliases/TLS/infra audit. CopyPaste14 AppleVALID/
Play internal draft; Alerta API and private build16 packages ready. Physical
phone disconnected. Apple Individual membership/store skill gate already
explained to user; do not submit iOS review/public release as COG.IA. No subagents.
