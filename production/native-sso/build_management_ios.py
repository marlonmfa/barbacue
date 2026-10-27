"""Build a private Gestão archive with the existing certificate/profile only."""
import os,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve();assert(root/'lib/main_gestao.dart').is_file();assert(root/'ios/Runner/Info-Gestao.plist').is_file()
assert not(root/'build/ios/archive/gestao.xcarchive').exists()
log=pathlib.Path(sys.argv[2]);log.parent.mkdir(parents=True,exist_ok=True);os.umask(0o077)
with log.open('w')as out:
 def run(args):subprocess.run(args,cwd=root,stdout=out,stderr=subprocess.STDOUT,check=True)
 run(['flutter','build','ios','--config-only','--release','--no-codesign','-t','lib/main_gestao.dart','--build-name=1.0.0','--build-number=2026102402','--dart-define=RELEASE_BRAND_ENDPOINT=true'])
 # No -allowProvisioningUpdates: never register devices or create/replace profiles or keys.
 run(['xcodebuild','-jobs','2','-workspace','ios/Runner.xcworkspace','-scheme','Runner','-configuration','Release','-archivePath',str(root/'build/ios/archive/gestao.xcarchive'),'-destination','generic/platform=iOS','-derivedDataPath','build/ios-release-work','APP_DISPLAY_NAME=Barbacue Gestão','APP_HOST=barbacue.cog.ia.br','APP_ICON=AppIcon-gestao','APP_BUNDLE_ID=com.lanchesdobarba.gestao','APP_LAUNCH_STORYBOARD=LaunchScreen','CODE_SIGN_ENTITLEMENTS=Runner/Management.entitlements','INFOPLIST_FILE=Runner/Info-Gestao.plist','FLUTTER_TARGET=lib/main_gestao.dart','CODE_SIGN_STYLE=Manual','CODE_SIGN_IDENTITY=Apple Distribution','PROVISIONING_PROFILE_SPECIFIER=Gestao AppStore','archive'])
 run(['xcodebuild','-exportArchive','-archivePath',str(root/'build/ios/archive/gestao.xcarchive'),'-exportPath',str(root/'build/ios/ipa/gestao'),'-exportOptionsPlist','ios/ExportOptions-Gestao.plist'])
print('PASS: private archive/IPA built with existing signing; no store submission or provisioning changes')
