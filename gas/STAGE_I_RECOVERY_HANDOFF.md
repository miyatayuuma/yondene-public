# Stage I — backup recovery and single-writer handoff

Status: READ-ONLY AUDIT; CUTOVER BLOCKED (2026-10-25 JST).

## Evidence
- Private workflow separates `sync` gated by `YONDENE_SYNC_ENABLED` from scheduled encrypted `backup` gated by `YONDENE_BACKUP_ENABLED`. Do not disable the entire workflow when retiring the writer.
- Scheduled run 39681611233 dispatched backup run 39681625775. The encrypted artifact exists (33,349 bytes; expires 2026-10-29 06:51 JST). This is NOT proof of recovery.
- `scheduled-backup.emulator.mjs` verifies synthetic fixture decryption and restoration into an empty emulator, NOT recovery of the actual production artifact.
- `scheduled-backup-run.mjs` performs an encryption/decryption self-check for a newly generated archive; it does not independently test the archived production artifact.
- The documented key generation pipes `openssl rand -base64 32` into a GitHub Secret. Unless the key was saved independently, the owner cannot recover it from the GitHub settings UI. Do not rotate, print, or paste the key. A separately approved isolated Actions-side restore drill can use the existing Secret.
- Owner-reported GAS: one editor; only `yondeneSyncNow` trigger; latest queue dry-run pending=0, ready=0, review=0, writeEnabled=false. Pending family name restoration is a separate scoped update.

## Required sequence
1. Recheck private main, public Draft PR #3, writer flags and in-flight Actions runs. Verify no pending GitHub commands or v2 writes.
2. Verify production encrypted artifact can be decrypted and restored to an isolated emulator using the existing Secret without printing private data. No production restore.
3. Refresh Firestore-authoritative counts, marker IDs and fresh document CAS. The hourly Sheets mirror is non-atomic and not authoritative for CAS.
4. Approve a specific bounded business-command acceptance. Stop old writer via the effective `YONDENE_SYNC_ENABLED=false`, verify all runs drained, leave backup gate on.
5. Enable GAS only for that approved update; reconcile durable marker, document fields and Sheets status. Unknown commit outcome must be reconciled, never blindly retried with a new ID.
6. Restore the requested shelf name separately with exact before/after CAS, then approve queue trigger only after successful acceptance. Hosting switch is separate.
7. The owner's preference is eventual GitHub backup retirement, but mutable Sheets is not historical recovery. Decide acceptable loss or replacement versioned backup before removal.

No production configuration, Firestore data, GitHub variable, GAS trigger, or write gate was changed in Stage I.


## Stage J — Private Actions quota-unavailable route (2026-10-25)

Owner confirmed private GitHub Actions has insufficient free execution minutes and that avoiding private Actions is an explicit migration objective. The new private-repo restore-workflow draft PR #119 was **closed without merge**. Do not block GAS cutover on restoring private Actions or rerunning its failing CI. Its archived encrypted backup remains retained only until GitHub expiry; live artifact recovery has not been demonstrated.

**Approved architecture direction, not authorization to write:**
- PUBLIC GitHub: code, mock/synthetic tests, CI only. No user records, spreadsheet identifiers, tokens, archive or plaintext.
- PRIVATE Sheets-bound GAS: hourly Firestore→Sheets mirror, queue dry-run and eventual sole production command writer. No automatic queue trigger before separate approval.
- Firestore remains the sole source of truth.
- Legacy private GitHub writer disabled by its **effective** Environment variable before any GAS write. The backup job gate must be treated separately; a variable set to true does not prove actual private Actions execution while quota is exhausted.
- The owner's `設定!B2` pending shelf-name restoration is approved as a **business request**, not blanket authority to enable GAS writes.
- Each limited acceptance checks no pending legacy run, empty queue, fresh transactional CAS, exact changed fields, create-only marker and independent post-write reconciliation. When the commit outcome is unknown, **do not retry blindly**.
- When independent verified recovery is unavailable, do not perform broad, destructive, batch or irreversible production changes. A limited, explicitly authorized, single-field CAS can be assessed separately with documented residual risk.
- Owner ultimately wants GitHub automated backups retired; replacement historical recovery/versioning is a separate design. A mutable hourly Sheet mirror is not a recoverable backup; do not mislabel it.
- Never expose backup decryption keys to ChatGPT or public GitHub to work around private Actions billing.

