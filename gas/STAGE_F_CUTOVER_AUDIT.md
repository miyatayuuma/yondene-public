# Stage F — legacy writer / GAS cutover compatibility audit

Status: **SOURCE REVIEW COMPLETE; PRODUCTION CUTOVER BLOCKED** (2026-10-25 JST).

This is a code-only audit. No private Firestore records, owner identifiers, Sheet URLs, credentials or real book data appear in this file. It does **not** certify deployed behavior or authorize a writer transfer.

## Baseline reviewed

- PRIVATE `miyatayuuma/yondene` main at `1aedf60356b234bd9c16457d50749bd48b552f44`: `reading-shelf/sync/runner.mjs`, `apply-commands.mjs`, `command.mjs`, `catalog-audit.mjs`, `child-rating-command.mjs`, `reflection-command.mjs`, `validate-queue.mjs`, workflow `.github/workflows/reading-shelf-chatgpt-sync.yml`, existing operations documentation.
- PUBLIC Draft PR #3 `feature/gas-queue-stage-b` at `1143a9447bbc537aab05b96d34a8660dd86b532d`: `gas/Queue.gs`, `gas/queue.test.mjs`, `gas/README.md`.
- Production Stage D bounded synthetic transaction acceptance and cleanup: owner logs PASS, synthetic docs remaining zero. Stage E one-shot `family.rename`: owner log PASS. Neither is a general queue/writer acceptance.
- The PRIVATE bound Apps Script still has Stage A `Queue.gs`; reviewed Stage C source is **not installed**. Existing GitHub Actions remains the normal writer. `YONDENE_QUEUE.WRITE_ENABLED` remains hardcoded `false` in PUBLIC.

## Operation parity

| Operation | Existing GitHub writer | Draft GAS queue | Decision before cutover |
| --- | --- | --- | --- |
| `book.create` | YES | YES; additionally requires cover URL | Shared core fields are identical (38/38), but compare representative complete output and duplicate/edition rules |
| `book.patch` | YES | YES, **but blocks title, author, ISBN edits** | Decide explicit safe bibliographic correction path; preserve ID/title/revision CAS |
| `series.create` | YES | YES | Verify unique-name and stable-ID behavior |
| `series.patch` | YES, including name | YES, **but blocks name changes** | Decide a collision-safe rename path |
| `book.patchByTitle` | YES; unique-title lookup | NO | Prefer planned deprecation in favor of verified ID + title + revision; do not silently lose a needed workflow |
| `book.delete` | YES, confirmation/title bound | NO | Keep disabled by default; define a separate explicit recovery/cleanup path or retain BLOCKED status |
| `catalog.audit` | YES; multi-book transactional bibliographic patches with expected-value checks | NO | Need atomic multi-book correction equivalent or a separately reviewed replacement |
| `childRating.set` | YES; never overwrite different stars | YES; first-create or same-stars marker-only | Verify stored Firestore field types, UI behavior, marker shape and genuine update acceptance |
| `childReflection.create` | YES; reflection + activity + marker atomic | YES; intended same three writes | Compare concrete persisted types, app rendering, replay and rollback |
| `family.rename` | No general GitHub command path | Internal GAS setting-based rename | One-shot Stage E PASS only; no recurring trigger approval |
| Read-only revision requests | Supported in private workflow | No equivalent in GAS queue | Retain an authorized read-only revision/CAS source after writer switch |

`book.patchByTitle`, deletion, and catalog audit are deliberately **not** added by this review. Implementing them without an acceptance design could increase data-loss risk. The common 38 book fields and three series fields match as names; this is **not** proof of semantic parity.

## Marker and replay incompatibility

