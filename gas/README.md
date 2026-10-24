# Google Sheets → GAS → Firestore command queue

Public, **code-only** source. Never commit a private spreadsheet ID/URL,
family ID, owner UID, real book/series record, actual queue JSON,
OAuth credential, deployment ID, or family-specific log.

## Authority and deployment state (Stage C draft)

- **Production** still uses Firestore as its sole source of truth.
- The private Sheet-bound Apps Script `Code.gs` provides read-only hourly
  Firestore → Sheets mirroring. Preserve it and its private configuration.
- The private sheet has a separate `設定` tab with `B2` (requested shelf
  name), `C2` (last confirmed name), and `D2` (status formula). The
  settings tab is **not** part of the hourly Firestore mirror.
- The owner installed **Stage A** `Queue.gs` and ran an empty dry run on
  2026-10-24. **Stage C source in this PR is not installed in GAS.**
- The old private GitHub Actions writer remains the only authorized writer.
  It must not overlap with a GAS writer. No Firebase Hosting migration yet.
- `WRITE_ENABLED: false` is hardcoded. Direct `commit`, transaction apply,
  settings processing and `yondeneQueueProcess()` all refuse to write.

## Stage C implementation under review

| Operation | Transactional preflight | Planned atomic write |
| --- | --- | --- |
| `book.patch` | Family owner, ID/title/updatedAt, allowed fields, transaction-bound title/author/ISBN duplicate checks | CAS update + create-only marker |
| `series.patch` | Family owner, ID/name/updatedAt, transaction-bound name uniqueness check | CAS update + marker |
| `book.create` | Family owner, ID absence, ISBN/title+author, series lookup, cover URL | Create-only book + marker |
| `series.create` | Family owner, ID absence, duplicate-name query | Create-only series + marker |
| `childRating.set` | Family owner, ID/title/status and existing rating | Create-only rating + marker; same stars → marker only |
| `childReflection.create` | Family owner, ID/title, reflection/activity absence | Create-only reflection + activity + marker |
| `catalog.audit` | Family owner, 1–50 unique book IDs + titles, expected-value checks; identity fields excluded | Atomic changed-field CAS patches + one marker |
| Internal `family.rename` | Family owner, current name equals `C2`, updateTime | Only `families/{id}.name` CAS update + marker |

Stage C begins a Firestore REST **read-write transaction**. Family,
marker, target and logical-duplicate reads (including `:runQuery`) bind to
the same transaction, which is included in `documents:commit`. This
prevents relying on unrelated, pre-commit duplicate reads. The tests exercise
the API contract with mocks; live contention testing is still pending.

For the shelf setting, `yondeneQueueSettingsCommand_` validates the
`設定!A1:C2` layout and name (1–80 characters, no leading/trailing spaces,
no control characters). A deterministic mutation ID preserves replay safety.
Only after the Firestore write or matching marker is independently verified
does `設定!C2` advance to `B2`; `D2` is a formula.

**No editable Sheet cell can flip the writer gate.** Setting `B2` now
only prepares a pending change; it does not alter the public app or production
until authorized cutover. The app already displays `families/{id}.name`
from Firestore; there is no separate hardcoded UI name to update.

## Safety and unresolved acceptance

1. **Production writes remain blocked.** Stage C source has not been copied to
   the private bound GAS script; no write trigger is installed or enabled.
2. Stage G source review implemented unique-ID book/series corrections and bounded
   multi-book bibliographic audit. Title/ISBN changes use `book.patch`; catalog
   audit intentionally excludes them. `book.patchByTitle` and deletion remain
   unavailable in the normal queue. Any exceptional deletion needs a separately
   approved recovery design; do not auto-import legacy commands.
3. Production synthetic transactions and one scoped real shelf-name rename have
   passed, but genuine concurrent writers, full Stage C queue-operation parity,
   conflict handling and historical marker integrity still need acceptance.
   Mocks and bounded acceptance probes alone are insufficient for cutover.
4. Independently audit authorization, OAuth scopes, secret separation, backup
   and rollback, and the old Action writer disablement.
5. Require a new explicit owner approval for any production write or polling
   trigger. Do not infer approval from a changed cell or a passing dry-run.

A commit transport failure may have persisted its marker. The only permitted
automatic resolution is a matching immutable marker digest; otherwise mark
for manual review. No blind retry. Pre-commit exits roll back their
transactions.

## Queue structure and read-only audit

`更新キュー` has 10 columns:

`コマンドID, 登録時刻, 操作, コマンドJSON, 状態, 処理日時,
結果コード, SHA256, 試行回数, エラー概要`.

Keep Sheets private, with restricted editors. Mirrored records remain
read-only, and the `設定` tab is a controlled input, not a replacement
for Firestore authority.

The **installed Stage A** can still be audited by selecting
`yondeneQueueDryRun` and pressing Run. An empty run reports:

`queue dry-run pending=0 ready=0 review=0 writeEnabled=false`

Do not add live commands or run `yondeneQueueProcess` until cutover.

## Automated tests

```bash
node --test gas/queue.test.mjs
```