### Remaining transition checklist
1. Confirm PUBLIC CI and installed GAS code matches reviewed revision. Keep write gate off.
2. Obtain effective `YONDENE_SYNC_ENABLED=false` in private Environment and independently confirm no in-progress writer runs. Do not disable the whole workflow just to stop writing.
3. Refresh read-only Firestore/marker state and verify intended shelf-name before/after values. The mirror cannot provide a fresh CAS token.
4. Scope and authorize one non-destructive GAS write, verify durable marker and exact field diff before making any general queue or trigger active.
5. Prove at least one normal book command (without inventing reading status, date or rating) with a separately authorized acceptance. Then consider manual queue activation/trigger approval.
6. Design independent, versioned recovery in private Google storage without transferring records to public GitHub. Hosting switch remains a separate release.

**As of this note**: No old-writer gate change, GAS write activation, Firestore record changes, backup deletion, or hosting changes have been made.

## Stage K — effective legacy writer disabled, one-shot rename planned (2026-10-25)

The owner supplied the GitHub CLI confirmation:
`gh variable set YONDENE_SYNC_ENABLED --body false -R miyatayuuma/yondene -e production-reading-shelf`
followed by `gh variable get ...` returning **`false`**. This disables the old v1 `sync` job and v2 execution's shared `YONDENE_SYNC_ENABLED` preflight; the backup gate was **not** changed. The owner's last ten listed workflow runs were completed successfully, with none running in that provided list. This is not independent attestation of all permissions, remote manual invocations, or every historical job.

The PRIVATE Sheets ledger was re-read with connected Google Sheets:
- settings tab has an authorized pending name change (B2 differs from C2), with actual shelf names excluded from this PUBLIC repository;
- update queue has headers only, no command entries;
- sync status reports healthy hourly Firestore→Sheets mirroring.
- The public, generic one-shot `gas/ProductionRenameProbe.gs` already accepts private exact pre/post names, validates family/owner, hard-requires `YONDENE_QUEUE.WRITE_ENABLED===false`, and performs one masked name CAS + create-only marker transaction with fresh verification before advancing C2. If it has already been used for a previous change, create a new GAS file from the immutable reviewed source with new privately supplied name values, do not rerun the earlier one.

**Pending:** no new GAS production rename was executed, no new immutable marker independently confirmed, general GAS queue write gate remains off, no trigger was added. An uncertain commit outcome must be reconciled without a blind retry. Actual production backup restoration is not verified.

No book, reading record, private identifiers, or owner names have been added to the public repository.


## Stage L — one-shot catalogue NO_CHANGE acceptance (2026-10-25 JST)

The owner approved **one** production GAS queue acceptance for an existing book with identical expected and proposed publisher values: `catalog.audit`, one entry, **expected real book writes 0**, expected immutable mutation markers 1. The book title, family ID, publisher, and private command JSON remain in the PRIVATE ledger, not this public repository.

- The installed Stage C `Queue.gs` manual `yondeneQueueDryRun` reported `pending=1 ready=1 review=0 writeEnabled=false`.
- The owner temporarily set `WRITE_ENABLED: true`, manually invoked `yondeneQueueProcess` **once** at approximately 09:21 JST, then restored `WRITE_ENABLED: false` and saved. No periodic GAS writer trigger was authorized.
- Independent Google Sheets API read of PRIVATE `更新キュー` after the invocation returned **`APPLIED`**, **`COMMIT_OK`**, `試行回数=1`, SHA256 present, error empty.
- **Independent reconciliation PASS (09:29 JST)**: the owner manually invoked read-only `yondeneSyncNow` and its success log reported `docs=166 books=41 series=10`. Connected Sheets independently confirmed successful sync after the commit.
- The newly persisted immutable marker exists exactly once, has `source=chatgpt-gas`, `op=catalog.audit`, `entryCount=1`, `updatedCount=0` and its `sourceDigest` matches the PRIVATE queue SHA256. The target book's Firestore document `updateTime` and all **34 fields** match the captured pre-acceptance baseline (stable canonical fingerprint match); no book field or revision was changed. Private IDs, titles, publisher and raw command are intentionally excluded here.
- **Stage L limited acceptance: PASS** (one command, one marker, zero book updates). Do not replay the command or re-enable the general writer. Both the old GitHub sync environment gate and the general GAS queue gate remain operator-reported disabled; no automatic GAS writer trigger was approved.
- This one-shot acceptance does NOT enable continuous GAS queue processing; a separate approved *real book change* acceptance and recovery/rollback design are still required.


