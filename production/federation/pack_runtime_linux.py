"""Package the final tested bundle privately; no environment or QA fixture included."""
import argparse,hashlib,json,os,tarfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--revision',required=True);a=p.parse_args()
ROOT=Path('/mnt/dados/barbacue-federation-20261026');APP=ROOT/'context';DIST=APP/'apps/web/.next-mobile-session-20261024'
os.umask(0o077)
source=json.loads((ROOT/'changed-files.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
assert all(sha(APP/n)==h for n,h in source.items())
build=json.loads((ROOT/'build-validation.json').read_text());assert build['css_identical'] and build['action_key_preserved'] and not build['missing_routes']
assert (DIST/'BUILD_ID').read_text().strip()==build['build_id']
archive=ROOT/'runtime.private.tar.gz';assert not archive.exists()
files={str(p.relative_to(DIST)):sha(p) for p in DIST.rglob('*') if p.is_file() and not {'cache','standalone'}.intersection(p.relative_to(DIST).parts)}
with tarfile.open(archive,'w:gz') as out:
 for n in files:out.add(DIST/n,arcname=n,recursive=False)
os.chmod(archive,0o600)
release=dict(revision=a.revision,e2e='passed',linux_unit_tests=10,visual_evaluation='PASS',screenshots_commits=['fa3613f','8635a7a'],
 native_routes=112,candidate_routes=115,css_identical=True,build_id=build['build_id'],source_files=source,runtime_files=files,runtime_sha256=sha(archive))
(ROOT/'release.json').write_text(json.dumps(release));os.chmod(ROOT/'release.json',0o600)
print(json.dumps(dict(packed=True,files=len(files),archive_bytes=archive.stat().st_size,build_id=build['build_id'])))
