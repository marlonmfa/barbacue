"""Add only the confidential Barbacue RP to the existing IDP; no other service restart."""
import copy,http.client,json,os,platform,secrets,socket,subprocess,sys,tempfile,time
from pathlib import Path
assert platform.system()=='Linux'
assert '--publish' in sys.argv
os.umask(0o077)
ROOT=Path('/opt/cog-oidc-clients-20261026/barbacue-external');ROOT.mkdir(parents=True,mode=0o700,exist_ok=True)
NAME='cog-control-id-1';CONTROL='cog-control-control-1';BACKUP=NAME+'-before-barbacue-external-20261026'
ENV=Path('/opt/control.cog.ia.br/.env');COMPOSE=ENV.parent/'docker-compose.yml'
class Docker(http.client.HTTPConnection):
 def __init__(self):super().__init__('localhost',timeout=65)
 def connect(self):self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);self.sock.connect('/var/run/docker.sock')
def api(method,path,payload=None):
 c=Docker();c.request(method,'/v1.47'+path,body=json.dumps(payload) if payload is not None else None,headers={'Content-Type':'application/json'})
 r=c.getresponse();raw=r.read();c.close();assert r.status<300,(method,path,r.status)
 return json.loads(raw) if raw else None
def run(args,**kw):return subprocess.check_output(args,stderr=subprocess.PIPE,**kw)
def atomic(path,data):
 st=path.stat();fd,name=tempfile.mkstemp(prefix='.cog-client-',dir=path.parent)
 try:
  with os.fdopen(fd,'w') as f:f.write(data);f.flush();os.fsync(f.fileno())
  os.chmod(name,st.st_mode&0o777);os.chown(name,st.st_uid,st.st_gid);os.replace(name,path)
 finally:Path(name).unlink(missing_ok=True)