## Stage M — approved one-book `book.patch` acceptance without global writer gate

Scope: **CODE + SYNTHETIC TESTS ONLY**. No production GAS installation, new queue command, book mutation, Firebase Hosting change, or PR merge is authorized by this stage.

The public `gas/Queue.gs` now provides `yondeneQueueAcceptApprovedBookPatchOnce()`, a manual-only entrypoint that runs the existing Firestore transactional `book.patch` machinery while `WRITE_ENABLED=false` if and only if an exact **PRIVATE** approval object (`YONDENE_BOOK_PATCH_APPROVAL`) is installed in the private Sheet-bound script. Regular `yondeneQueueProcess()` remains disabled.

The PRIVATE approval object contains **exactly** the following keys: `commandId`, `sourceDigest` (sha256-json-stringify-v1, computed from the actual queue JSON), `bookId`, `field`, `previousValue`, `newValue`, and `expiresAt` (UTC ISO time, less than 24 hours from execution). Do NOT populate approval values until the owner authorizes an exact real book correction. Do not publish names, IDs, source data or digests from actual private commands.

Fail-closed requirements:
- one and only one `PENDING` row, without prior attempts; no outstanding shelf rename;
- book-only `book.patch`, exactly one approved bibliographic *string* field, no status, progress, personal notes, rating, reflection, title, ISBN or series mutation;
- command ID, digest, target ID, field and new value bound to private approval; expected current field value and `expectedUpdatedAt` checked against live Firestore;
- existing transaction CAS and create-only immutable marker; the commit accepts only the specified field plus `updatedAt`; no global writer gate activation;
- immediate marker and unchanged-other-fields verification, then queue status `APPLIED`; uncertain commit outcome freezes the row in `REVIEW`, never automatically replays;
- successful queue status is provisional until *independent read-only Firestore→Sheets reconciliation* confirms persisted exact diff and the marker;
- approver must confirm existing old GitHub writer remains disabled, approve the actual book/field/values and explicitly install this code into the bound PRIVATE GAS project. Never enable routine triggers based on this acceptance.

**Status:** implementation and synthetic CI are prerequisites, but the first real `book.patch` has NOT been performed; separate scoped owner approval still required. Previous Stage L no-change acceptance remains PASS.


### Stage M bounded production invocation — provisional commit evidence (2026-10-25 JST)

This paragraph **supersedes the earlier Stage M status** that only synthetic testing had occurred. The owner explicitly authorized one actual single-field bibliographic correction, and manually installed the reviewed bound GAS source and private approval while keeping the general writer gate disabled. No owner names, document IDs, book titles, changed strings, or actual command payloads are recorded in this PUBLIC repository.

- Installed code dry-run first exposed the old `updatedAt` assumption on a legacy document. The corrected `Queue.gs` uses authenticated Firestore `updateTime` as the CAS source if the book has no `updatedAt` field. Synthetic CI for that fix passed.
- Subsequent private manual dry-run: `pending=1 ready=1 review=0 writeEnabled=false`.
- At approximately **20:21 JST** the owner invoked **only** `yondeneQueueAcceptApprovedBookPatchOnce`. It reported `SCOPED_BOOK_PATCH_PASS`, `writes=1 marker=1 generalWriterEnabled=false`.
- An independent connected-Google-Sheets read of the private queue returned `APPLIED`, `COMMIT_OK`, SHA256 matching the approved payload, `attempts=1`, no error; no second `PENDING`.
- **Not yet final PASS**: the last independently available Firestore→Sheets read-only sync predates 20:21, so persistence of the target field, the immutable marker and full unrelated-field equality **await fresh authoritative mirror reconciliation**. Manual operator has been asked to run `yondeneSyncNow` exactly once; do NOT rerun the writer.
- Neither the PUBLIC PR nor Firebase Hosting was merged/deployed. Ordinary GAS writer remains owner-reported `WRITE_ENABLED=false`; no recurring GAS trigger approved.
