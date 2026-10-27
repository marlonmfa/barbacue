"""Replace only the tested PM2 Next bundle; retain all current configuration and data."""
import hashlib,http.client,json,os,shutil,subprocess,sys,tarfile,time
from pathlib import Path
from cryptography.fernet import Fernet
ROOT=Path('/root/deploy-backups/barbacue-native-cog-20261026');APP=Path('/root/barbacue');WEB=APP/'apps/web';DIST='.next-mobile-session-20261024'
os.umask(0o077)
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,**kw)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def private(p,data):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
def report(n,v):private(ROOT/n,(json.dumps(v,indent=2)+'\n').encode())
def processes():return json.loads(run(['pm2','jlist']))
def pm2():return next(x for x in processes() if x['name']=='barbacue')
def probe(path,host='barbacue.cog.ia.br',checked=True):
 c=http.client.HTTPConnection('127.0.0.1',3007,timeout=15)
 h={'Host':host,'X-Forwarded-Host':host,'X-Forwarded-Proto':'https','Accept':'text/html'}
 if checked:h['Cookie']='cog_barbacue_checked=1; barbacue_cog_checked=1'
 c.request('GET',path,headers=h);r=c.getresponse();body=r.read();out=(r.status,dict(r.getheaders()),hashlib.sha256(body).hexdigest());c.close();return out
def operational():return {str(f.relative_to(WEB)):sha(f) for d in ['public','private-downloads','src'] for f in (WEB/d).rglob('*') if f.is_file()}
release=json.loads((ROOT/'release.json').read_text());expected=json.loads((ROOT/'native-runtime-files.json').read_text())
backup=json.loads((ROOT/'backup-validation.json').read_text())
assert release['e2e']=='passed' and release['linux_unit_tests']==5 and release['visual_evaluation']=='PASS'
assert release['css_identical'] and release['native_routes']==112 and release['candidate_routes']==115
assert backup['tables_verified']==34 and backup['all_row_fingerprints_equal'] and backup['network_isolated']
before=pm2();assert before['pm2_env']['status']=='online' and before['pm2_env']['pm_exec_path']=='/root/barbacue/apps/web/server.js'
assert (WEB/DIST/'BUILD_ID').read_text().strip()=='F1ePobsynvuHYfaNFf-56'
mutable={'server/app/api/instagram.meta','server/app/api/instagram.body'}
assert all(sha(WEB/DIST/n)==v for n,v in expected.items() if n not in mutable),'Concurrent native bundle change'
assert sha(ROOT/'runtime.private.tar.gz')==release['runtime_sha256']
assert shutil.disk_usage(ROOT).free>1024**3
stage=ROOT/'runtime-stage';assert not stage.exists();stage.mkdir(mode=0o700)
with tarfile.open(ROOT/'runtime.private.tar.gz') as archive:
 for m in archive:
  assert m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
  assert not {'standalone','cache'}.intersection(Path(m.name).parts)
  p=stage/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(archive.extractfile(m).read());os.chmod(p,0o644)
assert {str(p.relative_to(stage)):sha(p) for p in stage.rglob('*') if p.is_file()}==release['runtime_files']
for p in stage.rglob('*'):
 if p.is_dir():os.chmod(p,0o755)
os.chmod(stage,0o755)
server_hash=sha(WEB/'server.js');manifest_hashes={str(p):sha(p) for p in [APP/'package.json',WEB/'package.json']}
old_operational=operational();hosts=['barbacue.cog.ia.br','chelas.hirableaiagents.com','barbadog.hirableaiagents.com']
catalogs={host:probe('/api/products',host)[2] for host in hosts}
assert all(probe('/pedir',h)[0]==200 for h in hosts)
assert probe('/api/admin/auth')[0]==401
snapshot=json.loads(Fernet((ROOT/'before-key.private').read_bytes()).decrypt((ROOT/'before.encrypted').read_bytes()))
assert snapshot['purpose']=='barbacue-native-before-v1'
checkpoint=ROOT/'pm2.at-publication.private.json'
if checkpoint.exists():
 saved=json.loads(checkpoint.read_text());assert saved['pm2_env']['pm_uptime']==before['pm2_env']['pm_uptime'] and saved['pm2_env'].get('env')==before['pm2_env'].get('env')