Tests use fabricated IDs/names and in-process Google API mocks, including
simulated transaction begin, query, commit failure, rollback, and settings
CAS. They never access production data. To test write paths, the harness
temporarily changes the in-memory evaluated source gate to true. **The
committed source remains disabled.**

The private bound `Code.gs` must provide `YONDENE`,
`yondeneFirestoreRequest_`, `yondeneField_`, and `yondeneSha256_`.
The public module intentionally carries no private identifiers.

## Stage G source-only parity work (2026-10-25)

- Transaction-bound uniqueness checks now permit direct ID-scoped `book.patch`
  corrections to title, author and ISBN, and `series.patch` renames. Existing
  document ID, title/name and `expectedUpdatedAt` preconditions are retained;
  edits to related names/ISBN never use an unqualified title-only selector.
- `catalog.audit` accepts 1–50 unique book IDs for bibliographic-only changes.
  Each book is independently verified against its expected title and previous
  values, and changed documents are patched with server update-time CAS inside
  one read-write transaction; one create-only marker records the batch.
  No-op entries create only a marker. Its `title` and `isbn` patches are
  intentionally rejected, so identity corrections use individually verified
  `book.patch` instead.
- `book.delete`, `book.patchByTitle` and user-queued `family.rename` remain
  blocked. The only family-name route is the separate internal settings path.
- Synthetic tests cover successful patches, duplicate collisions, stale
  revisions, changed expected bibliography, multi-book atomic commits, no-ops
  and blocked operations. PUBLIC CI passes on the tested branch.
- **Source-only:** these features are not installed in the private bound GAS,
  the write gate is still `false`, no processing trigger exists, the old
  writer has not been disabled and no production record was changed.

## Stage D emulator investigation (BLOCKED, 2026-10-24)

An isolated synthetic Firestore emulator was used solely to investigate the exact REST transaction paths; no production project or private data was touched. `documents:beginTransaction` returned a token, but the first transaction-bound `documents.get?transaction=...` stopped responding in each of four cases and timed out after 40 seconds. This is not proof of a production Firestore defect, nor proof of transactional safety.

The pre-existing mocked queue tests (21/21), public boundary checks, app tests and normal Firestore security-rules tests (37/37) passed in the last full run. **Live Firestore transaction serialization, logical uniqueness and shelf rename remain UNVERIFIED.** The test-only wide-open synthetic rules and the long-running blocked experiment have been removed from mandatory CI to conserve GitHub Actions minutes. Evidence remains in public Actions runs `40099342392`, `40099556695` and `40099701410` and commit history.

The emulator result alone cannot authorize cutover. As no staging Firebase project is available, the owner authorized narrowly scoped production probes (below); independent operational and business-command acceptance are still required before any production cutover.

## Stage D production read-only probe (PASS, 2026-10-24 23:19:47 JST)

The owner authorized a **production environment test** on 2026-10-24 because
no staging Firebase project exists. The completed first step was restricted to
**read-only transactions and rollback**, with zero Firestore mutations, zero
Sheet edits, and no replacement of the old writer.

For this step, paste only `gas/ProductionReadProbe.gs` into the existing
private Sheet-bound Apps Script project, next to `Code.gs`. Run the manual
function `yondeneProductionReadProbe` once. It verifies the project and owner
against the private `同期状態` tab, reads the live family baseline, begins the
same default Firestore read-write transaction used by Stage C, performs a
transaction-bound family GET and a deliberately unmatched book query, then
rolls back. It returns PASS only after rollback completes. Logs contain no
family ID, UID, title or response body.

The read-only PASS log was `tx read/query/rollback; Firestore更新0件`.
The probe **does not** test commits or concurrent writes, activate
`WRITE_ENABLED`, install a trigger, change `設定!B2/C2`, or merge this PR.
Even a passing probe cannot justify production writer cutover. A subsequent
explicitly scoped synthetic-only commit test and independent audit are still
needed. Never run `yondeneQueueProcess` during this phase.

## Stage D synthetic production commit probe (PASS, 2026-10-24 23:34:10 JST)

The owner approved production-environment testing on 2026-10-24 and the
read-only manual probe reported PASS at 23:19:47 JST: transaction-bound GET,
runQuery and rollback completed with zero writes.

The owner completed the **one-shot, manually invoked synthetic-only write test**:
`gas/ProductionCommitProbe.gs` exports `yondeneProductionCommitProbe`. Paste
this as a **separate** file into the existing private bound Apps Script project.
It validates the same private project, family and owner as the read probe,
then uses a read-write REST transaction to create **exactly two documents** in
the unrelated root collection `yondene_gas_acceptance_tests`, not under
`families`. Both writes carry `exists:false`; commit is attempted **once**.
After verifying both documents, a non-transactional duplicate create is
expected to fail. Any unexpected response is reported for manual review
without a blind retry.

At the time of commit PASS, the two synthetic proof documents were retained
for independent reconciliation and cleanup, completed later as documented
below. Do not rerun the function; a new invocation generates another ID.
The script has no automatic cleanup, triggers, spreadsheet writes, real
book/series/marker writes, or writer-gate enablement. This is not a test
of two truly concurrent writers or of an actual family rename. Those and
the writer cutover remain blocked.

