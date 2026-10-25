"""Native PostgreSQL snapshot; encrypt before disk and decrypt only into a pipe."""
import hashlib,json,os,pathlib,subprocess,sys
from cryptography.fernet import Fernet
root=pathlib.Path('/root/deploy-backups/barbacue-cog-sso-20261025')
key=root/'database-backup-key.private';archive=root/'database.dump.encrypted'
def private(p,data):
 fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.fchmod(fd,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data)
if sys.argv[-1]=='--decrypt':
 sys.stdout.buffer.write(Fernet(key.read_bytes()).decrypt(archive.read_bytes()));sys.exit()
assert sys.argv[-1]=='--backup' and not key.exists()
node=r'''
import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {writeFileSync} from 'node:fs';
const root='/root/deploy-backups/barbacue-cog-sso-20261025';const p=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='barbacue');
writeFileSync(root+'/pm2.before.private.json',JSON.stringify(p),{mode:0o600});
const require=createRequire('/root/barbacue/apps/web/server.js');const {Client}=require('pg');const c=new Client({connectionString:p.pm2_env.DATABASE_URL});await c.connect();
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await c.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
 const tables=(await c.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','drizzle') ORDER BY table_schema,table_name")).rows;
 const counts={};for(const t of tables){const q=x=>'"'+x.replaceAll('"','""')+'"';counts[t.table_schema+'.'+t.table_name]=Number((await c.query('SELECT count(*) AS n FROM '+q(t.table_schema)+'.'+q(t.table_name))).rows[0].n);}
 writeFileSync(root+'/database-counts.private.json',JSON.stringify(counts),{mode:0o600});
 const url=new URL(p.pm2_env.DATABASE_URL);const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),...(url.searchParams.has('sslmode')?{PGSSLMODE:url.searchParams.get('sslmode')}:{})};
 const data=execFileSync('pg_dump',['--format=custom','--no-owner','--no-acl','--snapshot',snapshot],{env,maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']});
 process.stdout.write(data);
}finally{await c.query('ROLLBACK');await c.end();}
'''
data=subprocess.check_output(['node','--input-type=module','-e',node],stderr=subprocess.PIPE)
private(key,Fernet.generate_key());fernet=Fernet(key.read_bytes());encrypted=fernet.encrypt(data);private(archive,encrypted)
assert fernet.decrypt(encrypted)==data
private(root/'database-backup.private.json',(json.dumps({'encrypted_before_disk':True,'plaintext_sha256':hashlib.sha256(data).hexdigest(),'ciphertext_sha256':hashlib.sha256(encrypted).hexdigest(),'plaintext_bytes':len(data),'restore_pending':True})+'\n').encode())
print('PASS: consistent PostgreSQL snapshot encrypted before disk; native PM2 environment saved privately')
