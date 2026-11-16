# よんでね｜現在の配信・変更境界（2026-11）

## 変更対象を最初に区別する

| 変更内容 | 必要な操作 |
| --- | --- |
| 本棚・シリーズ・読書記録・感想・★ | 非公開Sheetsの更新キュー → 実運用GAS → Firestore。**Hostingのデプロイ不要** |
| 本の森の人物設定・台詞・物語記憶 | 非公開Sheets更新 → アプリで素材を再読み込み。通常はコードデプロイ不要 |
| PWAのHTML / JS / CSS / 配置 | **Firebase Hostingのみ**をデプロイ |
| 本の森のWorkerコード・共通会話プロトコル | **Cloudflare Worker**を明示した設定・名前でデプロイ |
| Firestore Rules | 別の本番変更。今回のHosting配信に含めない |
| GitHub履歴刷新・文書・CI | GitHubのコード管理のみ。**Worker・Hosting・Firestoreは変更しない** |

Firestoreが本棚の唯一の正本。非公開Sheetsは同期ミラー＋更新キューであり、同期面の直接編集をFirestoreへ転送しない。公開GAS `Queue.gs` の `WRITE_ENABLED=false` は安全初期値であり、実運用の非公開設定を上書きしない。

## 配信前ゲート

1. 最新 `main` と対象コミット・未統合PRを確認。
2. `node scripts/check-public-boundary.mjs`、必要な単体テスト・CI・Firestore Rulesエミュレータテストを確認。境界検査は履歴全体・著作権・本番アクセス制御の保証ではない。
3. 変更対象がWorkerかHostingかを特定し、別サービスへの誤配信を防ぐ。
4. 必要な場合だけ、本番の直前リリース・復旧方法を確認。実際の家族データはGitに置かない。

## Cloudflare Worker（変更する場合のみ）

リポジトリの `cloudflare/forest-ai` で `wrangler.toml` の `name="yondene-forest-ai"` と `src/index.mjs` の存在を確認。既存Workerの秘密情報・無料枠設定に触れない。

```sh
cd cloudflare/forest-ai
npx --yes wrangler@4 deploy ./src/index.mjs --config ./wrangler.toml --name yondene-forest-ai
```

`wrangler deploy` 単独実行は禁止。本番 `https://yondene-forest-ai.akebi-lab-2611.workers.dev/health` の `configured`、`version`、`protocolRevision`、`registryRevision` を検証し、Hosting側と整合することを確認。

## Firebase Hosting（変更する場合のみ）

`reading-shelf-firebase/firebase.json` があるディレクトリから実行する。

```sh
cd reading-shelf-firebase
firebase deploy --only hosting --project kodomo-reading-shelf-87f11
```

**`--only hosting` を省略しない。** `firebase.json` にFirestore Rulesも含まれるため、無指定の `firebase deploy` は別の本番設定を変更し得る。

本番URL： https://kodomo-reading-shelf-87f11.web.app/

配信後は、ログイン・本棚表示・活動・感想・★、必要に応じ本の森の操作を検証。Workerを変更した場合は原則Worker→Hostingの順。

## GitHubリポジトリ刷新

新規リポジトリへの移植は **Git履歴・Issue・PR・設定の移行**であって、Firestore、Firebase Hosting、GAS、Cloudflare Workerの新規作成ではない。旧リポジトリの削除・名称切替は、[リポジトリ刷新の受入条件](REPOSITORY_REFRESH_SCOPE.md) を満たしてから別工程で実施する。

旧移行の2026-10運用ログは歴史的記録であり、現在のwriter設定やデプロイの指示として利用しない。