## Stage D independent production reconcile and cleanup (PASS, 2026-10-24 23:46:12 JST)

At 23:34:10 JST on 2026-10-24, the owner reported PASS for the
synthetic atomic two-document commit, duplicate rejection and fresh reads.
The resulting random `testId` remains **PRIVATE** (in the bound Script logs
and the owner's chat), and is never hardcoded in this public repository.

`gas/ProductionCleanupProbe.gs` is a separate manual function:
`yondeneProductionProbeReconcileAndCleanup`. The owner replaced the
sole `REPLACE_WITH_TEST_ID` placeholder in their PRIVATE Apps Script copy,
without committing the actual value to PUBLIC. The default source fails closed. It independently reads and fully validates
the **two exact synthetic documents**, their names, data marker, source,
nonce, timestamp and server updateTime. It then opens a transaction,
reads again and deletes **only those two** with updateTime preconditions
in an atomic commit. Final fresh GETs must both be 404 for PASS.

Any discrepancy aborts before deletion. Unknown commit outcomes never
blindly retry. No family, book, series, mutation-marker or Sheet document is
written, and the queue write gate remains disabled. Do not run twice.
At 23:46:12 JST the owner reported `PASS: independentReconcile/atomicDelete2/notFound2`.
Both test-only documents were conditionally deleted and separately confirmed
absent (404/404). The reported real Firestore data changes were zero;
no production testId, family identifier or UID is stored here.

**Stage D result:** production read/query/rollback, atomic synthetic commit,
duplicate-create rejection, independent reconcile and conditional two-document
cleanup have passed. Zero synthetic test documents remain. This does **not**
prove a real `family.rename`, concurrent old/new writers, full Stage C command
parity, or readiness to enable GAS writes.

## Stage E one-shot REAL family rename — PASS, 2026-10-25 00:07:08 JST

On 2026-10-24 the owner explicitly approved one real shelf-name change
as a bounded production acceptance test. This is **not** approval to
turn on the general GAS command writer or polling triggers.

- Public template: `gas/ProductionRenameProbe.gs` exports
  `yondeneProductionRenameOnce`. Copy it into a NEW file in the
  PRIVATE Sheet-bound Apps Script, leaving existing `Code.gs` and
  the installed Stage A `Queue.gs` intact.
- In that private copy only, replace `REPLACE_WITH_OLD_NAME` and
  `REPLACE_WITH_NEW_NAME` with the exact authorized source and target
  names. Never push those live values to PUBLIC.
- Require private `設定!B2` to equal the target and `C2` to equal the
  source. Verify an empty update queue and the common GAS write gate
  remains hardcoded off. A mismatch aborts without a Firestore commit.
- Reconcile the target family and owner; reject an existing deterministic
  marker; begin a read-write transaction, re-read the family and marker,
  confirm original `updateTime` and unchanged other fields.
- Commit exactly two writes in one transaction: masked update of only
  `families/{id}.name` with `updateTime` CAS, plus create-only
  `chatgptMutations/{commandId}` with the same schema/digest as Stage C.
- Independently verify new name, other family fields unchanged, marker
  digest, ID and target; **only then** advance private `設定!C2`.
  No book/series/history mutations, `Queue.gs` gate change, trigger,
  automatic retry or private GitHub writer decommissioning.
- Any post-commit uncertainty or verification failure is a STOP condition.
  Do not re-run blindly; independently reconcile first.

The exact live shelf names, family ID, owner UID and verification log
remain private. CI mocks exercise success, failure, drift, idempotency
precondition and uncertain commits; no CI job accesses production.

At 00:07:08 JST on 2026-10-25, the owner reported:

`よんでね本棚名変更 PASS: family.rename CAS+marker+verified; 設定C2反映`

`Firestore家族name以外のフィールド変更0件・読書記録変更0件・通常writer無効のまま`

A fresh independent Google Sheets API read confirmed the private `設定`
tab had matching `B2` and `C2` and `D2` reported no pending change.
The actual live values and family identifiers are intentionally not included
in this PUBLIC repository. The one-shot Stage C-compatible immutable mutation
marker is retained as the proper permanent audit record.

**Stage E is CLOSED for this single change only.** This test **does not**
establish simultaneous writer safety, other Stage C operation parity, or
authorization for full cutover.

## Future cutover (not started)

1. Close the blockers, reconcile the current Firestore books, series and
   markers, and independently validate a read-only snapshot.
2. Stop old command intake and disable **all** private Actions writer
   entry points before enabling GAS.
3. Separately review, authorize and reconcile bounded *general queue*
   operations; the one-shot family rename is not a substitute for those tests.
4. Only on explicit owner approval install/enable GAS polling. Keep the
   `Code.gs` mirror, Sheets and Firestore private.
5. Migrate Firebase Hosting to verified PUBLIC code in a separate release,
   with a rollback path and real-device acceptance.
