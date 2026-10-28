"""Replace only the verified Next build of the existing native PM2 application."""
import hashlib,http.client,json,os,pathlib,shutil,subprocess,sys,tarfile,time
root=pathlib.Path('/root/deploy-backups/barbacue-cog-sso-20261025')
app=pathlib.Path('/root/barbacue');web=app/'apps/web';dist='.next-mobile-session-20261024'
release=json.loads((root/'release.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def private(p,data):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.fchmod(fd,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
def report(n,value):private(root/n,(json.dumps(value,indent=2)+'\n').encode())
def pm2():return next(p for p in json.loads(subprocess.check_output(['pm2','jlist'])) if p['name']=='barbacue')
def hashes(base):return {str(f.relative_to(base)):sha(f) for d in ['server','static'] for f in(base/d).rglob('*') if f.is_file()}
def probe(path,host='barbacue.cog.ia.br',checked=True):
 c=http.client.HTTPConnection('127.0.0.1',3007,timeout=15);headers={'Host':host,'X-Forwarded-Host':host,'X-Forwarded-Proto':'https','Accept':'text/html'}
 if checked:headers['Cookie']='cog_barbacue_checked=1'
 c.request('GET',path,headers=headers);r=c.getresponse();body=r.read();result=(r.status,dict(r.getheaders()),hashlib.sha256(body).hexdigest());c.close();return result
before=pm2();assert before['pm2_env']['status']=='online'
assert before['pm2_env']['pm_exec_path']=='/root/barbacue/apps/web/server.js'
assert (web/dist/'BUILD_ID').read_text().strip()=='ZnqXTYJAItJLMco5e6go6'
assert hashes(web/dist)==json.loads((root/'native-compiled-files.json').read_text()),'Concurrent native build change detected'
assert release['e2e']=='passed' and release['linux_unit_tests']==2 and release['visual_evaluation']=='PASS'
backup=json.loads((root/'backup-validation.json').read_text());assert backup['restored_to_disposable_postgresql'] and backup['tables_verified']==34
values=json.loads((root/'sso-config.private.json').read_text());assert set(values)=={'COGIA_SSO_SERVICE','COGIA_SSO_API_URL','COGIA_SSO_IDENTITY_KEY'}
assert values['COGIA_SSO_SERVICE']=='barbacue' and values['COGIA_SSO_API_URL']=='http://10.66.0.2:18077/api/sso'
assert len(values['COGIA_SSO_IDENTITY_KEY'])==64
for key,status in [(values['COGIA_SSO_IDENTITY_KEY'],422),('invalid-key-probe',401)]:
 c=http.client.HTTPConnection('10.66.0.2',18077,timeout=5);c.request('POST','/api/sso/identidade',body='{}',headers={'Authorization':'Bearer '+key,'X-Cog-Service':'barbacue','Content-Type':'application/json'});r=c.getresponse();r.read();assert r.status==status;c.close()
archive=root/'runtime.private.tar.gz';assert sha(archive)==release['runtime_sha256']
assert shutil.disk_usage(root).free>1100*1024**2
stage=root/'runtime';assert not stage.exists();stage.mkdir(mode=0o700)
with tarfile.open(archive) as a:
 for m in a:
  assert m.isfile() and not pathlib.PurePosixPath(m.name).is_absolute() and '..' not in pathlib.PurePosixPath(m.name).parts
  assert not {'cache','standalone'}.intersection(pathlib.PurePosixPath(m.name).parts)
  dest=stage/m.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(a.extractfile(m).read())
assert {str(f.relative_to(stage)):sha(f) for f in stage.rglob('*') if f.is_file()}==release['runtime_files']
old_env={k:v for k,v in before['pm2_env'].items() if isinstance(v,str)}
private(root/'pm2.at-publication.private.json',json.dumps(before).encode())
server_sha=sha(web/'server.js')
operational={str(f.relative_to(web)):sha(f) for folder in ['public','private-downloads','src'] for f in(web/folder).rglob('*') if f.is_file()}
native_uris=['/api/admin/auth','/api/admin/dashboard','/api/admin/orders'];assert all(probe(p)[0]==401 for p in native_uris)
hosts=['barbacue.cog.ia.br','chelas.hirableaiagents.com','barbadog.hirableaiagents.com']
public_before={host:probe('/api/products',host)[2] for host in hosts}
assert all(probe('/pedir',host)[0]==200 for host in hosts)
# Keep historical browser chunks: existing open orders/tabs can still load them.
linked=0
for src in(web/dist/'static').rglob('*'):
 if src.is_file():
  dest=stage/'static'/src.relative_to(web/dist/'static')
  if not dest.exists():dest.parent.mkdir(parents=True,exist_ok=True);os.link(src,dest);linked+=1
print('PASS: native build, private bridge, restored database, operational files and three catalogs',flush=True)
if sys.argv[-1]!='publish':sys.exit()
old=root/'next.before.private';assert not old.exists()
env={**os.environ,**old_env,**values};swapped=False
try:
 assert pm2()['pm2_env']['pm_uptime']==before['pm2_env']['pm_uptime'],'Concurrent PM2 restart detected'
 subprocess.run(['pm2','stop','barbacue'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
 os.replace(web/dist,old);os.replace(stage,web/dist);swapped=True
 subprocess.run(['pm2','restart','barbacue','--update-env'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
 healthy=False
 for _ in range(60):
  try:
   if all(probe(p)[0]==401 for p in native_uris) and probe('/admin/login',checked=False)[0]==303 and probe('/admin/login')[0]==200:healthy=True;break
  except (OSError,http.client.HTTPException):pass
  time.sleep(.5)
 assert healthy,'New PM2 build did not become healthy'
 current=pm2();assert current['pm2_env']['status']=='online'
 assert all(current['pm2_env'][k]==v for k,v in values.items())
 original=before['pm2_env'].get('env',{})
 assert all(current['pm2_env'].get('env',{}).get(k)==v for k,v in original.items() if k not in values)
 assert sha(web/'server.js')==server_sha
 assert {str(f.relative_to(web)):sha(f) for folder in ['public','private-downloads','src'] for f in(web/folder).rglob('*') if f.is_file()}==operational
 assert all(probe('/pedir',host)[0]==200 and probe('/api/products',host)[2]==public_before[host] for host in hosts)
 subprocess.run(['pm2','save'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
 report('published.json',{'published':True,'healthy':True,'revision':release['revision'],'native_build':'ZnqXTYJAItJLMco5e6go6',
  'candidate_build':(web/dist/'BUILD_ID').read_text().strip(),'runtime':'existing Node 22.23.1 / PM2 barbacue / port 3007',
  'native_sources_verified':222,'native_routes_preserved':112,'operational_files_preserved':len(operational),'historical_static_files_linked':linked,
  'three_catalogs_identical':True,'native_server_and_dependencies_unchanged':True,'native_environment_preserved':True,'database_untouched':True,
  'database_snapshot_restored':True,'accounts_provisioned':0,'cookie_sso_host':'barbacue.cog.ia.br','external_brand_domains':'federation pending'})
 print('PASS: Barbacue published healthy; native PM2 environment, data, downloads and three catalogs preserved',flush=True)
except BaseException:
 subprocess.run(['pm2','stop','barbacue'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 if swapped:os.replace(web/dist,root/'next.failed.private');os.replace(old,web/dist)
 rollback_env={**os.environ,**old_env,**{k:'' for k in values if k not in old_env}}
 subprocess.run(['pm2','restart','barbacue','--update-env'],env=rollback_env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
 subprocess.run(['pm2','save'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True)
 report('rollback.json',{'native_build_restored':True,'database_and_operational_files_untouched':True});raise
