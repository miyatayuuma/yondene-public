# よんでね

家族で使う児童読書記録PWAです。本棚で読書の進み具合や感想を振り返れます。管理者は「本の森」で、本の登場人物と出会い、会話できます。

| 役割 | 場所 |
| --- | --- |
| 本棚・読書記録・家族・推薦の正本 | Firebase Firestore |
| ChatOps・同期ミラー | 非公開「よんでね Firestore同期台帳」と連携するGAS |
| 人物設定・根拠・物語記憶 | 非公開「よんでね｜本の森 キャラクター設定・セリフ台帳」 |
| 森のキャラクター画像 | 認証付きの非公開Google Drive |
| 森の会話生成 | Cloudflare Workers AIのGemmaを呼ぶ `yondene-forest-ai` |
| アプリとFirestore Rulesのコード | `reading-shelf-firebase/` |
| Workerと通常ChatOpsのコード | `cloudflare/forest-ai/`、`gas/Queue.gs` |

会話に必要な場合、承認済みの既読情報、感想または保護者要約の一部、人物設定と会話の文脈をCloudflareへ送信します。公開リポジトリには共通コード、架空のテストデータ、ライセンス確認済みの素材を置きます。非公開データ、私有素材、識別子、認証情報は元の保管場所で管理します。

- [アプリを開く](https://kodomo-reading-shelf-87f11.web.app/)
- [製品仕様](docs/PRODUCT.md)
- [本の森仕様](docs/FOREST.md)
- [運用・デプロイ・台帳切替](docs/OPERATIONS.md)
- [開発・検証](docs/DEVELOPMENT.md)
- [ChatGPTプロジェクト指示の改訂案](docs/CHATGPT-PROJECT-INSTRUCTIONS.md)
