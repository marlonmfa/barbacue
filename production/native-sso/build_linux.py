"""Compile the native-auth candidate with the exact active baseline toolchain."""
import base64,json,os,pathlib,subprocess,sys
root=pathlib.Path('/mnt/dados/barbacue-native-cog-20261026');previous=pathlib.Path('/mnt/dados/barbacue-federation-20261026');context=root/'context'
# Existing frozen SDK/dependencies are copied only after the lock comparison.
assert __import__('hashlib').sha256((context/'package-lock.json').read_bytes()).hexdigest()=='fcf0edf1f3c4bcab3527cab2b8581a72db38ccb9750ea214c3f32ca318c8052e'
if(previous/'context/package-lock.json').exists():assert(context/'package-lock.json').read_bytes()==(previous/'context/package-lock.json').read_bytes()
if(context/'node_modules').exists():assert '--rebuild' in sys.argv
elif(previous/'context/node_modules').is_dir():
 subprocess.run(['cp','-a','--reflink=auto',str(previous/'context/node_modules'),str(context/'node_modules')],check=True)
 for name in ['apps/web/node_modules','packages/scraper/node_modules']:
  if(previous/'context'/name).is_dir():
   subprocess.run(['cp','-a','--reflink=auto',str(previous/'context'/name),str(context/name)],check=True)
else:
 cwd='/Users/marlonalcantara/Repos/barbacue.cog.ia.br/tmp/app-store-release-20261024/source'
 subprocess.run(['docker','run','--rm','--user',f'{os.getuid()}:{os.getgid()}','--mount',f'type=bind,source={context},target={cwd}','-w',cwd,'-e','PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1','-e','PUPPETEER_SKIP_DOWNLOAD=1','-e','NPM_CONFIG_CACHE=/tmp/npm-cache','cog-barbacue:build-env-20261025','npm','ci'],check=True)
# The key location is supplied privately on the Linux builder; never on the Mac.
keyfile=pathlib.Path(os.environ['BARBACUE_NATIVE_ACTION_KEY_FILE']);key=json.loads(keyfile.read_text())['NEXT_SERVER_ACTIONS_ENCRYPTION_KEY'];assert len(base64.b64decode(key,validate=True))in(16,24,32)
cwd='/Users/marlonalcantara/Repos/barbacue.cog.ia.br/tmp/app-store-release-20261024/source'
args=['docker','run','--rm','--user',f'{os.getuid()}:{os.getgid()}','--cpus','2','--memory','5g','--mount',f'type=bind,source={context},target={cwd}','-w',cwd,'-e','NEXT_SERVER_ACTIONS_ENCRYPTION_KEY']
for k,v in {'NPM_CONFIG_CACHE':'/tmp/npm-cache','NODE_OPTIONS':'--max-old-space-size=4096','NEXT_DIST_DIR':'.next-mobile-session-20261024','DATABASE_URL':'postgresql://qa:qa@127.0.0.1:1/qa','ADMIN_COOKIE_SECRET':'qa-build-only-not-an-operational-secret','NEXT_TELEMETRY_DISABLED':'1'}.items():args+=['-e',k+'='+v]
args+=['cog-barbacue:build-env-20261025','sh','-c','npm run build --workspace=apps/web -- --webpack']
logfile=root/('build-final.log'if '--rebuild'in sys.argv else 'build.log')
with logfile.open('w')as log:
 os.chmod(logfile,0o600);subprocess.run(args,env={**os.environ,'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY':key},stdout=log,stderr=subprocess.STDOUT,check=True)
print('PASS: Linux candidate compiled with frozen dependencies and original action key')
