# よんでね

子どもの読書記録PWA。公開GitHubにはアプリ・GAS共通コード・テストだけを保存し、実際の個人データは保存しない。

## 現在の運用構成（2026-10-26）

- **Firestore**：現在の本棚データの唯一の正本。書籍、シリーズ、家族、読書状態、感想、★評価、適用マーカーを管理。
- **非公開Google Sheets**：Firestoreの読み取り専用同期と、承認済みコマンドの更新キュー。現在の運用に必要な6タブのみ。
- **非公開Apps Script**：Sheetsの承認済みコマンドをFirestoreへ適用する単一writer。通常処理は、最終設定が確認されるまで無効。Firestore→Sheets同期は継続。
- **公開GitHub**：PWA・GASコード・匿名のテスト・CI・運用手順。
- **旧GitHub**：更新用Actionsは撤去済み。非公開リポジトリは削除待ち。

旧GitHub履歴の退避やGitHub Actionsバックアップは不要。保護するのは**現在のFirestoreデータと今後の更新**だけである。既存の適用マーカーと読書記録は現在のデータ整合性に必要なので削除しない。

## バックアップ

Firestoreのネイティブ日次バックアップ（保持7日）を推奨する。バックアップは**Blazeプランと有償保存容量**が必要で、設定・初回バックアップの存在確認が済むまで稼働中とみなさない。非公開Sheetsは可変の同期ミラーであり、災害復旧用のバックアップではない。

## 開発・配信

`reading-shelf-firebase/` がHostingアプリ、`gas/` がGAS共通コード。デプロイは `firebase deploy --only hosting` とし、Firestore Rulesや本棚データを書き換えない。公開GitHub mainのコードを唯一の開発正本とする。

[運用・廃止チェック](docs/PRIVATE_REPO_RETIREMENT.md)。
