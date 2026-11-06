#!/usr/bin/env python3
"""Phases: prepare (backup build+db+pm2, migration 0021, candidate smoke) and swap (guarded, auto-rollback).
Never prints secrets. Only barbacue is restarted."""
import json,os,pathlib,re,shutil,subprocess,sys,time,urllib.request,urllib.error
root=pathlib.Path('/srv/barbacue-unified-20261106');ctx=root/'context';web=pathlib.Path('/root/barbacue/apps/web');D='.next-mobile-session-20261024'
live=web/D;cand=ctx/'apps/web'/D;bk=root/os.environ.get('BK_NAME','backup');img='node:22.23.2-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9'
run=lambda *a,**k:subprocess.run(a,check=True,text=True,capture_output=True,**k).stdout
procs=lambda:json.loads(run('pm2','jlist'))
me=lambda ps:[p for p in ps if p['name']=='barbacue'][0]
sf=root/'social.private.json';social=json.loads(sf.read_text()) if sf.exists() else {}
def app_env():
    e=me(procs())['pm2_env'];return {k:v for k,v in e['env'].items() if isinstance(v,str)}
expected=json.loads((root/'before-build.json').read_text())['build']
def req(path,port,host='barbacue.cog.ia.br',method='GET',body=None):
    r=urllib.request.Request(f'http://127.0.0.1:{port}{path}',method=method,data=body,headers={'Host':host,'X-Forwarded-Host':host,'X-Forwarded-Proto':'https','Content-Type':'application/json'})
    class N(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*a,**k):return None
    try:
        x=urllib.request.build_opener(N).open(r,timeout=30);return x.status,x.read(),x.headers
    except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
def ready(port):
    for _ in range(120):
        try:
            if req('/admin/login',port)[0]==200:return
        except Exception:pass
        time.sleep(.5)
    raise Exception('not ready')
def checks(port):
    assert req('/api/admin/auth',port)[0]==401 and req('/api/admin/staff',port)[0]==401
    ids={}
    for host,brand in [('barbacue.cog.ia.br','barbacue'),('chelas.hirableaiagents.com','chelas'),('barbadog.hirableaiagents.com','barbadog')]:
        assert req('/pedir',port,host)[0]==200,brand;assert req('/',port,host)[0]==200,brand
        s,b,_=req(f'/brand/logos-20261030/{brand}.png',port,host);assert s==200
        s,b,_=req(f'/api/products?brand={brand}',port,host);assert s==200
        ps=[p for c in json.loads(b) for p in c['products']];assert ps and all(p['brand']==brand and isinstance(p['shared'],bool) for p in ps),brand
        ids[brand]=ps[0]['id']
        s,b,_=req('/conta',port,host);t=b.decode();assert s==200 and 'Entrar com Google' in t and 'Entrar com Apple' in t,('conta',brand)
        s,_,h=req('/api/auth/google',port,host);assert s in(302,303,307) and h['location'].startswith('https://accounts.google.com/'),('g',brand,s)
        assert f'{host}%2Fapi%2Fauth%2Fgoogle%2Fcallback' in h['location'],('cb',brand)
        s,_,h=req('/api/auth/apple',port,host);assert s in(302,303,307) and h['location'].startswith('https://appleid.apple.com/'),('a',brand,s)
    # Sem gravar: um item inexistente é recusado antes de qualquer insert, e prova a busca por marca.
    base={'customerName':'Teste','customerPhone':'47999990000','deliveryAddress':'Rua Teste 123 Centro','paymentMethod':'cash'}
    body=dict(base,items=[{'productId':ids['chelas'],'qty':1,'brand':'chelas'},{'productId':99999999,'qty':1,'brand':'barbadog'}])
    s,b,_=req('/api/orders',port,'barbacue.cog.ia.br','POST',json.dumps(body).encode());assert s==422 and b'99999999' in b,(s,b[:120])
    return ids
