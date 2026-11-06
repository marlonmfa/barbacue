#!/usr/bin/env python3
"""Candidate build: same absolute path, dist dir and action key as the active build.
Live runtime is only read. Key goes via env and is never printed."""
import json,os,pathlib,subprocess,sys
root=pathlib.Path('/srv/barbacue-unified-20261106');ctx=root/'context'
live=pathlib.Path('/root/barbacue/apps/web/.next-mobile-session-20261024')
key=json.loads((live/'server/server-reference-manifest.json').read_text())['encryptionKey'];assert key
(root/'before-build.json').write_text(json.dumps({'build':(live/'BUILD_ID').read_text().strip()}))
cwd='/root/barbacue-cart-identity-20261031';img='node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9'
base=['docker','run','--rm','--cpus','2','--memory','5g','--mount',f'type=bind,source={ctx},target={cwd}','-w',cwd,'-e','NPM_CONFIG_CACHE=/tmp/npm','-e','NODE_OPTIONS=--max-old-space-size=3500','-e','NEXT_DIST_DIR=.next-mobile-session-20261024','-e','DATABASE_URL=postgresql://qa:qa@127.0.0.1:1/qa','-e','NEXT_TELEMETRY_DISABLED=1']
def ex(args,log,env=None):
    with open(root/log,'w') as f:
        os.chmod(root/log,0o600);subprocess.run(args,stdout=f,stderr=subprocess.STDOUT,check=True,env=env)
    print('ok',log,flush=True)
pkg=ctx/'package.json';orig=pkg.read_bytes();d=json.loads(orig);d['workspaces']=['apps/web','packages/ifood']
try:
    pkg.write_text(json.dumps(d,indent=2)+'\n');ex(base+[img,'npm','ci','--no-audit','--no-fund'],'install.log')
finally:
    pkg.write_bytes(orig)
sys.path.insert(0,str(root));from runtime_overlay import apply;apply(ctx,root);print('ok overlay',flush=True)
ex(base+['-w',cwd+'/apps/web',img,'npx','tsc','--noEmit'],'tsc.log')
ex(base+['-w',cwd+'/apps/web',img,'npx','tsx','--test','tests/unified-cart.test.ts','tests/social-auth.test.ts'],'tests.log')
ex(base+['-e','NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',img,'npm','run','build','--workspace=apps/web','--','--webpack'],'build.log',{**os.environ,'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY':key})
print('BUILD_ID',(ctx/'apps/web/.next-mobile-session-20261024/BUILD_ID').read_text())
