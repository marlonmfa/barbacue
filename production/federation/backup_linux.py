"""Native read-only snapshot: encrypt database and PM2 config before writing disk."""
import base64,json,os,subprocess,sys
from pathlib import Path
from cryptography.fernet import Fernet
ROOT=Path('/root/deploy-backups/barbacue-federation-20261026')
os.umask(0o077);ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
def private(p,data):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
if '--decrypt-db' in sys.argv:
 sys.stdout.buffer.write(Fernet((ROOT/'before-key.private').read_bytes()).decrypt((ROOT/'database.dump.encrypted').read_bytes()));sys.exit()
assert '--backup' in sys.argv and not (ROOT/'before-key.private').exists()
node=r'''
import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const processes=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'}));const p=processes.find(x=>x.name==='barbacue');
const require=createRequire('/root/barbacue/apps/web/server.js');const {Client}=require('pg');const c=new Client({connectionString:p.pm2_env.DATABASE_URL});await c.connect();
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL TIME ZONE 'UTC'");
 const snapshot=(await c.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
 const tables=(await c.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','drizzle') ORDER BY table_schema,table_name")).rows;
 const fingerprints={};const q=x=>'"'+x.replaceAll('"','""')+'"';
 for(const t of tables){
  const query=`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text) COLLATE "C"),'')) AS fingerprint FROM ${q(t.table_schema)}.${q(t.table_name)} t`;
  fingerprints[t.table_schema+'.'+t.table_name]=(await c.query(query)).rows[0];
 }
 const u=new URL(p.pm2_env.DATABASE_URL);const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})};
 const data=execFileSync('pg_dump',['--format=custom','--no-owner','--no-acl','--snapshot',snapshot],{env,maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
 process.stdout.write(JSON.stringify({processes,fingerprints,database:data.toString('base64')}));
}finally{await c.query('ROLLBACK');await c.end();}
'''
payload=json.loads(subprocess.check_output(['node','--input-type=module','-e',node],stderr=subprocess.PIPE))
assert len(payload['fingerprints'])==34
raw=base64.b64decode(payload.pop('database'));assert raw.startswith(b'PGDMP')
key=Fernet.generate_key();f=Fernet(key);encrypted=f.encrypt(raw);assert f.decrypt(encrypted)==raw
private(ROOT/'before-key.private',key);private(ROOT/'database.dump.encrypted',encrypted)
payload['purpose']='barbacue-federation-before-v1';serialized=json.dumps(payload).encode()
private(ROOT/'before.encrypted',f.encrypt(serialized));assert json.loads(f.decrypt((ROOT/'before.encrypted').read_bytes()))==payload
private(ROOT/'database-fingerprints.private.json',json.dumps(payload['fingerprints']).encode())
summary=dict(encrypted_before_disk=True,consistent_exported_snapshot=True,tables=34,plaintext_dump_bytes=len(raw),native_database_untouched=True,restore_pending=True)
private(ROOT/'backup-summary.json',(json.dumps(summary,indent=2)+'\n').encode());print(json.dumps(summary))
