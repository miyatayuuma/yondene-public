# Google Sheets → GAS → Firestore command queue

Public, **code-only** source. Never commit a private spreadsheet ID/URL,
family ID, owner UID, real book/series record, actual queue JSON,
OAuth credential, deployment ID, or family-specific log.

## Authority and deployment state (Stage B draft)

- **Production** still uses Firestore as its sole source of truth.
- The private Sheet-bound Apps Script `Code.gs` provides read-only hourly
  Firestore → Sheets mirroring. Preserve it: it contains private configuration.
- The owner installed **Stage A** `Queue.gs` as a separate bound script and
  successfully ran a dry run with 0 pending commands on 2026-10-24.
- **Stage B source in this branch is not installed in GAS and not approved for
  production writing.** It must not be copied into production as a writer.
- The old private GitHub Actions single-writer remains active until an
  separately approved cutover. **Do not allow two writers.**
- `WRITE_ENABLED: false` is hardcoded. `yondeneQueueProcess()` refuses to
  execute even if someone creates a trigger.

## Stage B implementation under review

| Operation | Preflight | Planned atomic Firestore commit |
| --- | --- | --- |
| `book.patch` | ID/title/updatedAt and allowed field audit | CAS update + create-only marker |
| `series.patch` | ID/name/updatedAt audit; rename held | CAS update + create-only marker |
| `book.create` | ID absent, ISBN/title+author check, series present, cover URL | Create-only book + marker |
| `series.create` | ID absent, same name check | Create-only series + marker |
| `childRating.set` | Book ID/title/status; conflicting stars refused | Create-only rating + marker; identical stars → marker only |
| `childReflection.create` | Book ID/title, reflection/activity IDs absent | Create-only reflection + activity + marker |

All commits use one Firestore REST `documents:commit` request. On an
uncertain result, a matching marker digest is required to resolve ALREADY;
otherwise manual review is required, never blind retry.

**Remaining blockers (before any writer cutover):**

1. The duplicate-title/ISBN/series-name and family-owner checks are currently
   made in **separate reads preceding commit**. A create-only document check
   protects the ID but not logical uniqueness under concurrent requests.
   Replace with a properly bounded Firestore transaction or equivalent
   strong consistency design and test a simulated concurrent creation.
2. Check parity for any legacy operations still needed
   (`book.patchByTitle`, deletion, catalog audit, rating corrections,
   reflection corrections), avoiding unsafe automatic deletes.
3. Independently rehearse staged acceptance, historical-marker integrity,
   authorization/secret isolation, rollback, and the single-writer handoff.
4. Require explicit owner approval for production writes and initial trigger.
   Never activate a writer by a cell toggle.

## Queue structure and dry-run only

`更新キュー` has 10 columns:

`コマンドID, 登録時刻, 操作, コマンドJSON, 状態, 処理日時,
結果コード, SHA256, 試行回数, エラー概要`.

Keep the spreadsheet private with restricted editors. The read-only mirror
never changes this queue; editing a mirror tab does not change Firestore.

To audit the **already installed Stage A**, select
`yondeneQueueDryRun` and press Run. A run with no queued commands reports:

`queue dry-run pending=0 ready=0 review=0 writeEnabled=false`

No production command should be added to the queue yet. Do not run
`yondeneQueueProcess` or install its polling trigger.

## Tests

```bash
node --test gas/queue.test.mjs
```

Tests use fabricated IDs and in-process Google API mocks. They do not access
production data. Source requires the private bound-script helpers
`YONDENE`, `yondeneFirestoreRequest_`, `yondeneField_`, and
`yondeneSha256_`; the public module is not a standalone web app.

## Cutover sequencing (not started)

1. Close the blockers above, then review and test Stage B in isolation.
2. Freeze command intake and reconcile existing Firestore data and mutation
   markers; disable **every** private Action writer entry point.
3. Execute one explicitly approved bounded production acceptance command.
   Verify Firestore record, marker, source digest and Sheets state using an
   independent read-only check. Stop and roll back on unexpected change.
4. Only then enable GAS polling. Migrate Hosting from a separately verified
   PUBLIC source; keep private Sheets and Firestore intact.
