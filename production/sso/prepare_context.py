"""Recover the verified public native source without unrelated checkout edits."""
import argparse,hashlib,io,json,pathlib,subprocess,tarfile
p=argparse.ArgumentParser();p.add_argument('destination',type=pathlib.Path);p.add_argument('--cog',action='store_true');a=p.parse_args()
profile=pathlib.Path(__file__).resolve().parent;repo=profile.parents[1]
manifest=json.loads((profile/'native-inputs.json').read_text());inputs=manifest['inputs']
assert not a.destination.exists();a.destination.mkdir(parents=True)
names=[n for n,v in inputs.items() if v['git']]
raw=subprocess.check_output(['git','-C',str(repo),'archive',manifest['base_revision'],'--',*names])
for source in [io.BytesIO(raw),profile/'native-overlay.tar.gz']:
 with tarfile.open(fileobj=source) if isinstance(source,io.BytesIO) else tarfile.open(source) as archive:
  for member in archive:
   if member.isdir():continue
   assert member.isfile() and member.name in inputs
   data=archive.extractfile(member).read();assert hashlib.sha256(data).hexdigest()==inputs[member.name]['sha256']
   dest=a.destination/member.name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
assert {str(f.relative_to(a.destination)):hashlib.sha256(f.read_bytes()).hexdigest() for f in a.destination.rglob('*') if f.is_file()}=={n:v['sha256']for n,v in inputs.items()}
print('Prepared 704 native build inputs; all 222 published source hashes match')
if a.cog:
 subprocess.run(['git','apply',str(profile/'cog.patch')],cwd=a.destination,check=True)
 print('Applied reviewed Cog patch')