assert not (ROOT/'before.encrypted').exists(),'Never replace checkpoint'
current=api('GET',f'/containers/{NAME}/json');control=api('GET',f'/containers/{CONTROL}/json')
assert current['Image']=='sha256:ff7998cf0dd4e14092ae031329f80aa4ea740555f6b402edc421973f32297dce'
assert current['State'].get('Health',{}).get('Status')=='healthy'
env=dict(s.split('=',1) for s in current['Config']['Env']);clients=json.loads(env['IDP_CLIENTS'])
assert 'barbacue-external' not in clients and {'control','crm-gow'}.issubset(clients)
before_env=ENV.read_text();before_compose=COMPOSE.read_text()
snapshot=r'''
import base64,hashlib,json,os,sqlite3,sys
from pathlib import Path
from cryptography.fernet import Fernet
p=json.load(sys.stdin);root=Path(os.environ['DATA_DIR']);db=sqlite3.connect('file:'+str(root/'idp.sqlite3')+'?mode=ro',uri=True)
m=sqlite3.connect(':memory:');db.backup(m);db.close();raw=m.serialize();restored=sqlite3.connect(':memory:');restored.deserialize(raw)
assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
counts={}
for (table,) in m.execute("SELECT name FROM sqlite_master WHERE type='table'"):
 assert table.replace('_','').isalnum()
 assert m.execute('SELECT * FROM '+table).fetchall()==restored.execute('SELECT * FROM '+table).fetchall()
 counts[table]=m.execute('SELECT count(*) FROM '+table).fetchone()[0]
signing=(root/'idp-signing-key.pem').read_bytes();p.update(database=base64.b64encode(raw).decode(),signing_key=base64.b64encode(signing).decode())
key=Fernet.generate_key();serialized=json.dumps(p).encode();encrypted=Fernet(key).encrypt(serialized);assert Fernet(key).decrypt(encrypted)==serialized
print(json.dumps(dict(key=key.decode(),encrypted=encrypted.decode(),summary=dict(restored_in_ram=True,tables=counts,signing_key_sha256=hashlib.sha256(signing).hexdigest()))))
'''
checkpoint=json.loads(run(['docker','exec','-i',NAME,'python','-c',snapshot],input=json.dumps(dict(container=current,control=control,env=before_env,compose=before_compose)).encode()))
for name,value in [('before-key.private',checkpoint['key']),('before.encrypted',checkpoint['encrypted'])]:(ROOT/name).write_text(value)
client=dict(secret=secrets.token_urlsafe(48),name='Barbacue (Chelas/Barbadog)',redirect_uris=['https://chelas.hirableaiagents.com/api/auth/cog/callback','https://barbadog.hirableaiagents.com/api/auth/cog/callback'],home='https://chelas.hirableaiagents.com/admin')
clients['barbacue-external']=client;serialized=json.dumps(clients,ensure_ascii=True,separators=(',',':'))
credentials=dict(COG_OIDC_ORIGINS=json.dumps({'https://chelas.hirableaiagents.com':'chelas','https://barbadog.hirableaiagents.com':'barbadog'},separators=(',',':')),COG_OIDC_ISSUER='https://id.cog.ia.br',COG_OIDC_CLIENT_ID='barbacue-external',COG_OIDC_CLIENT_SECRET=client['secret'])
(ROOT/'rp.private.env').write_text(''.join(k+'='+v+'\n' for k,v in credentials.items()))
lines=before_env.splitlines(keepends=True);assert sum(s.startswith('IDP_CLIENTS=') for s in lines)==1
after_env=''.join("IDP_CLIENTS='"+serialized+"'\n" if s.startswith('IDP_CLIENTS=') else s for s in lines)
config=copy.deepcopy(current['Config']);config['Env']=[('IDP_CLIENTS='+serialized) if s.startswith('IDP_CLIENTS=') else s for s in config['Env']]
assert all(not v.get('IPAMConfig') for v in current['NetworkSettings']['Networks'].values())
config.update(HostConfig=copy.deepcopy(current['HostConfig']),NetworkingConfig={'EndpointsConfig':{n:{'Aliases':v['Aliases']} for n,v in current['NetworkSettings']['Networks'].items()}})
created=None;renamed=False
try:
 atomic(ENV,after_env)
 parsed=json.loads(run(['docker','compose','-f',str(COMPOSE),'config','--format','json']))
 assert json.loads(parsed['services']['id']['environment']['IDP_CLIENTS'])==clients
 assert api('GET',f'/containers/{NAME}/json')['Id']==current['Id']
 api('POST',f'/containers/{NAME}/stop?t=20');api('POST',f'/containers/{NAME}/rename?name={BACKUP}');renamed=True
 created=api('POST',f'/containers/create?name={NAME}',config)['Id'];api('POST',f'/containers/{created}/start')
 for _ in range(150):
  st=api('GET',f'/containers/{created}/json')['State']
  if st.get('Health',{}).get('Status')=='healthy':break
  assert st['Running'];time.sleep(1)
 else:raise RuntimeError('IDP health timeout')
 now=api('GET',f'/containers/{created}/json')
 assert now['HostConfig']==current['HostConfig'] and now['Image']==current['Image']
 for field in ['Cmd','Entrypoint','WorkingDir','User','Healthcheck']:assert now['Config'][field]==current['Config'][field]
 actual=dict(s.split('=',1) for s in now['Config']['Env']);assert json.loads(actual.pop('IDP_CLIENTS'))==clients
 original=dict(env);original.pop('IDP_CLIENTS');assert actual==original
 assert api('GET',f'/containers/{CONTROL}/json')['Id']==control['Id'] and COMPOSE.read_text()==before_compose
 # Reusing snapshot verifier also proves key and all preexisting SQLite rows retained.
 verify=r'''
import base64,collections,hashlib,json,os,sqlite3,sys
from pathlib import Path
from cryptography.fernet import Fernet
x=json.load(sys.stdin);p=json.loads(Fernet(x['key'].encode()).decrypt(x['encrypted'].encode()));root=Path(os.environ['DATA_DIR'])
assert (root/'idp-signing-key.pem').read_bytes()==base64.b64decode(p['signing_key'])
a=sqlite3.connect(':memory:');a.deserialize(base64.b64decode(p['database']));b=sqlite3.connect('file:'+str(root/'idp.sqlite3')+'?mode=ro',uri=True)
for (t,) in a.execute("SELECT name FROM sqlite_master WHERE type='table'"):
 assert t.replace('_','').isalnum();assert not (collections.Counter(a.execute('SELECT * FROM '+t))-collections.Counter(b.execute('SELECT * FROM '+t)))
print('PASS: signing key and existing rows retained')
'''
 run(['docker','exec','-i',NAME,'python','-c',verify],input=json.dumps(checkpoint).encode())
 api('POST',f'/containers/{BACKUP}/update',{'RestartPolicy':{'Name':'no'}})
 report=dict(client='barbacue-external',redirect_uris=client['redirect_uris'],published=True,healthy=True,control_restarted=False,existing_client_preserved=True,signing_key_preserved=True,database_preserved=True,checkpoint=checkpoint['summary'])
 (ROOT/'published.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
except BaseException:
 if created:
  api('POST',f'/containers/{created}/stop?t=15');api('POST',f'/containers/{created}/rename?name={NAME}-failed-barbacue-external-20261026')
 if renamed:api('POST',f'/containers/{BACKUP}/rename?name={NAME}');api('POST',f'/containers/{NAME}/start')
 atomic(ENV,before_env);raise
