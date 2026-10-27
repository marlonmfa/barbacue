import json,os,secrets,subprocess,time,shutil
from pathlib import Path
assert os.environ.get('BARBACUE_DISPOSABLE_QA')=='1'
os.umask(0o077);root=Path('/mnt/dados/barbacue-native-cog-20261026');name='barbacue-native-qa-20261026';network=name
run=lambda a:subprocess.check_output(a,stderr=subprocess.PIPE)
assert not run(['docker','ps','-aq','--filter','name='+name]).strip()
creds=json.loads((root/'qa-credentials.private.json').read_text());common=dict(BARBACUE_DISPOSABLE_QA='1',TEST_USER_EMAIL=creds['TEST_USER_EMAIL'],TEST_USER_PASSWORD=creds['TEST_USER_PASSWORD'])
def envfile(name,values):
 p=root/name;p.write_text(''.join(k+'='+v+'\n'for k,v in dict(common,**values).items()));p.chmod(0o600);return str(p)
client=dict(application_type='native',token_endpoint_auth_method='none',redirect_uris=['http://127.0.0.1/oauth/cog/callback','com.lanchesdobarba.gestao://oauth/cog/callback'])
idp=envfile('qa-idp.private.env',dict(APP_ROLE='idp',DATA_DIR='/data',IDP_ISSUER='http://127.0.0.1:54796',IDP_CLIENTS=json.dumps({'barbacue-native':client},separators=(',',':')),IDP_DEV_USERS=creds['TEST_USER_EMAIL']+':'+creds['TEST_USER_PASSWORD'],IDP_ALLOWED_DOMAINS=creds['TEST_USER_EMAIL'].split('@')[1]))
run(['docker','network','create','--internal','--subnet','10.247.99.0/28',network])
run(['docker','run','-d','--name',name+'-idp','--network',network,'--memory','384m','--tmpfs','/data:rw,size=32m,mode=1777','--env-file',idp,'--mount','type=bind,src='+str(root/'qa/idp.py')+',dst=/srv/qa_idp.py,readonly','--entrypoint','uvicorn','cog-control:native-id-20261026','qa_idp:app','--host','0.0.0.0','--port','8000'])
pw=secrets.token_urlsafe(24)
db=envfile('qa-db.private.env',dict(POSTGRES_USER='qa',POSTGRES_PASSWORD=pw,POSTGRES_DB='barbacue_federation_qa'))
run(['docker','run','-d','--name',name+'-db','--network',network,'--memory','384m','--tmpfs','/var/lib/postgresql/data:rw,size=96m,mode=1777','--env-file',db,'postgres:16-alpine'])
for _ in range(40):
 if subprocess.run(['docker','exec',name+'-db','pg_isready','-U','qa'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
 time.sleep(.5)
with Path('/mnt/dados/barbacue-federation-20261026/schema.private.dump').open('rb')as f:
 subprocess.run(['docker','exec','-i',name+'-db','pg_restore','--schema-only','--no-owner','--no-acl','-U','qa','-d','barbacue_federation_qa'],stdin=f,check=True,stdout=subprocess.DEVNULL)
standalone=root/'context/apps/web/.next-mobile-session-20261024/standalone/tmp/app-store-release-20261024/source'
dist=root/'context/apps/web/.next-mobile-session-20261024'
static=standalone/'apps/web/.next-mobile-session-20261024/static'
if not static.exists():shutil.copytree(dist/'static',static,copy_function=os.link)
shutil.copyfile(root/'qa/web.mjs',standalone/'qa.mjs')
backend=envfile('qa-api.private.env',dict(COGIA_SSO_DISPOSABLE_QA='1',DATABASE_URL='postgresql://qa:'+pw+'@'+name+'-db:5432/barbacue_federation_qa',ADMIN_COOKIE_SECRET=secrets.token_urlsafe(48),QA_NATIVE_ISSUER='http://'+name+'-idp:8000'))
run(['docker','run','-d','--name',name+'-api','--network',network,'--memory','1g','--env-file',backend,'--mount','type=bind,src='+str(standalone)+',dst=/candidate','--mount','type=bind,src='+str(root/'qa')+',dst=/qa,readonly','--mount','type=bind,src='+str(root/'context/node_modules')+',dst=/candidate/node_modules,readonly','-w','/candidate','cog-barbacue:build-env-20261025','node','qa.mjs'])
addresses={kind:json.loads(run(['docker','inspect',name+'-'+kind]))[0]['NetworkSettings']['Networks'][network]['IPAddress']for kind in ['idp','api']}
(root/'qa-address.json').write_text(json.dumps(addresses)+'\n');print(json.dumps(addresses))
