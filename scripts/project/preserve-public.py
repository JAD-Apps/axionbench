"""Read-only Git observations; writes only an ignored private recovery artifact."""
import hashlib, io, json, os, pathlib, subprocess, tarfile

BASE = 'b6fa8b0376aef8efec44e2399f17120b560f2d0c'
ROOT = pathlib.Path('../../../src/jad/axionbench-public').resolve()
OUT = pathlib.Path('evidence/local/recovery/public-draft')
ENV = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], env=ENV)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def metadata():
    values = {}
    for name in ('HEAD', 'index', 'config', 'packed-refs'):
        path = pathlib.Path(git('rev-parse', '--git-path', name).decode().strip())
        if not path.is_absolute():
            path = ROOT / path
        values[name] = digest(path.read_bytes()) if path.exists() else None
    return values

assert git('rev-parse', 'HEAD').decode().strip() == BASE, 'public baseline mismatch'
OUT.mkdir(parents=True, exist_ok=False, mode=0o700)
before = metadata()
status = git('status', '--porcelain=v1', '-z', '--untracked-files=all')
files = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0')
rows = []
with tarfile.open(OUT / 'files.tar.gz', 'w:gz') as archive:
    for raw in sorted(set(files) - {b''}):
        name = os.fsdecode(raw)
        path = ROOT / name
        assert not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts
        if not path.exists() and not path.is_symlink():
            rows.append({'path': name, 'deleted': True})
            continue
        assert path.is_file() and not path.is_symlink(), f'nonregular draft file needs separate preservation: {name}'
        data = path.read_bytes()
        mode = path.stat().st_mode & 0o777
        info = tarfile.TarInfo(name)
        info.size, info.mode = len(data), mode
        archive.addfile(info, io.BytesIO(data))
        assert path.read_bytes() == data, f'draft changed during capture: {name}'
        rows.append({'path': name, 'bytes': len(data), 'sha256': digest(data), 'mode': mode})
for name, data in [('status.z', status), ('tracked.patch', git('diff', '--binary', BASE)),
                   ('index.patch', git('diff', '--cached', '--binary', BASE)),
                   ('baseline.tar', git('archive', '--format=tar', BASE))]:
    (OUT / name).write_bytes(data)
assert status == git('status', '--porcelain=v1', '-z', '--untracked-files=all'), 'public draft status changed'
assert before == metadata(), 'public Git metadata changed'
for row in rows:
    if not row.get('deleted'):
        assert digest((ROOT / row['path']).read_bytes()) == row['sha256'], 'draft changed during preservation'
manifest = {'schemaVersion': 1, 'baseline': BASE, 'source': str(ROOT), 'files': rows,
            'gitMetadataBefore': before, 'gitMetadataAfter': metadata(),
            'artifacts': [{'path': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p.read_bytes())}
                          for p in sorted(OUT.iterdir()) if p.is_file()],
            'ignoredFiles': 'excluded; no credentials/dependencies copied',
            'mutation': 'none: no reset, commit, checkout, index or refs writes'}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Preserved {len(rows)} tracked/untracked draft paths; Git metadata unchanged.')