- Existing GitHub runner computes `sourceDigest = SHA-256(raw UTF-8 command file bytes)` and marks `source=chatgpt-github`, `sourceRepository=miyatayuuma/yondene`, `sourceCommit`.
- GAS computes `sourceDigest = SHA-256(JSON.stringify(parsed command object))` and marks `source=chatgpt-gas`, `sourceRepository=miyatayuuma/yondene-public`. For equal logical commands, digest equality is **not guaranteed**; the latter repository describes code provenance, not the private Sheet row storing the command.
- Both use `families/{familyId}/chatgptMutations/{commandId}`. A pre-existing marker with a different digest is a hard conflict. **Do not import/replay prior GitHub command IDs into GAS.** Do not rewrite or delete historical markers.
- Before cutover, define a source-aware durable marker format/digest contract and separate fresh GAS ID namespace. Independently inventory all existing marker IDs/digests and reconcile after every accepted write.

## Readiness blockers / evidence to collect

1. **Product/API decisions**: document which legacy features must be preserved, deliberately retired, or sent through an explicitly approved exceptional path. No two simultaneous production writers.
2. **Input/semantic acceptance**: compare real schema types and output of representative book create, completion, undo completion, series, rating, reflection and controlled correction with no unwanted fields. Historical requests must remain unchanged.
3. **Fresh CAS input**: hourly read-only Sheet mirror may lag; refresh authoritative Firestore `updatedAt` and title before composing `PENDING` commands. On conflict, stop for review rather than retry with a new ID.
4. **Authorization and isolation**: independently inspect the bound GAS project's editor list, OAuth scopes/token authority, Sheet permissions, immutable source/queue integrity and execution ownership. A hardcoded software switch is not a sufficient privilege boundary for a script editor.
5. **Backup/recovery**: verify the twice-weekly encrypted backup is *actually running*, decryptable by an authorized recovery process, and recoverable before writer changes. The backup job shares the GitHub workflow but has a separate `YONDENE_BACKUP_ENABLED` gate: **do not disable the whole workflow while relying on that backup**. Audit OIDC provider changes and credential-drain timing.
6. **No overlapping writers**: agree on the actual old-writer disable mechanism, verify no queued/running operations, reconcile before/after state, and activate GAS only by a new explicit owner approval and a scoped genuine command acceptance. Do not install a trigger during audit.
7. **Recovery proof**: document fail-closed behavior for failed GAS commit, marker-only reconciliation, interrupted Sheet status write and rollback without resurrecting old commands.

## One-time production acceptance scripts — disposition

The private bound GAS environment only needs the permanent read-only `Code.gs` and the currently disabled `Queue.gs` while this review continues. After their code/evidence is safely retained, remove the *executable copies* of `ProductionReadProbe.gs`, `ProductionCommitProbe.gs`, `ProductionCleanupProbe.gs` and `ProductionRenameProbe.gs` from that live bound project **manually**. Never rerun synthetic commit/rename as a housekeeping step. Merely renaming a `.gs` file does not disable its top-level functions.

Keep the public, synthetic `*.test.mjs` regression tests in CI. Keep reviewed probe templates and their PASS evidence in Git history as historical acceptance material; do not auto-run one-time production probe entry points in CI or leave them installed in the live GAS project. Preserve the Stage E production rename marker and all historical command markers.

## Operational encrypted-backup evidence (2026-10-25 JST)

PRIVATE workflow inspection using GitHub Actions jobs and artifact metadata (read-only):

- Schedule-triggered run `39681611233` at `2026-10-21T21:47:35Z`: `scheduled_backup_dispatch` succeeded; the writer job was skipped.
- Dispatched run `39681625775` at `2026-10-21T21:47:42Z`: `backup` succeeded, including Firebase authentication, verified encrypted snapshot creation and encrypted artifact upload; `sync` and other write jobs were skipped.
- Encrypted artifact `yondene-backup-39681625775`: `expired=false`, 33,349 bytes, expiration `2026-10-28T21:51:00Z` (2026-10-29 06:51 JST). This verifies a stored artifact, **not** an independent decryption/restore test. Do not publish/download plaintext backup artifacts.
- Backup schedule and dispatch function independently from the old sync writer gate. Preserve this read-only backup path while planning writer cutover; disabling the entire workflow would remove the scheduled backup too.
- **Still open:** authorized key custody, a controlled decryption/isolated restore drill, recovery after 7-day artifact expiry, and OAuth/Sheet editor permissions.