def prepare():
    assert (live/'BUILD_ID').read_text().strip()==expected,'Active build changed'
    a=json.loads((live/'server/app-paths-manifest.json').read_text());b=json.loads((cand/'server/app-paths-manifest.json').read_text());assert all(k in b for k in a),'Route missing'
    assert json.loads((live/'server/server-reference-manifest.json').read_text())['encryptionKey']==json.loads((cand/'server/server-reference-manifest.json').read_text())['encryptionKey']
    bk.mkdir(mode=0o700,exist_ok=False)
    env=app_env();url=env['DATABASE_URL']
    subprocess.run(['pg_dump','--format=custom','--no-owner','--file',str(bk/'barbacue.dump'),url],check=True,capture_output=True)
    n=len(run('pg_restore','-l',str(bk/'barbacue.dump')).splitlines());assert n>50
    shutil.copy2('/root/.pm2/dump.pm2',bk/'dump.pm2')
    shutil.copytree(live,bk/'live-build',symlinks=True,ignore=shutil.ignore_patterns('cache','standalone'))
    assert (bk/'live-build/BUILD_ID').read_text().strip()==expected
    q="select count(*) from information_schema.columns where table_name='customer_accounts' and column_name in ('google_id','apple_id')"
    have=run('psql',url,'-At','-c',q).strip()
    if have=='0':
        sql=(ctx/'apps/web/drizzle/migrations/0021_google_apple_login.sql').read_text().replace('--> statement-breakpoint','')
        subprocess.run(['psql',url,'-v','ON_ERROR_STOP=1','--single-transaction'],input=sql,text=True,check=True,capture_output=True);mig='applied'
    else: assert have=='2';mig='already'
    assert run('psql',url,'-At','-c',q).strip()=='2'
    # Candidata com o ambiente real, em porta isolada.
    ef=root/'cand.env';ef.touch(mode=0o600);full={**env,**social,'PORT':'43303','NEXT_DIST_DIR':D}
    ef.write_text(''.join(f'{k}={v}\n' for k,v in full.items() if '\n' not in v and re.fullmatch(r'[A-Z_][A-Z0-9_]*',k) and k not in('PATH','HOME','PWD','OLDPWD','HOSTNAME','SHLVL','_')))
    name='barbacue-candidate-20261106';cwd='/root/barbacue-cart-identity-20261031'
    subprocess.run(['docker','rm','-f',name],capture_output=True)
    run('docker','run','-d','--rm','--name',name,'--network','host','--cpus','2','--memory','2g','--env-file',str(ef),'--mount',f'type=bind,source={ctx},target={cwd}','-w',cwd+'/apps/web',img,'node',cwd+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','43303')
    try:
        ready(43303);ids=checks(43303)
    finally:
        subprocess.run(['docker','rm','-f',name],capture_output=True);ef.unlink()
    print(json.dumps({'prepared':True,'routes':[len(a),len(b)],'dumpEntries':n,'dumpBytes':(bk/'barbacue.dump').stat().st_size,'migration':mig,'candidateChecks':'pass','sampleIds':ids,'candidateBuild':(cand/'BUILD_ID').read_text().strip()}))
def restart(extra):
    pm2=shutil.which('pm2');env={**os.environ,**app_env(),**extra}
    subprocess.run([pm2,'restart','barbacue','--update-env'],check=True,capture_output=True,env=env)
def swap():
    before=procs();p=me(before);assert p['pm2_env']['status']=='online';port=int(app_env().get('PORT',3007))
    assert (live/'BUILD_ID').read_text().strip()==expected,'Concurrent publication'
    others=lambda ps:[(x['name'],x['pid'],x['pm2_env'].get('pm_uptime')) for x in ps if x['name']!='barbacue']
    new=bk/'candidate-runtime';shutil.copytree(cand,new,symlinks=True,ignore=shutil.ignore_patterns('cache','standalone'))
    shutil.copytree(live/'static',new/'static',dirs_exist_ok=True,copy_function=lambda s,d:(os.path.exists(d) or shutil.copy2(s,d)))
    swapped=False;oldenv=app_env()
    try:
        run('pm2','stop','barbacue')
        if (live/'cache').exists():shutil.copytree(live/'cache',new/'cache',symlinks=True,dirs_exist_ok=True)
        for f in ['server/app/api/instagram.meta','server/app/api/instagram.body']:
            if (live/f).exists():(new/f).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(live/f,new/f)
        live.rename(bk/'previous-runtime');swapped=True;new.rename(live)
        restart(social);ready(port);ids=checks(port)
        assert others(procs())==others(before),'Other process changed'
        run('pm2','save')
        print(json.dumps({'published':True,'previous':expected,'build':(live/'BUILD_ID').read_text().strip(),'sampleIds':ids,'whatsappUntouched':True}))
    except Exception as e:
        print('ROLLBACK',repr(e)[:300]);subprocess.run(['pm2','stop','barbacue'],capture_output=True)
        if swapped:
            if live.exists():live.rename(bk/'failed-runtime')
            (bk/'previous-runtime').rename(live)
        restart({k:v for k,v in oldenv.items()});ready(port);print('rolled back to',(live/'BUILD_ID').read_text().strip());sys.exit(1)
{'prepare':prepare,'swap':swap}[sys.argv[1]]()
