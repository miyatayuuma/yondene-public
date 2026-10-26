# よんでね — 非公開Sheets更新キュー

**通常経路**：ChatGPT → 非公開Sheets `更新キュー` → 非公開Apps Script `Queue.gs` → Firestore（正本）。適用後はFirestore→Sheetsの読み取り専用同期で照合する。

公開GitHubには汎用コード `Queue.gs` と匿名テストだけを置き、家族ID、UID、書籍の実データ、コマンド本文、認証情報は保存しない。

## 通常writer

- 旧GitHub Actions本棚writerは2026-10-26に撤去済み。
- GAS限定本番受入はPASS。公開ソースの `WRITE_ENABLED` は意図的に初期値 `false`。実際の非公開Apps Scriptでは2026-10-26 23:05のdry-runログで `true` を確認済み（公開ソースを直接動かしても本番writerは有効にならない）。
- 非公開Apps Scriptには `yondeneQueueProcess` を5分ごと、Firestore→Sheetsの `yondeneSyncNow` を1時間ごとに設置済み。23:10〜23:30の自動Queue実行は複数回正常終了、キューは0件。今後の通常 `book.create` 等のキュー適用は本番自動実行として未検証。
- 実行処理は `yondeneQueueProcess`、読み取りだけの検査は `yondeneQueueDryRun`。
- 操作は `book.create`, `book.patch`, `series.create`, `series.patch`, `childRating.set`, `childReflection.create`, `catalog.audit`、設定シートからの `family.rename` に対応。
- 更新前リビジョン、書名・ISBN重複、適用マーカーを検査し、Firestoreへの書き込みは原則トランザクションで行う。結果不明のコマンドを自動再試行しない。
- 書誌・版・読了期間・本人の発言・★評価を推定して登録しない。

## 今後の保護

Firestore正本と今後の更新を保護する。ユーザーは課金設定を変更せず、1時間ごとの非公開Sheets現在値ミラーをバックアップ先に採用した。これは完全な世代管理・災害復旧バックアップではなく、誤更新の伝播や過去版の復元不可という残存リスクがある。ネイティブFirestore日次バックアップは採用しない。旧GitHub履歴アーカイブとGitHubバックアップは不要。旧GitHub専用OIDC Provider 2件と委任2件は2026-10-26に失効確認済み。

[廃止チェック](../docs/PRIVATE_REPO_RETIREMENT.md)。