## Bound Apps Script hygiene — owner-reported (2026-10-25 JST)

- The spreadsheet currently has **one editor**. This is an owner report, not an independent verification of Google authorization, Apps Script execution identity or OAuth scopes.
- Exactly **one installed trigger**, named `yondeneSyncNow`, remains. Based on the existing design this is the read-only Firestore-to-Sheets mirror. Trigger source, handler body and execution history have not yet been independently read in this audit.
- All four one-shot `ProductionReadProbe.gs`, `ProductionCommitProbe.gs`, `ProductionCleanupProbe.gs` and `ProductionRenameProbe.gs` executable copies were **removed from the bound project**, per owner confirmation. Their reviewed synthetic templates and test evidence remain in versioned PUBLIC history.
- No GAS queue processing trigger is installed or approved; `Queue.gs` Stage A remains write-disabled. Neither `Code.gs` nor permanent `Queue.gs` was removed.

## Current gate

**BLOCKED.** Do not merge PR #3, copy Stage C into the live project, enable either GAS writer gate or automatic trigger, disable private writer, alter IAM, or perform any further production mutation on the strength of this document. The next safe step is a *read-only security + backup/rollback and current-state reconciliation audit*, then a separately approved bounded business-command test.


## Stage G read-only spreadsheet/marker checkpoint (2026-10-25 JST)

Read from the existing private Firestore-to-Sheets mirror after the owner-reported Stage E one-shot acceptance. Only aggregate and schema-check results appear here; no private IDs, document payloads, book titles, Sheet URLs or credentials.

- Sheet metadata: six expected tabs are present. The synchronization status reports **normal**; last successful mirror read **2026-10-25 00:55:20 JST**. The mirror explicitly labels its source collection **non-atomic** and subject to refresh, so it is **not** a transactionally frozen Firestore snapshot.
- Mirrored inventory: **164** original document rows, **164 unique paths**, **41** top-level book documents and visible shelf entries, **10** top-level series documents and visible series entries; consistency checks found **0 malformed JSON**, **0 row/document-path mismatches**, and **0 row/document-updateTime mismatches**.
- Marker inventory: **45** mirrored mutation markers (**44** legacy GitHub source and **1** GAS source, consistent with the one-shot rename); **0** missing/malformed 64-hex sourceDigest fields and **0** marker document-path/command-ID mismatches. This verifies basic persisted marker shape in the mirror, **not** a cryptographic replay of every original source command or independent Firestore read.
- The dedicated Google Sheet command queue contains its header only: **0 queued entries, 0 pending**. The settings request and last-confirmed family name match, with **no pending rename**.
- A newer revision event can supersede an earlier book status change. Do not infer current book status solely from a historical user request without checking newer persisted edit history; no book changes were made in this checkpoint.

Code parity progress on the same Draft PR: guarded book.patch title/author/ISBN correction, guarded series.patch rename, bounded atomic catalog.audit, gas- command-ID namespace and marker provenance metadata have synthetic CI coverage. This is **PUBLIC source only**, not deployed into the private bound GAS. book.patchByTitle, book.delete and normal queued family.rename remain excluded or require an explicit exceptional route.

**Remaining before switch:** independently verify current Firestore/marker truth (the mirror is non-atomic), inspect GAS manifest/OAuth/editor/trigger execution ownership, confirm decryptable and recoverable backup with the owner's authorized keys, reconcile no in-flight GitHub writer activity, install reviewed Queue.gs with WRITE_ENABLED:false, run dry-run, and only then seek explicit approval for an isolated real book command and one-writer handoff. Keep the independent encrypted-backup dispatch enabled. No production config, Firestore data or Apps Script installation was changed by this audit.
