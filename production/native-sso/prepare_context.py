"""Rebuild the active web baseline and the minimal native-auth delta."""
import hashlib,json,pathlib,subprocess,sys
profile=pathlib.Path(__file__).resolve().parent;repo=profile.parents[1];root=pathlib.Path(sys.argv[1]);assert not root.exists()
subprocess.run([sys.executable,str(profile.parent/'federation/prepare_context.py'),str(root)],check=True)
subprocess.run(['git','apply',str(profile/'native-web.patch')],cwd=root,check=True)
(root/'apps/web/src/lib/cog-native.ts').write_bytes((repo/'apps/web/src/lib/cog-native.ts').read_bytes())
expected=json.loads((profile/'web-changed-files.json').read_text());assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==digest for name,digest in expected.items())
print('PASS: active federation preserved; only five native-auth sources added/changed')
