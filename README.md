# よんでね

家族向け児童読書記録PWAと「本の森」。この**公開リポジトリにはアプリ／Worker／GASの共通コード、匿名テスト、公開可能な素材と手順のみ**を置く。家族の書籍記録、読後感想、家族・子どもの識別子、非公開SheetsのID・内容、認証情報、権利未確認の画像・本文を保存しない。

## 現行運用（2026-11）

| 役割 | 正本・配置 |
| --- | --- |
| 本棚、読書状態、感想、★、家族、適用履歴 | **Firestore が唯一の正本** |
| 同期と更新 | 非公開Sheetsの読取ミラー＋更新キュー → 非公開GAS `yondeneQueueProcess` → Firestore |
| 非公開のNPC人物設定・原作記憶・会話資料 | 非公開Sheets「本の森 キャラクター設定・セリフ台帳」 |
| NPCスプライト | 認証付きの非公開Google Drive |
| 本の森のAI会話 | Cloudflare Worker `yondene-forest-ai`（Workers AI / Gemma） |
| コードの正本 | このリポジトリの `main` |

非公開GASの通常writerは本番で稼働する運用。**公開GASコードの安全初期値 `WRITE_ENABLED=false` で実運用設定を上書きしない。** 本棚の変更にGitHub ActionsやHosting再配信は使わない。

## 情報の取り扱い

本の森の会話生成時には、人物設定、選択された既読作品の出典付き要約、会話の文脈、**子どもの感想または保護者要約の一部**をCloudflare Workers AIへ送る場合がある。これは認証済みアプリの実行時通信であり、**感想や家族の実データを公開GitHubへ登録することとは異なる**。ユーザー識別子と書籍内部IDを生成プロンプトへ含めない実装である。詳しくは [Workerの説明](cloudflare/forest-ai/README.md)。

公開のWeb SDK設定値・Worker URLはクライアント用識別子であり、管理者秘密鍵ではない。認証情報はGitHubに保存しない。原作キャラクターの画像は非公開Driveに置き、第三者素材は [ライセンス台帳](reading-shelf-firebase/forest-assets/README.md) に従う。

## 構成と検証

- `reading-shelf-firebase/`：Hostingアプリ、Firestore Rules、単体テスト。
- `cloudflare/forest-ai/`：会話Workerとそのテスト。
- `gas/`：公開可能な汎用GASコード、匿名テスト。
- `scripts/`：公開境界チェック、音声実験室生成、描画検証。
- `docs/`：現行運用・設計・歴史的な記録。

公開前チェック：`node scripts/check-public-boundary.mjs`。この検査は**現在の追跡ファイル**が対象であり、旧Git履歴・PRコメント・Actionsログ・著作権の最終判定を代替しない。GitHub Actionsで各種テストも実行する。

## 配信・移行

本番URL： https://kodomo-reading-shelf-87f11.web.app/

[WorkerとHostingの安全な配信手順](docs/DEPLOYMENT.md) ／ [公開リポジトリ履歴刷新の移植範囲と受入条件](docs/REPOSITORY_REFRESH_SCOPE.md)

リポジトリの再作成は**コード管理だけの変更**であり、Firestore、Sheets、GAS、既存の本番サービスを再作成しない。
