# Admission and private recovery

This audit belongs to the private checkout. Exclude `scripts/project/preflight.mjs`,
`scripts/project/recover.py`, these admission tests, this document and all
`evidence/local/` content from the public product export. The existing ignore rule
keeps recovery archives, source captures, workflow observations and credentials
out of Git. No command here commits, pushes, resets or edits shared Git metadata.

The package uses `npm@11.19.0` and the existing `package-lock.json`. The build runs
the data generator before Vite. The existing release verifier has 21 gates and
remains unchanged. `jadbot.quality.json` already specifies the candidate manifest,
health check and missing-index recovery; the daemon contract reports container
isolation with the `github-actions`, `node` and `vite` profiles.

Run the focused regression fixtures:

```sh
node --test tests/project/preflight.test.mjs
```

Capture initial observations using `node scripts/project/preflight.mjs --observe`,
then preserve recovery with `python3 scripts/project/recover.py`. Finally capture
the complete audit with `node scripts/project/preflight.mjs --capture` and check
it with `node scripts/project/preflight.mjs --verify`. Capture inventories the
installed tools and recording capabilities automatically. It reads the local owner
token without printing it. Its enumerated transport issues GET requests only to
the loopback daemon and rejects redirects. It never pauses, starts, stops, retries,
patches or enables a run. The owner has already set this run's scoped model pin.

Project isolation means the declared project container and no other run working
on AxionBench. Other projects may run concurrently. The preflight inspects the
project-scoped run list; it imposes no scheduler-wide exclusivity rule.

Admission checks explicit planner, worker, reviewer and every step choice; the
scoped pin audit; requested and effective session choices; provider-reported model,
effort, Fast OFF and default tier; permission posture; and stopped/drained older
execution. Historical unavailable observations stay unavailable. A requested model
is not provider evidence. Missing mandatory observations fail verification. Future
reviewer identity and verdict are captured at the independent-review stage, not
claimed by this worker. No independent review has occurred in this step.

The private admission file records scheduler registration, secret names (never
values), paired browser status and encoding capabilities. An unavailable later
capability is a documented gap, not a successful registration or recording. The
deployed `0.1.107` daemon exposes scoped `modelPin`. Its inspected automation route
supports list, run and enable; no arbitrary registration endpoint was found.
That is an integration gap for the daily-workflow stage. Route inspection is local
source evidence; successful GETs prove deployed observations, not uncalled write
operations. Cloudflare credentials were not listed in daemon secret storage; this
does not prove their absence from separately authorized local storage or bindings.

After the archived run is confirmed drained, `python3 scripts/project/recover.py`
verifies the owner-supplied archive SHA256 and every one of its 526 member hashes.
It rejects links, unsafe paths and duplicate archive entries. It compares preserved
source hashes with the daemon's actual failed verifier capture and keeps both the
negative native receipt and exact failing log. It archives the immutable private
baseline `c3a915b717c999321e43148d522d160f4de805de`, including existing raw audit inputs.
The old worker's live worktree is never read.

Public draft preservation reads `../../../src/jad/axionbench-public` with optional
Git locks disabled. It records the HEAD, status, binary tracked patch, all changed
tracked and untracked files, deletions and symlink targets; hashes the artifacts;
and verifies status, patch and file bytes did not change during capture. Its HEAD
must descend from `b6fa8b0376aef8efec44e2399f17120b560f2d0c`. The baseline archive plus
change archive and patch are private recovery inputs. No original public files or
Git references are changed.

The preserved native result is **failed, exit 1**: all 21 private gates passed,
then added `verify:public` failed. The exact failing portable check calls `mkdtemp`
under `/tmp`, which the native verifier mounted read-only (`EROFS`). The next
boundary implementation must allocate bounded fixtures inside its admitted writable
test area, clean only its own fixtures, and retain every negative assertion. This
step recovers the original bytes and diagnoses the failure; it does not qualify
that old candidate or adopt its old UI.

`--verify` checks current verifier/test/document/lockfile hashes, a 24-hour observation
window and private recovery artifact digests. Synthetic regression fixtures never
count as admission receipts. The final saved command is run by the daemon:

```sh
node --test tests/project/preflight.test.mjs && node scripts/project/preflight.mjs --verify
```

A local diagnostic result is not a daemon pass. Publication, daily scheduling,
browser acceptance, independent review and the hero MP4 belong to later steps.