else:private(checkpoint,json.dumps(before).encode())
old_env={k:v for k,v in before['pm2_env'].items() if isinstance(v,str)}
assert old_env['COG_OIDC_CLIENT_ID']=='barbacue-external' and old_env['COG_OIDC_ISSUER']=='https://id.cog.ia.br'
others={x['name']:(x['pid'],x['pm2_env'].get('pm_uptime')) for x in processes() if x['name']!='barbacue'}
linked=0
for p in (WEB/DIST/'static').rglob('*'):
 if p.is_file():
  dest=stage/'static'/p.relative_to(WEB/DIST/'static')
  if not dest.exists():dest.parent.mkdir(parents=True,exist_ok=True);os.link(p,dest);linked+=1
print('PASS: native bundle, QA, restored 34 tables, private RP config, operational files and three catalogs',flush=True)
if '--publish' not in sys.argv:shutil.rmtree(stage);sys.exit()
old=ROOT/'next.before.private';assert not old.exists();swapped=False
try:
 assert pm2()['pm2_env']['pm_uptime']==before['pm2_env']['pm_uptime']
 run(['pm2','stop','barbacue'])
 # Preserve the native public ISR response and warm image cache, after stopping writes.
 for name in mutable:
  source=WEB/DIST/name
  if source.is_file():
   dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
 if (WEB/DIST/'cache').is_dir():shutil.copytree(WEB/DIST/'cache',stage/'cache',copy_function=os.link)
 os.replace(WEB/DIST,old);os.replace(stage,WEB/DIST);swapped=True
 run(['pm2','restart','barbacue','--update-env'],env={**os.environ,**old_env})
 for _ in range(60):
  try:
   ok=probe('/api/admin/auth')[0]==401 and probe('/admin/login')[0]==200
   ok=ok and all(probe('/admin/login',h,False)[0]==303 and '/api/auth/cog/start?' in probe('/admin/login',h,False)[1].get('location','') for h in hosts[1:])
   if ok:break
  except (OSError,http.client.HTTPException):pass
  time.sleep(.5)
 else:raise RuntimeError('Native PM2 candidate failed health or federation bootstrap')
 now=pm2();assert now['pm2_env']['status']=='online'
 assert all(now['pm2_env'].get('env',{}).get(k)==v for k,v in before['pm2_env'].get('env',{}).items())
 assert operational()==old_operational and sha(WEB/'server.js')==server_hash
 assert all(sha(Path(p))==v for p,v in manifest_hashes.items())
 assert all(probe('/pedir',h)[0]==200 and probe('/api/products',h)[2]==catalogs[h] for h in hosts)
 assert {x['name']:(x['pid'],x['pm2_env'].get('pm_uptime')) for x in processes() if x['name']!='barbacue'}==others
 run(['pm2','save'])
 result=dict(published=True,healthy=True,revision=release['revision'],build_id=(WEB/DIST/'BUILD_ID').read_text().strip(),native_routes_preserved=112,
  three_catalogs_identical=True,native_operational_files_preserved=len(old_operational),native_server_and_dependencies_unchanged=True,native_environment_preserved=True,
  database_untouched=True,database_all_34_tables_restored=True,other_pm2_processes_unchanged=True,old_static_chunks_retained=linked,rollback_build_retained=True,accounts_provisioned=0)
 report('published.json',result);print(json.dumps(result))
except BaseException:
 run(['pm2','stop','barbacue'])
 if swapped:os.replace(WEB/DIST,ROOT/'next.failed.private');os.replace(old,WEB/DIST)
 run(['pm2','restart','barbacue','--update-env'],env={**os.environ,**old_env})
 run(['pm2','save']);report('rollback.json',dict(native_build_restored=True,live_database_not_restored=True));raise
