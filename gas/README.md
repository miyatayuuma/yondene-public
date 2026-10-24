# Google Sheets → GAS → Firestore command queue (Stage A)

This folder is public code only. Do not commit a Sheet URL/ID, family ID,
owner UID, real command JSON, book records, or OAuth credentials.

## Current production authority

- Firestore remains the sole authoritative database.
- The existing private Sheet-bound Code.gs keeps its hourly Firestore → Sheets
  mirror. Do not replace or publish that file: it contains a private Sheet ID.
- The private GitHub Actions writer remains authoritative until an explicit
  one-writer cutover. Do not disable it yet.
- Queue.gs is a separate addition to that bound Apps Script project.
- Stage A: WRITE_ENABLED is false. No queue trigger is installed and
  yondeneQueueProcess cannot write to Firestore in this version.

## Install auditing code (owner only)

1. Open the private よんでね Firestore同期台帳 spreadsheet.
2. Extensions → Apps Script. Keep the working Code.gs.
3. Add a NEW script file named Queue. Paste the full gas/Queue.gs source
   from this public repository and save.
4. Select yondeneQueueDryRun at the top of Apps Script and press Run.
5. The execution log should end in a line like:
   queue dry-run pending=0 ready=0 review=0 writeEnabled=false
6. Do not run yondeneQueueProcess. It intentionally fails with a
   write-disabled message. Do not create a trigger for it.

The existing read-only hourly sync remains independent.

## Queue sheet structure

更新キュー has 10 columns: コマンドID, 登録時刻, 操作, コマンドJSON,
状態, 処理日時, 結果コード, SHA256, 試行回数, エラー概要.

The owner must keep the spreadsheet private and restrict editors. The hourly
mirror overwrites 本棚 and Firestore原本 but never edits 更新キュー.
Editing the mirror tabs cannot update Firestore.

The planned chat-driven command includes schemaVersion, a unique commandId,
an explicit patch, reason, and expectedUpdatedAt with expectedTitle or
expectedName. Only book.patch and series.patch are parsed in Stage A.
Creates, deletes, child quotes/ratings, title/author/ISBN changes, and
series renames require later review and code. No production command should
be queued during installation or testing.

## Planned cutover (NOT yet done)

1. Review code and run tests with fake identities; separately audit the
   private legacy commands and mutation markers.
2. Disable all GitHub writer entry points only after the cutover is ready.
   Historical commands and markers remain immutable.
3. Compare Firestore data and mutation marker state.
4. Approve one narrowly bounded production acceptance command and enable
   GAS writes in a reviewed release, never by flipping a Sheet cell.
5. Reconcile the document, marker, digest and result in a separate run.
   Then install the GAS polling trigger.
6. Reach feature parity for create, ratings, reflections and other operations
   before fully retiring old behavior.

A Firestore REST documents:commit call atomically updates the document
subject to updateTime CAS and creates an exists:false mutation marker.
A matching marker means an idempotent replay; a mismatch halts.
An uncertain commit response goes to manual review instead of blind retry.

## Tests

    node --test gas/queue.test.mjs

Tests use fake identities and mocked Google APIs; no private systems are
contacted. Node 20+ is sufficient.

Queue.gs requires private bound-script helpers from the existing Code.gs:
YONDENE, yondeneFirestoreRequest_, yondeneField_, yondeneSha256_.
It is NOT a standalone public web app.
