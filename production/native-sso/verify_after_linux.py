"""Read-only proof that local staff/customer identities and credentials were preserved."""
import json,subprocess
from pathlib import Path
from cryptography.fernet import Fernet
ROOT=Path('/root/deploy-backups/barbacue-native-cog-20261026')
before=json.loads(Fernet((ROOT/'before-key.private').read_bytes()).decrypt((ROOT/'before.encrypted').read_bytes()))
node=r'''
import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
const p=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='barbacue');
const require=createRequire('/root/barbacue/apps/web/server.js');const {Client}=require('pg');const c=new Client({connectionString:p.pm2_env.DATABASE_URL});await c.connect();
try{
 await c.query('BEGIN READ ONLY');await c.query("SET LOCAL TIME ZONE 'UTC'");const out={};
 for(const table of ['staff_users','customer_accounts'])out['public.'+table]=(await c.query(`SELECT count(*)::int AS rows,md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text) COLLATE "C"),'')) AS fingerprint FROM "public"."${table}" t`)).rows[0];
 const eligible=(await c.query("SELECT (SELECT count(*)::int FROM staff_users WHERE lower(username)=$1 AND active=true AND must_change_password=false) AS staff,(SELECT count(*)::int FROM customer_accounts WHERE lower(email)=$1) AS customers",['marlon@cog.ia.br'])).rows[0];
 process.stdout.write(JSON.stringify({fingerprints:out,eligible}));
}finally{await c.query('ROLLBACK');await c.end();}
'''
after=json.loads(subprocess.check_output(['node','--input-type=module','-e',node],stderr=subprocess.PIPE))
for table,values in after['fingerprints'].items():assert values==before['fingerprints'][table],table+' identities changed'
result=dict(staff_and_customer_rows_unchanged=True,roles_passwords_first_access_permissions_preserved=True,accounts_provisioned=0,eligible_owner_accounts=after['eligible'])
(ROOT/'after-verified.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
