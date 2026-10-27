"""Publish only the tested1.0.1 installer metadata; retain published1.0.0 unchanged."""
import hashlib,json,os,pathlib,tempfile,sys
r=pathlib.Path('/root/deploy-backups/barbacue-native-cog-20261026');d=pathlib.Path('/root/barbacue/apps/web/private-downloads');os.umask(0o077)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads((d/'windows.json').read_text());expected=json.loads((r/'desktop-before.json').read_text());build=json.loads((r/'windows-build-validation.json').read_text());web=json.loads((r/'published.json').read_text())
assert web['published'] and web['healthy'] and web['build_id']=='HX7FMLvv55-3axoaV1mfm'
assert old['version']=='1.0.0'and old['sha256']==expected['installer_sha256']and sha(d/old['filename'])==old['sha256']
assert build['version']=='1.0.1'and build['original_native_files_identical']==14 and build['printing_preload_settings_unchanged']
f=r/'windows-candidate.private.exe';assert sha(f)==build['sha256']and f.stat().st_size==build['bytes']
assert json.loads((r/'qa-validation.json').read_text())['result']=='PASS'
assert json.loads((r/'desktop-visual-evaluation.json').read_text())['result']=='PASS'
name='Barbacue-Pedidos-1.0.1-Windows-x64-Setup.exe';assert not(d/name).exists();before=(d/'windows.json').read_bytes()
assert not(r/'windows.before.json').exists();(r/'windows.before.json').write_bytes(before)
if '--publish'not in sys.argv:print('PASS: installer/source/QA/native predecessor verified');sys.exit()
linked=False
try:
 os.link(f,d/name);linked=True
 updated=dict(old,version='1.0.1',filename=name,size=build['bytes'],sha256=build['sha256'])
 fd,tmp=tempfile.mkstemp(prefix='.windows-',dir=d)
 with os.fdopen(fd,'w')as out:out.write(json.dumps(updated,indent=2)+'\n');out.flush();os.fsync(out.fileno())
 os.chmod(tmp,0o600);os.replace(tmp,d/'windows.json')
 assert json.loads((d/'windows.json').read_text())==updated and sha(d/name)==updated['sha256']
 assert sha(d/old['filename'])==old['sha256']
 result=dict(published=True,version='1.0.1',filename=name,bytes=build['bytes'],sha256=build['sha256'],old_installer_byte_identical=True,print_agent_and_local_settings_unchanged=True,server_revision=web['revision'],download_admin_permission_preserved=True)
 (r/'windows-published.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
except BaseException:
 (d/'windows.json').write_bytes(before)
 if linked:(d/name).unlink()
 raise
