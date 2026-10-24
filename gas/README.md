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
| `book.patch` | Family owner, ID/title/updatedAt, allowed fields | CAS update + create-only marker |
| `series.patch` | Family owner, ID/name/updatedAt, rename held | CAS update + marker |
| `book.create` | Family owner, ID absence, ISBN/title+author, series lookup, cover URL | Create-only book + marker |
| `series.create` | Family owner, ID absence, duplicate-name query | Create-only series + marker |
| `childRating.set` | Family owner, ID/title/status and existing rating | Create-only rating + marker; same stars → marker only |
| `childReflection.create` | Family owner, ID/title, reflection/activity absence | Create-only reflection + activity + marker |
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
2. Recheck parity for required legacy commands such as `book.patchByTitle`,
   deletion, catalog audits and corrections. Never make automatic deletion
   part of an unreviewed import.
3. Test genuine concurrent Firestore transactions, conflicts and historical
   marker integrity in an isolated test project. Mocks are necessary but
   insufficient as a production acceptance substitute.
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

## Stage D emulator investigation (BLOCKED, 2026-10-24)

An isolated synthetic Firestore emulator was used solely to investigate the exact REST transaction paths; no production project or private data was touched. `documents:beginTransaction` returned a token, but the first transaction-bound `documents.get?transaction=...` stopped responding in each of four cases and timed out after 40 seconds. This is not proof of a production Firestore defect, nor proof of transactional safety.

The pre-existing mocked queue tests (21/21), public boundary checks, app tests and normal Firestore security-rules tests (37/37) passed in the last full run. **Live Firestore transaction serialization, logical uniqueness and shelf rename remain UNVERIFIED.** The test-only wide-open synthetic rules and the long-running blocked experiment have been removed from mandatory CI to conserve GitHub Actions minutes. Evidence remains in public Actions runs `40099342392`, `40099556695` and `40099701410` and commit history.

Do not enable writes or retire the PRIVATE writer on this evidence. A separate isolated Firestore staging project and independently reviewed, bounded acceptance are required before any production cutover.

## Stage D production read-only probe (owner approved; not yet run)

The owner authorized a **production environment test** on 2026-10-24 because
no staging Firebase project exists. The first step is restricted to
**read-only transactions and rollback**, with zero Firestore mutations, zero
Sheet edits, and no replacement of the old writer.

For this step, paste only \`gas/ProductionReadProbe.gs\` into the existing
private Sheet-bound Apps Script project, next to \`Code.gs\`. Run the manual
function \`yondeneProductionReadProbe\` once. It verifies the project and owner
against the private \`同期状態\` tab, reads the live family baseline, begins the
same default Firestore read-write transaction used by Stage C, performs a
transaction-bound family GET and a deliberately unmatched book query, then
rolls back. It returns PASS only after rollback completes. Logs contain no
family ID, UID, title or response body.

The probe **does not** test commits or concurrent writes, activate
\`WRITE_ENABLED\`, install a trigger, change \`設定!B2/C2\`, or merge this PR.
Even a passing probe cannot justify production writer cutover. A subsequent
explicitly scoped synthetic-only commit test and independent audit are still
needed. Never run \`yondeneQueueProcess\` during this phase.

## Future cutover (not started)

1. Close the blockers, reconcile the current Firestore books, series and
   markers, and independently validate a read-only snapshot.
2. Stop old command intake and disable **all** private Actions writer
   entry points before enabling GAS.
3. Stage and authorize one bounded production command with a separate
   reconcile after execution. Verify Firestore and private Sheet values.
4. Only on explicit owner approval install/enable GAS polling. Keep the
   `Code.gs` mirror, Sheets and Firestore private.
5. Migrate Firebase Hosting to verified PUBLIC code in a separate release,
   with a rollback path and real-device acceptance.
