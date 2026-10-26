# よんでね — 非公開Sheets更新キュー

**通常経路**：ChatGPT → 非公開Sheets `更新キュー` → 非公開Apps Script `Queue.gs` → Firestore（正本）。適用後はFirestore→Sheetsの読み取り専用同期で照合する。

公開GitHubには汎用コード `Queue.gs` と匿名テストだけを置き、家族ID、UID、書籍の実データ、コマンド本文、認証情報は保存しない。

## 通常writer

- 旧GitHub Actions本棚writerは2026-10-26に撤去済み。
- GAS限定本番受入はPASS。**通常writer `WRITE_ENABLED` はソース初期値false**。実際の非公開Apps Scriptに適用した設定はこの公開リポジトリだけからは確認できない。
- 権限確認と正式な有効化が済むまでは、通常処理の自動トリガーを設置しない。
- 実行処理は `yondeneQueueProcess`、読み取りだけの検査は `yondeneQueueDryRun`。
- 操作は `book.create`, `book.patch`, `series.create`, `series.patch`, `childRating.set`, `childReflection.create`, `catalog.audit`、設定シートからの `family.rename` に対応。
- 更新前リビジョン、書名・ISBN重複、適用マーカーを検査し、Firestoreへの書き込みは原則トランザクションで行う。結果不明のコマンドを自動再試行しない。
- 書誌・版・読了期間・本人の発言・★評価を推定して登録しない。

## 今後の保護

Firestore正本と今後の更新だけを保護する。ネイティブFirestore日次バックアップの設定と初回生成確認が済むまで、復元用バックアップは未確認と扱う。旧GitHub履歴アーカイブとGitHubバックアップは不要。

[廃止チェック](../docs/PRIVATE_REPO_RETIREMENT.md)。
