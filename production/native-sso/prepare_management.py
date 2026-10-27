"""Restore the submitted Gestão source baseline and apply the Cog delta only."""
import hashlib,io,json,pathlib,subprocess,sys,tarfile
pr=pathlib.Path(__file__).resolve().parent;repo=pr.parents[1];dst=pathlib.Path(sys.argv[1]);assert not dst.exists();dst.mkdir(parents=True)
j=json.loads((pr/'management-inputs.json').read_text());inputs=j['inputs'];names=['apps/mobile']
raw=subprocess.check_output(['git','-C',str(repo),'archive',j['base_revision'],'--',*names])
for source in [io.BytesIO(raw),pr/'management-overlay.tar.gz']:
 with tarfile.open(fileobj=source)if isinstance(source,io.BytesIO)else tarfile.open(source)as t:
  for m in t:
   if m.isdir():continue
   assert m.isfile() and not pathlib.Path(m.name).is_absolute() and '..' not in pathlib.Path(m.name).parts
   b=t.extractfile(m).read()
   p=dst/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
assert all(hashlib.sha256((dst/n).read_bytes()).hexdigest()==v['sha256'] for n,v in inputs.items())
support=json.loads((pr/'management-ios-support.json').read_text())['inputs']
with tarfile.open(pr/'management-ios-support.tar.gz')as t:
 for m in t:
  assert m.isfile()and m.name in support
  b=t.extractfile(m).read();assert hashlib.sha256(b).hexdigest()==support[m.name]
  p=dst/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
subprocess.run(['git','apply',str(pr/'management-integration.patch')],cwd=dst,check=True)
for n in ['apps/mobile/lib/management/cog_login.dart','apps/mobile/ios/Runner/Info-Gestao.plist','apps/mobile/pubspec.yaml','apps/mobile/pubspec.lock']:
 (dst/n).parent.mkdir(parents=True,exist_ok=True);(dst/n).write_bytes((repo/n).read_bytes())
print('PASS: 208 submitted mobile inputs plus explicit Cog changes; no unrelated retail changes')
