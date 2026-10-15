"""Private, read-only recovery from a fixed archive; never touch Git metadata."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

PRIVATE_BASE = "c3a915b717c999321e43148d522d160f4de805de"
PUBLIC_BASE = "b6fa8b0376aef8efec44e2399f17120b560f2d0c"
ARCHIVE_SHA = "d83ba8c9cd0c2982d7728cee27529035f44bf8864f60456f2e67a2824265a71b"
DEFAULT_OUTPUT = Path("evidence/local/project-preflight/recovery")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def archive_rows(path, expected):
    with tarfile.open(path) as archive:
        members = archive.getmembers()
        assert len(members) == len(expected)
        assert {member.name for member in members} == set(expected)
        for member in members:
            assert member.isfile() and not Path(member.name).is_absolute()
            assert ".." not in Path(member.name).parts
            data = archive.extractfile(member).read()
            row = expected[member.name]
            assert len(data) == row["bytes"] and sha(data) == row["sha256"], member.name
            yield member.name, data


def verify(output):
    manifest = json.loads((output / "manifest.json").read_text())
    assert manifest["archiveSha256"] == ARCHIVE_SHA
    archive = output / "private-boundary-source-and-receipts.tar.gz"
    assert sha(archive.read_bytes()) == ARCHIVE_SHA
    assert manifest["baseCommit"] == PRIVATE_BASE
    expected = {row["path"]: row for row in manifest["sourceManifest"]}
    assert len(expected) == 526
    for name, data in archive_rows(archive, expected):
        assert (output / "source" / name).read_bytes() == data, name
    receipt = json.loads((output / "receipt.json").read_text())
    assert receipt["privateBaseline"] == PRIVATE_BASE
    assert receipt["publicBaseline"] == PUBLIC_BASE
    for row in receipt["publicDraft"]["artifacts"]:
        path = output / row["path"]
        assert not path.is_symlink()
        data = path.read_bytes()
        assert len(data) == row["bytes"] and sha(data) == row["sha256"]
    expected = {row["path"]: row for row in receipt["publicDraft"]["files"]}
    assert len(expected) == len(receipt["publicDraft"]["files"])
    assert len(list(archive_rows(output / "public-draft/working-files.tar.gz", expected))) == len(expected)
    with tarfile.open(output / "public-draft/baseline.tar") as baseline:
        assert baseline.pax_headers.get("comment") == PUBLIC_BASE, "public baseline archive identity"
    print(json.dumps({"archiveVerifiedFiles": 526, "publicDraftFiles": len(expected)}))


def recover(output):
    # Existing evidence is immutable. An explicit new location is needed to
    # capture a later draft; rerunning never replaces the original preservation.
    if (output / "receipt.json").exists():
        verify(output)
        return
    source = Path.home() / ".jadbot/preservation/concurrency-opus-20261001/axionbench-drained-native-boundary-20261001"
    manifest = json.loads((source / "manifest.json").read_text())
    archive = source / "private-boundary-source-and-receipts.tar.gz"
    assert sha(archive.read_bytes()) == ARCHIVE_SHA
    assert manifest["baseCommit"] == PRIVATE_BASE
    assert sha((source / "tracked.patch").read_bytes()) == manifest["trackedPatchSha256"]
    output.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(output.parent, 0o700)
    for name in ["manifest.json", "private-boundary-source-and-receipts.tar.gz", "tracked.patch"]:
        shutil.copyfile(source / name, output / name)
        os.chmod(output / name, 0o600)
    expected = {row["path"]: row for row in manifest["sourceManifest"]}
    for name, data in archive_rows(archive, expected):
        target = output / "source" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    public = Path.home() / "src/jad/axionbench-public"
    env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}

    def git(*args):
        return subprocess.check_output(["git", "-C", str(public), *args], env=env)

    assert git("rev-parse", "HEAD").decode().strip() == PUBLIC_BASE
    status = git("status", "--porcelain=v1", "-z", "--untracked-files=all")
    files = sorted(set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard").decode().split("\0")) - {""})
    rows = []
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz", format=tarfile.PAX_FORMAT) as tar:
        for name in files:
            path = public / name
            if not path.exists():
                continue  # deletions remain in the binary patch and status
            assert path.is_file() and not path.is_symlink()
            data = path.read_bytes()
            rows.append({"path": name, "bytes": len(data), "sha256": sha(data)})
            item = tarfile.TarInfo(name)
            item.size, item.mode, item.mtime = len(data), path.stat().st_mode & 0o777, 0
            tar.addfile(item, io.BytesIO(data))
    items = {"working-files.tar.gz": buffer.getvalue(), "tracked.patch": git("diff", "--binary", "HEAD"),
             "staged.patch": git("diff", "--binary", "--cached"), "baseline.tar": git("archive", "--format=tar", PUBLIC_BASE),
             "status.porcelain": status}
    assert status == git("status", "--porcelain=v1", "-z", "--untracked-files=all")
    draft = output / "public-draft"
    draft.mkdir(mode=0o700)
    for name, data in items.items():
        (draft / name).write_bytes(data)
        os.chmod(draft / name, 0o600)
    receipt = {"schemaVersion": 1, "privateBaseline": PRIVATE_BASE, "publicBaseline": PUBLIC_BASE,
               "archiveSha256": ARCHIVE_SHA, "recoveredFiles": 526, "deliveredCommit": None,
               "deliveredCommitObservation": "Daemon reported no committed delivery; recover exact archived uncommitted bytes by content hash.",
               "publicDraft": {"files": rows, "statusUnchanged": True, "artifacts": [
                   {"path": "public-draft/" + name, "bytes": len(data), "sha256": sha(data)} for name, data in items.items()]},
               "historicalResult": {"nativeExitCode": 1, "privateGatesPassed": 21, "failedAddedGate": "verify:public",
                                    "boundaryCause": "EROFS: read-only file system, mkdtemp /tmp/axionbench-public-tests-iHcxUw"}}
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    verify(output)


if __name__ == "__main__":
    assert len(sys.argv) in [2, 3] and sys.argv[1] in ["--recover", "--verify"], "use --recover or --verify [private-output]"
    target = Path(sys.argv[2]) if len(sys.argv) == 3 else DEFAULT_OUTPUT
    (recover if sys.argv[1] == "--recover" else verify)(target)
