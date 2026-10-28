"""Validate private native artifacts against the original Gestão signing and identity."""
import hashlib,importlib.util,json,os,pathlib,plistlib,re,struct,subprocess,sys,zipfile
r=pathlib.Path(__file__).resolve().parents[2];mobile=pathlib.Path(sys.argv[1]);private=pathlib.Path(sys.argv[2]);private.mkdir(mode=0o700,exist_ok=False);os.umask(0o077)
java='/opt/homebrew/opt/openjdk@21/bin/java';keytool='/opt/homebrew/opt/openjdk@21/bin/keytool';tool=pathlib.Path((r.parent/'alerta.cog.ia.br/mobile/.private/bundletool-path.txt').read_text().strip())
run=lambda a:subprocess.check_output(list(map(str,a)),stderr=subprocess.PIPE)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def macho_text_sections(b):
 if b[:4]==b'\xca\xfe\xba\xbe':
  for i in range(struct.unpack_from('>I',b,4)[0]):
   cpu,sub,offset,size,align=struct.unpack_from('>IIIII',b,8+i*20)
   if cpu==0x100000c:b=b[offset:offset+size];break
 assert b[:4]==b'\xcf\xfa\xed\xfe',b[:4]
 n=struct.unpack_from('<I',b,16)[0];pos=32;out={}
 for i in range(n):
  cmd,size=struct.unpack_from('<II',b,pos)
  if cmd==0x19:
   for j in range(struct.unpack_from('<I',b,pos+64)[0]):
    a=struct.unpack_from('<16s16sQQIIIIIIII',b,pos+72+j*80);key=a[1].rstrip(b'\0').decode()+'.'+a[0].rstrip(b'\0').decode()
    if key.startswith('__TEXT.'):out[key]=hashlib.sha256(b[a[4]:a[4]+a[3]]).hexdigest()
  pos+=size
 return out
aab=mobile/'build/app/outputs/bundle/gestaoRelease/app-gestao-release.aab';ipa=mobile/'build/ios/ipa/gestao-cog/barbacue.ipa';old=r/'output/mobile/store-release-2026-10-24'
run([java,'-jar',tool,'validate','--bundle='+str(aab)])
manifest=run([java,'-jar',tool,'dump','manifest','--bundle='+str(aab)]).decode()
assert 'package="com.lanchesdobarba.gestao"'in manifest and 'android:versionCode="2026102402"'in manifest
assert 'android:scheme="com.lanchesdobarba.gestao"'in manifest and 'android:host="oauth"'in manifest and 'android:path="/cog/callback"'in manifest
cert=lambda p:re.search(r'SHA256: ([A-F0-9:]+)',run([keytool,'-printcert','-jarfile',p]).decode()).group(1)
assert cert(aab)==cert(old/'gestao-1.0.0-2026102401.aab')
with zipfile.ZipFile(aab)as a,zipfile.ZipFile(old/'gestao-1.0.0-2026102401.aab')as b:
 for name in ['base/lib/arm64-v8a/libflutter.so','base/lib/x86_64/libflutter.so']:assert a.read(name)==b.read(name),'Preserve published Android Flutter engine'
libs=0
with zipfile.ZipFile(aab)as z:
 for name in z.namelist():
  if not name.endswith('.so')or not any('/'+abi+'/'in name for abi in ['arm64-v8a','x86_64']):continue
  data=z.read(name);assert data[:5]==b'\x7fELF\x02';offset=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54)
  for i in range(count):
   h=struct.unpack_from('<IIQQQQQQ',data,offset+i*size)
   if h[0]==1:assert h[7]>=16384
  libs+=1
assert libs>0
with zipfile.ZipFile(ipa)as z,zipfile.ZipFile(old/'gestao-1.0.0-2026102401.ipa')as before:
 info=plistlib.loads(z.read('Payload/Runner.app/Info.plist'));prior=plistlib.loads(before.read('Payload/Runner.app/Info.plist'))
 for field in ['CFBundleIdentifier','CFBundleDisplayName','CFBundleIcons','ITSAppUsesNonExemptEncryption']:assert info.get(field)==prior.get(field),field
 assert info['CFBundleVersion']=='2026102402'and info['CFBundleShortVersionString']=='1.0.0'
 assert info['FlutterDeepLinkingEnabled']is False and info['CFBundleURLTypes'][0]['CFBundleURLSchemes']==['com.lanchesdobarba.gestao']
 assert z.read('Payload/Runner.app/embedded.mobileprovision')==before.read('Payload/Runner.app/embedded.mobileprovision')
 engine='Payload/Runner.app/Frameworks/Flutter.framework/Flutter';text=macho_text_sections(z.read(engine));assert text==macho_text_sections(before.read(engine)),'Preserve published iOS Flutter engine'
app=mobile/'build/ios/archive/gestao-cog-20261027.xcarchive/Products/Applications/Runner.app';run(['codesign','--verify','--deep','--strict',app])
# Scan each unpacked file in memory; never log private values.
spec=importlib.util.spec_from_file_location('scan',pathlib.Path.home()/'Apps/skills/ios-app-store/scripts/secret_scan.py');scan=importlib.util.module_from_spec(spec);spec.loader.exec_module(scan);secrets=scan.env_secrets(str(pathlib.Path.home()/'Apps'))
for file in [r/'.env',r.parent/'.env.default']:
 if file.is_file():
  for k,v in re.findall(r'^([A-Z0-9_]+)=(.*)$',file.read_text(),re.M):
   v=v.strip().strip('"\'')
   if scan.SECRET_KEY.search(k)and len(v)>=12:secrets[v]=k
for p in [aab,ipa]:
 with zipfile.ZipFile(p)as z:
  for name in z.namelist():
   if name.endswith('/'):continue
   data=z.read(name);assert not any(v.encode()in data for v in secrets),'Known secret was bundled';assert pathlib.Path(name).name!='.env'and not name.endswith(('.p8','.jks','.keystore'))
artifacts=[]
for source,name in [(aab,'gestao-1.0.0-2026102402.aab'),(ipa,'gestao-1.0.0-2026102402.ipa')]:
 dest=private/name;dest.write_bytes(source.read_bytes());dest.chmod(0o600);artifacts.append(dict(file=name,bytes=dest.stat().st_size,sha256=sha(dest)))
report=dict(flutter_version='3.41.9',android_flutter_engine_byte_identical=True,ios_flutter_engine_text_sections_identical=len(text),version='1.0.0',build=2026102402,package='com.lanchesdobarba.gestao',android_bundletool_validate=True,android_upload_certificate_preserved=True,android_target_sdk_36='android:targetSdkVersion="36"'in manifest,android_64bit_libraries_16kb=libs,android_callback_exact=True,ios_existing_profile_byte_identical=True,ios_signature_valid=True,ios_legacy_identity_icon_encryption_metadata_preserved=True,ios_callback_exact=True,known_secret_scan='PASS',store_uploaded=False,store_review_changed=False,physical_phone_tested=False,artifacts=artifacts)
assert report['android_target_sdk_36'];(r/'production/native-sso/management-build-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
