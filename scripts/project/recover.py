"""Recover immutable private evidence and preserve a public draft without Git writes."""
import argparse
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


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(name):
    p = PurePosixPath(name)
    if p.is_absolute() or '..' in p.parts or str(p) != name or not p.parts:
        raise ValueError('unsafe archive path: ' + name)
    return p


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args],
                                   env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})


def recover(archive, manifest, draft, output):
    output.mkdir(parents=True, exist_ok=False, mode=0o700)
    raw = archive.read_bytes()
    receipt = json.loads(manifest.read_bytes())
    if digest(raw) != ARCHIVE_HASH or receipt['archiveSha256'] != ARCHIVE_HASH:
        raise ValueError('coordinator archive SHA256 mismatch')
    if receipt['baseCommit'] != PRIVATE_BASE or receipt['runId'] != 'run_a898861f6684':
        raise ValueError('private baseline/run mismatch')
    if receipt['status'] != 'failed' or receipt['nativeExitCode'] != 1:
        raise ValueError('original failed history must remain failed')
    expected = {row['path']: row for row in receipt['sourceManifest']}
    if len(expected) != 526:
        raise ValueError('expected exactly 526 preserved files')
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        members = tar.getmembers()
        if len(members) != len(expected) or len({m.name for m in members}) != len(expected):
            raise ValueError('archive inventory mismatch')
        for member in members:
            safe_path(member.name)
            if not member.isfile() or member.name not in expected:
                raise ValueError('unexpected/nonregular member: ' + member.name)
            data = tar.extractfile(member).read()
            row = expected[member.name]
            if len(data) != row['bytes'] or digest(data) != row['sha256']:
                raise ValueError('source content hash mismatch: ' + member.name)
            dest = output / 'source' / member.name
            dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            dest.write_bytes(data)
            dest.chmod(0o600)
    (output / 'drained-source.tar.gz').write_bytes(raw)
    (output / 'coordinator-manifest.json').write_bytes(manifest.read_bytes())
    head = git(draft, 'rev-parse', 'HEAD').decode().strip()
    if head != PUBLIC_BASE:
        raise ValueError('public draft baseline mismatch: ' + head)
    before = git(draft, 'status', '--porcelain=v1', '-z', '--untracked-files=all')
    index_path = Path(git(draft, 'rev-parse', '--path-format=absolute', '--git-path', 'index').decode().strip())
    index_before = digest(index_path.read_bytes())
    tracked = git(draft, 'ls-files', '-z').split(b'\0')
    untracked = git(draft, 'ls-files', '--others', '--exclude-standard', '-z').split(b'\0')
    names = sorted({n.decode() for n in tracked + untracked if n})
    files, missing = [], []
    draft_archive = output / 'public-draft.tar.gz'
    with tarfile.open(draft_archive, 'w:gz') as tar:
        for name in names:
            safe_path(name)
            path = draft / name
            if path.is_symlink():
                target = os.readlink(path)
                info = tarfile.TarInfo(name); info.type = tarfile.SYMTYPE; info.linkname = target
                tar.addfile(info)
                files.append({'path': name, 'symlink': target, 'sha256': digest(target.encode())})
            elif path.is_file():
                data = path.read_bytes()
                info = tarfile.TarInfo(name); info.size = len(data); info.mode = path.stat().st_mode & 0o777
                tar.addfile(info, io.BytesIO(data))
                files.append({'path': name, 'bytes': len(data), 'sha256': digest(data)})
            elif not path.exists():
                missing.append(name)
            else:
                raise ValueError('nonregular draft file: ' + name)
    patches = {}
    for label, args in [('worktree', ('diff', '--binary', 'HEAD')), ('staged', ('diff', '--cached', '--binary'))]:
        data = git(draft, *args)
        (output / (label + '.patch')).write_bytes(data)
        patches[label] = digest(data)
    baseline = git(draft, 'archive', '--format=tar', PUBLIC_BASE)
    (output / 'public-baseline.tar').write_bytes(baseline)
    after = git(draft, 'status', '--porcelain=v1', '-z', '--untracked-files=all')
    if before != after or index_before != digest(index_path.read_bytes()) or head != git(draft, 'rev-parse', 'HEAD').decode().strip():
        raise ValueError('public draft/index changed during capture; do not use this recovery')
    for row in files:
        path = draft / row['path']
        data = os.readlink(path).encode() if 'symlink' in row else path.read_bytes()
        if digest(data) != row['sha256']:
            raise ValueError('public draft bytes changed during capture: ' + row['path'])
    result = {'schemaVersion': 1, 'privateBaseline': PRIVATE_BASE, 'publicBaseline': PUBLIC_BASE,
              'archiveSha256': ARCHIVE_HASH, 'sourceFilesVerified': len(expected),
              'coordinatorManifestSha256': digest(manifest.read_bytes()),
              'publicDraftArchiveSha256': digest(draft_archive.read_bytes()),
              'publicBaselineArchiveSha256': digest(baseline), 'files': files, 'deleted': missing,
              'patches': patches, 'publicStatusSha256': digest(before), 'publicIndexSha256': index_before,
              'untrackedPolicy': 'nonignored files from git ls-files --others --exclude-standard',
              'gitWrites': 0, 'oldNativeReleasePassed': False, 'oldNativeExitCode': 1}
    (output / 'recovery.json').write_text(json.dumps(result, indent=2) + '\n')
    for p in output.iterdir():
        if p.is_file():
            p.chmod(0o600)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ['archive', 'manifest', 'draft', 'output']:
        parser.add_argument('--' + arg, type=Path, required=True)
    args = parser.parse_args()
    result = recover(args.archive, args.manifest, args.draft, args.output)
    print(json.dumps({k: v for k, v in result.items() if k not in ['files', 'deleted']}))
