import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {existsSync,readdirSync,readFileSync} from 'node:fs';
const proc=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='barbacue');if(!proc)throw Error('Missing app');
const env={...proc.pm2_env.env,...proc.pm2_env};const require=createRequire('/root/barbacue/apps/web/server.js');const {Pool}=require('pg');const pool=new Pool({connectionString:env.DATABASE_URL});
const tables=(await pool.query("SELECT to_regclass('erp_recipes') recipes,to_regclass('drizzle.__drizzle_migrations') migrations")).rows[0];
const counts=(await pool.query('select (select count(*) from products) products,(select count(*) from brand_catalog_products) managed,(select count(*) from orders) orders')).rows[0];
const builds=readdirSync('/root/barbacue/apps/web').filter(n=>n.startsWith('.next')&&existsSync('/root/barbacue/apps/web/'+n+'/BUILD_ID')).map(n=>({directory:n,id:readFileSync('/root/barbacue/apps/web/'+n+'/BUILD_ID','utf8')}));
console.log(JSON.stringify({script:proc.pm2_env.pm_exec_path,cwd:proc.pm2_env.pm_cwd,status:proc.pm2_env.status,port:env.PORT,builds,tables,counts,backupExists:existsSync('/root/deploy-backups/barbacue-erp-20260920'),previousExists:existsSync('/root/barbacue-before-erp-20260920')},null,2));await pool.end();
