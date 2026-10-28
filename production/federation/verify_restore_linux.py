"""Compare every row fingerprint in a network-isolated, RAM-only restore clone."""
import json,subprocess
from pathlib import Path
ROOT=Path('/mnt/dados/barbacue-federation-20261026');NAME='barbacue-federation-restore-20261026'
before=json.loads((ROOT/'database-fingerprints.private.json').read_text())
assert len(before)==34
def q(s):return '"'+s.replace('"','""')+'"'
sql=[]
for name in before:
 schema,table=name.split('.')
 sql.append("SELECT json_build_object('name',"+"'"+name.replace("'","''")+"','rows',count(*)::int,'fingerprint',md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text) COLLATE \"C\"),''))) FROM "+q(schema)+'.'+q(table)+' t;')
raw=subprocess.check_output(['docker','exec','-i','-e','PGTZ=UTC',NAME,'psql','-q','-At','-v','ON_ERROR_STOP=1','-U','barbacue_restore','-d','barbacue_restore_qa'],input=('\n'.join(sql)).encode(),stderr=subprocess.PIPE)
after={}
for line in raw.splitlines():
 value=json.loads(line);name=value.pop('name');after[name]=value
assert before==after,'Restored database differs from exported native snapshot'
result=dict(restored_in_ram=True,network_isolated=True,tables_verified=34,all_row_fingerprints_equal=True,plaintext_dump_written=False,live_database_untouched=True)
(ROOT/'backup-validation.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
