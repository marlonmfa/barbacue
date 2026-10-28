"""Private Linux build at the original path, using the preserved actions key."""
import argparse,base64,json,os,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('context',type=pathlib.Path);p.add_argument('--install',action='store_true');p.add_argument('--key',type=pathlib.Path,required=True);p.add_argument('--log',type=pathlib.Path,required=True);a=p.parse_args()
key=json.loads(a.key.read_text())['NEXT_SERVER_ACTIONS_ENCRYPTION_KEY'];assert len(base64.b64decode(key,validate=True)) in (16,24,32)
cwd='/Users/marlonalcantara/Repos/barbacue.cog.ia.br/tmp/app-store-release-20261024/source'
env={**os.environ,'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY':key}
args=['docker','run','--rm','--user',f'{os.getuid()}:{os.getgid()}','--cpus','1.5','--memory','4g',
 '--mount',f'type=bind,source={a.context.resolve()},target={cwd}','-w',cwd,'-e','NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']
for k,v in {'NPM_CONFIG_CACHE':'/tmp/npm-cache','NODE_OPTIONS':'--max-old-space-size=3072','NEXT_DIST_DIR':'.next-mobile-session-20261024','DATABASE_URL':'postgresql://qa:qa@127.0.0.1:1/qa','ADMIN_COOKIE_SECRET':'qa-build-only-not-an-operational-secret'}.items():args+=['-e',f'{k}={v}']
command=('npm ci --no-audit --no-fund && ' if a.install else '')+'npm run build --workspace=apps/web -- --webpack'
args+=['cog-barbacue:build-env-20261025','sh','-c',command]
with a.log.open('w') as log:
 os.chmod(a.log,0o600);subprocess.run(args,env=env,stdout=log,stderr=subprocess.STDOUT,check=True)
print('PASS: verified native-source Linux build; action key kept private')
