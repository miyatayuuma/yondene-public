# Apps Script

`Queue.gs` は公開可能な通常writer。非公開側の同期コードと組み合わせる。トリガー実行と手動dry-runは、既存の正規アカウント・プロジェクトに対して運用する。公開コードの `WRITE_ENABLED=false` は安全初期値。稼働中の設定は差分を比較して保持する。

| 操作 | 用途 |
| --- | --- |
| `book.create`、`book.patch` | 書籍の新規登録・個別の変更。登録前に同一書籍を照合する。 |
| `series.create`、`series.patch` | シリーズの新規作成・更新。 |
| `catalog.audit` | 厳格な変更前条件付きの書誌項目照合。 |
| `childRating.set`、`childReflection.create` | 本人が明示した評価と、帰属を区別した感想。 |
| `recommendation.create`、`recommendation.cover.patch` | 推薦者ごとの記録と書影。 |
| 設定の本棚名 | 設定欄から家族名を変更し、確認済み値を同期。 |

列・JSONの検証、変更前リビジョン、同一書籍検査、Firestoreトランザクション、適用マーカーを使う。通信結果が不明なら更新キューとFirestoreを照合する。

`ForestPersonaProbe.mjs` は開発用のGemma検証。通常writerとは別に運用する。公開ソースからGAS用ファイルを生成する手順は [開発・検証](../docs/DEVELOPMENT.md) を参照。
