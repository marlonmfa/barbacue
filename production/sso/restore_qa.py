"""Receive pg_dump through stdin into this task's private, disposable PostgreSQL."""
import os,pathlib,subprocess,sys,urllib.parse
root=pathlib.Path('/mnt/dados/barbacue-cog-sso-20261025')
values=dict(line.split('=',1) for line in(root/'qa.private.env').read_text().splitlines() if '='in line)
assert values['COGIA_SSO_DISPOSABLE_QA']=='1'
url=urllib.parse.urlsplit(values['DATABASE_URL']);assert url.path=='/barbacue_sso_candidate_qa'
name=sys.argv[1];assert name.startswith('cog-sso-qa-')
env={**os.environ,'PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':urllib.parse.unquote(url.username),'PGPASSWORD':urllib.parse.unquote(url.password),'PGDATABASE':'barbacue_sso_restore_qa'}
with(root/'restore.private.log').open('wb') as log:
 os.fchmod(log.fileno(),0o600)
 result=subprocess.run(['docker','exec','-i','-e','PGHOST','-e','PGPORT','-e','PGUSER','-e','PGPASSWORD','-e','PGDATABASE',name,'pg_restore','--no-owner','--no-acl','--exit-on-error','--dbname=barbacue_sso_restore_qa'],env=env,stdin=sys.stdin.buffer,stdout=log,stderr=log)
assert result.returncode==0,'Restore failed; diagnostic retained privately'
print('PASS: native snapshot restored into disposable QA PostgreSQL')
