"""Reproduce published 1.0.0 source plus Cog only; never use the dirty 1.2 tree."""
import hashlib,json,pathlib,subprocess,sys,tarfile
pr=pathlib.Path(__file__).resolve().parent;repo=pr.parents[1];dst=pathlib.Path(sys.argv[1]);assert not dst.exists();dst.mkdir(parents=True)
expected=json.loads((pr/'desktop-before.json').read_text())['source_files']
with tarfile.open(pr/'desktop-native-baseline.tar.gz')as t:
 for m in t:
  if m.isdir():continue
  assert m.isfile()and m.name in expected
  b=t.extractfile(m).read();assert hashlib.sha256(b).hexdigest()==expected[m.name]
  p=dst/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
subprocess.run(['git','apply',str(pr/'desktop-published-integration.patch')],cwd=dst,check=True)
for n in ['cog-oauth.cjs','cog-session.mjs']:(dst/'src'/n).write_bytes((repo/'apps/desktop/src'/n).read_bytes())
metadata=json.loads((dst/'package.json').read_text());metadata['version']='1.0.1'
# Builder configuration/toolchain from the committed native release, not dirty 1.2.
build=json.loads(subprocess.check_output(['git','-C',str(repo),'show','ddc06e2:apps/desktop/package.json']))
metadata['devDependencies']=build['devDependencies'];metadata['build']=build['build'];(dst/'package.json').write_text(json.dumps(metadata,indent=2)+'\n')
assert metadata['devDependencies']=={'electron':'44.3.0','electron-builder':'26.15.3'}
assert all(hashlib.sha256((dst/n).read_bytes()).hexdigest()==v for n,v in expected.items()if n not in ['src/main.mjs','package.json'])
print('PASS: 14 native public files identical; main hooks + 2 Cog modules + version metadata only')
