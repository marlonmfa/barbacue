"""Recover current published Barbacue sources, then apply external federation only."""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('destination',type=Path);a=p.parse_args()
profile=Path(__file__).resolve().parent
subprocess.run(['python3',str(profile.parent/'sso/prepare_context.py'),str(a.destination),'--cog'],check=True)
subprocess.run(['git','apply',str(profile/'cog.patch')],cwd=a.destination,check=True)
changed=json.loads((profile/'changed-files.json').read_text())
assert all(hashlib.sha256((a.destination/n).read_bytes()).hexdigest()==v for n,v in changed.items())
# The single versioned Dockerfile also defines the official native-build SDK.
(a.destination/'apps/web/Dockerfile').write_bytes((profile.parents[1]/'apps/web/Dockerfile').read_bytes())
print('PASS: native source factory plus reviewed federation delta reconstructed')
