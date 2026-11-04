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

## 2026-11-04 定期実行エラーの抑制

- 2026-10-27〜11-04のGoogle通知7通に記録された`yondeneQueueProcess`失敗25件のうち、19件は「別のよんでね処理が実行中です。」というロック競合だった。
- 競合時は1秒以内にロックが取れなければ`SKIPPED_LOCK_BUSY`として正常終了する。キューの行と状態は変更せず、次の定期実行に任せる。
- `PENDING`が0件で本棚名の変更指示もなければ`IDLE`として正常終了し、OAuthトークン取得・Firestoreリクエストを行わない。
- 本棚名のみの変更依頼と通常コマンドは従来どおりトランザクションで実行する。書き込み結果が不明な場合の無条件再実行は禁止したまま。
- **本番の非公開GASは自動更新されない。** 非公開`Queue.gs`の`yondeneQueueProcess()`関数のみを、この公開版と同一内容に差し替える。公開版の`WRITE_ENABLED:false`を含むファイル全体を上書きしない。反映後に実行ログで`IDLE`、競合時は`SKIPPED_LOCK_BUSY`、実コマンド時は`PROCESSED`を確認する。

## 今後の保護

Firestore正本と今後の更新を保護する。ユーザーは課金設定を変更せず、1時間ごとの非公開Sheets現在値ミラーをバックアップ先に採用した。これは完全な世代管理・災害復旧バックアップではなく、誤更新の伝播や過去版の復元不可という残存リスクがある。ネイティブFirestore日次バックアップは採用しない。旧GitHub履歴アーカイブとGitHubバックアップは不要。旧GitHub専用OIDC Provider 2件と委任2件は2026-10-26に失効確認済み。

[廃止チェック](../docs/PRIVATE_REPO_RETIREMENT.md)。
