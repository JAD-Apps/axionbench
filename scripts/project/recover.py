"""Preserve immutable private recovery bytes; never modify a Git index/ref.

Run only after the read-only daemon observations confirm the old run drained.
The public draft is read with GIT_OPTIONAL_LOCKS=0 and preserved privately.
"""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

PRIVATE_BASE = 'c3a915b717c999321e43148d522d160f4de805de'
PUBLIC_BASE = 'b6fa8b0376aef8efec44e2399f17120b560f2d0c'
ARCHIVE_HASH = 'd83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b'
ARCHIVE = Path('../../preservation/concurrency-opus-20261001/axionbench-drained-native-boundary-20261001')
OUT = Path('evidence/local/recovery')
PUBLIC = Path('../../../src/jad/axionbench-public')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(data)
    path.chmod(0o600)


def main():
    old = json.loads(Path('evidence/local/preflight/api-oldRun.json').read_text())['data']
    execution = old['execution']
    assert old['id'] == 'run_a898861f6684' and old['status'] == 'paused'
    assert execution['activeWorkers'] == 0 and execution['phaseStarting'] is False
    assert all(execution[key] == [] for key in ['activeSessions', 'startingSteps', 'verifyingSteps', 'backgroundSteps', 'authorizedSteps'])
    session = json.loads(Path('evidence/local/preflight/api-oldSession.json').read_text())['data']
    assert session['status'] == 'stopped' and session['live'] is False
    manifest_bytes = (ARCHIVE / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    archive_bytes = (ARCHIVE / 'private-boundary-source-and-receipts.tar.gz').read_bytes()
    assert sha(archive_bytes) == ARCHIVE_HASH == manifest['archiveSha256']
    assert manifest['baseCommit'] == PRIVATE_BASE
    assert manifest['status'] == 'failed' and manifest['nativeExitCode'] == 1
    assert manifest['passedPrivateGates'] == 21 and manifest['failedAddedGate'] == 'verify:public'
    expected = {row['path']: row for row in manifest['sourceManifest']}
    assert len(expected) == 526
    OUT.mkdir(parents=True, exist_ok=True, mode=0o700)
    OUT.chmod(0o700)
    save(OUT / 'original-manifest.json', manifest_bytes)
    save(OUT / 'private-boundary-source-and-receipts.tar.gz', archive_bytes)
    # Read archived members only. No read of the drained worker's worktree.
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz') as archive:
        members = archive.getmembers()
        assert len(members) == 526 and len({m.name for m in members}) == 526
        for member in members:
            path = PurePosixPath(member.name)
            assert member.isfile() and not path.is_absolute() and '..' not in path.parts
            data = archive.extractfile(member).read()
            row = expected[member.name]
            assert len(data) == row['bytes'] and sha(data) == row['sha256'], member.name
            contents[member.name] = data
    learning = json.loads(Path('evidence/local/preflight/api-oldLearning.json').read_text())['data']
    native = next(row['receipt'] for row in learning['evidence'] if row['stepId'] == manifest['stepId'])
    assert native['head'] == PRIVATE_BASE and native['exitCode'] == 1 and native['status'] == 'failed'
    native_files = {row['path']: row for row in native['pre']['files']}
    for path in expected:
        if path in native_files:
            assert native_files[path]['sha256'] == expected[path]['sha256'], path
    required = ['scripts/public/boundary.mjs', 'scripts/public/test-boundary.mjs', 'scripts/release/verify-release.mjs', 'scripts/public-snapshot.mjs']
    assert all(path in native_files for path in required)
    for path, data in contents.items():
        save(OUT / 'original' / path, data)
    save(OUT / 'native-negative-receipt.json', (json.dumps(native, indent=2) + '\n').encode())
    log_path = 'publication/product/test-results/public-2026-10-01T19-36-54-513Z/test-boundary.log'
    log = contents[log_path].decode()
    assert 'EROFS' in log and "mkdtemp '/tmp/axionbench-public-tests-" in log
    save(OUT / 'boundary-failure.log', contents[log_path])
    release = json.loads(contents['test-results/release-verify.json'])
    assert release['passed'] is False
    assert len([row for row in release['results'] if row['exitCode'] == 0]) == 21
    assert [(row['script'], row['exitCode']) for row in release['results'] if row['exitCode'] != 0] == [('verify:public', 1)]
    # Baselines are immutable Git objects. Archive all private audit inputs too.
    assert git('.', 'rev-parse', PRIVATE_BASE).decode().strip() == PRIVATE_BASE
    save(OUT / 'private-baseline.tar.gz', git('.', 'archive', '--format=tar.gz', PRIVATE_BASE))
    assert git(PUBLIC, 'rev-parse', PUBLIC_BASE).decode().strip() == PUBLIC_BASE
    head = git(PUBLIC, 'rev-parse', 'HEAD').decode().strip()
    subprocess.run(['git', '-C', str(PUBLIC), 'merge-base', '--is-ancestor', PUBLIC_BASE, head], check=True, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})
    status = git(PUBLIC, 'status', '--porcelain=v1', '-z', '--untracked-files=all')
    patch = git(PUBLIC, 'diff', '--binary', 'HEAD')
    paths = set(git(PUBLIC, 'ls-files', '-z', '--modified', '--deleted', '--others', '--exclude-standard').decode().rstrip('\0').split('\0')) - {''}
    records = []
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as archive:
        for name in sorted(paths):
            path = PurePosixPath(name)
            assert not path.is_absolute() and '..' not in path.parts
            source = PUBLIC / name
            if not source.exists() and not source.is_symlink():
                records.append({'path': name, 'deleted': True})
                continue
            if source.is_symlink():
                data = os.readlink(source).encode()
                entry = tarfile.TarInfo(name)
                entry.type = tarfile.SYMTYPE
                entry.linkname = data.decode()
                archive.addfile(entry)
                records.append({'path': name, 'symlink': data.decode(), 'sha256': sha(data)})
            else:
                assert source.is_file()
                data = source.read_bytes()
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = source.stat().st_mode & 0o777
                archive.addfile(entry, io.BytesIO(data))
                records.append({'path': name, 'bytes': len(data), 'sha256': sha(data)})
    assert status == git(PUBLIC, 'status', '--porcelain=v1', '-z', '--untracked-files=all')
    assert patch == git(PUBLIC, 'diff', '--binary', 'HEAD')
    for row in records:
        source = PUBLIC / row['path']
        if 'bytes' in row: assert sha(source.read_bytes()) == row['sha256']
        elif 'symlink' in row: assert os.readlink(source) == row['symlink']
        else: assert not source.exists()
    save(OUT / 'public-draft-status.bin', status)
    save(OUT / 'public-draft.patch', patch)
    save(OUT / 'public-draft-changes.tar.gz', buf.getvalue())
    save(OUT / 'public-draft-baseline.tar.gz', git(PUBLIC, 'archive', '--format=tar.gz', head))
    save(OUT / 'public-draft-manifest.json', (json.dumps({'baseline': PUBLIC_BASE, 'head': head, 'files': records}, indent=2) + '\n').encode())
    artifacts = [{'path': str(p), 'sha256': sha(p.read_bytes())} for p in sorted(OUT.iterdir()) if p.is_file() and p.name != 'receipt.json']
    receipt = {
        'schemaVersion': 1, 'privateBaseline': PRIVATE_BASE, 'publicBaseline': PUBLIC_BASE,
        'archiveSha256': ARCHIVE_HASH, 'verifiedFiles': 526, 'daemonContentBound': True,
        'daemonSource': native['source'], 'daemonHead': native['head'],
        'nativeExitCode': 1, 'passedPrivateGates': 21, 'failedAddedGate': 'verify:public',
        'failureCause': "EROFS: mkdtemp '/tmp/axionbench-public-tests-' in native read-only /tmp",
        'publicDraftPreserved': True, 'publicDraftHead': head, 'publicDraftFiles': len(records),
        'artifacts': artifacts,
        'qualification': 'Recovery only. Original failure preserved; no native pass, public qualification or UI adoption.'
    }
    save(OUT / 'receipt.json', (json.dumps(receipt, indent=2) + '\n').encode())
    print(f'Preserved {len(expected)} hash-verified archived files and {len(records)} public draft changes privately. Original native exit 1 retained.')


if __name__ == '__main__':
    main()
