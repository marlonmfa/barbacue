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

## Publication confirmed
Provider registered eighthclientbarbacue-native (Control3ea25d2/a270e85), sameb32bimage/RSA, previous7clients/database preserved. PM2 backend b56a317/HX7FMLvv55-3axoaV1mfm publishedhealthy; 736operational files/threecatalogs/environment/dependencies/otherPM2processes unchanged. Staff/customer rows byte-fingerprints unchanged,0accounts provisioned. Windows1.0.1 metadata published;1.0.0installer retained byte-identical. All3origins public HTTPS catalogs200/admin401/download401 verified withoutproductionlogin.
Gestão signedAAB+IPA2026102402 validated privately: exactlegacybundle/callback, existingAndroiduploadcertificate and byte-identicaliOSprofile, codesignstrictPASS,8native64-bitlibraries16KB, knownprivatevaluesscanPASS, icon/encryptionmetadata preserved. Privateartifacts /tmp/barbacue-management-signed-20261027 (do notdelete). iOSbuild discovered globalINFOPLIST_FILE would affectPods; fixed Runner-only APP_INFO_PLIST setting/default in3configs, existingretaildefault preserved; repeatedarchive/exportPASS withoutprovisioningupdates. No storeupload/review/publicrelease/physicalphonetest.

## Final mobile SDK and cleanup
Final SDK fixed explicitly /opt/homebrew/share/flutter3.41.9 (00b0c91f06), matching published Android Flutter bytes and20iOStextsections. An initial private iOS compile inherited developmentSDK3.41.2; comparison detected drift and the candidate was rebuilt/superseded before any store upload. FinalAAB e22f4cd231ab956a0039dcfcb571d32dd774c03dad962fef481a7c9a327858bb; finalIPA78ba0e465237c045d4fa16b5fff3362403efedd819c7a2f0ad71d1d8766ebfc8 in /tmp/barbacue-management-signed-final-20261027. Older private candidates retained but not publishable. Source lock now matches signed SDK development pins matcher0.12.18/test_api0.7.9. Full143FluttertestsPASS after explicitSDK pubget. Final factory matches changed signed inputs exactly.
FourownedQA/RAMrestorecontainers/network, tunnel18494 andreceiver29431 removed/stopped; QAappstopped andthreeadb reversesremoved. Read-onlyemulator5566 (95544) remainsforGarten. Only ownvalidatediOScompilerintermediates removed; signedarchives/source/backups/packages retained. Barbacue stagecomplete except mobilepublicdistribution/physicaltest. ContinueGarten native then finalaliases/infra/TLS.
