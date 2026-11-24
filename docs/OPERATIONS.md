# 運用・配信

## ChatOps

読む順番は現行の本棚・シリーズ・更新キュー・適用履歴。Firestoreが唯一の正本で、台帳の同期面は読み取り専用ミラー。書誌・書影・あらすじ・重複・現行リビジョンを確認し、更新キューに小さく冪等なコマンドを登録する。新規本は判明した項目を一度に登録する。感想本文は本人の原文と保護者要約を区別する。★と読了日は申告に従う。

`gas/Queue.gs` の `book.create`、`book.patch`、`series.create`、`series.patch`、`catalog.audit`、`childRating.set`、`childReflection.create`、`recommendation.create`、`recommendation.cover.patch` と設定の家族名更新を維持する。詳しい契約は現行ソースの許可フィールド・バリデーションと既存の [GAS説明](../gas/README.md) を参照。

`yondeneQueueProcess` がFirestoreへ書き、`yondeneSyncNow` が台帳へ同期する。dry-runは読取りのみ。キュー登録、`APPLIED / COMMIT_OK`、Firestoreの文書・適用マーカー、同期・画面表示は別の確認段階。競合や結果不明時は元コマンドを残し、対象文書とマーカーを照合する。本棚更新にHosting配信は不要。

## 本番切替

対象コミット、環境、ログイン権限を確認し、下記の操作に必要な承認を得る。現在配信中のビルド識別子とWorker版を控える。

1. Draft PRの回帰テストを確認。テスト専用Gemmaの資格情報で、通常NPC、ねこの自然な筆記と終話、ふたご初対面・再訪、既読作品・感想・伝言、安全な失敗を生成する。実GemmaとAndroid実機での品質判定を記録する。テスト資格情報を利用できない場合は、承認済みの配信と直前版へ戻せる手段を確保し、Androidの認証済み本番会話を最終受入に使う。
2. 人物資料と同期台帳の非公開保存版を確認する。変更するタブがあれば現行配信とロールバック候補の参照先を照合する。
3. `cloudflare/forest-ai/` で `wrangler.toml` の名前・エントリを確認し、Workerを先に配信する。
   ```sh
   npx --yes wrangler@4 deploy ./src/index.mjs --config ./wrangler.toml --name yondene-forest-ai
   ```
   正式Workerの `/health` で `configured`、`version`、`protocolRevision`、`registryRevision` を照合する。この変更ではWorkerの版を更新し、ブラウザとの入出力プロトコルは現行版と互換。
4. `reading-shelf-firebase/firebase.json` のディレクトリから `npx firebase deploy --only hosting --project kodomo-reading-shelf-87f11`。公開HTMLの `data-app-build`、PWAの更新後起動とログイン、実機の主要動線を確認する。Worker配信前に `wrangler deployments list` で現行のバージョンIDを、Hosting配信前にFirebase Consoleのリリース履歴で現行リリースを控える。戻す際は、人物設定に追加した名前ペア行を先に差し戻し、Hostingの直前リリースとWorkerの直前版を対応させる。
5. 通常writer更新が承認されたら実運用のGASと公開 `Queue.gs` の差分を照合する。既存の認証、トリガー、`WRITE_ENABLED=true`、非公開 `Code.gs` を保持して該当部分だけ更新する。公開側の初期値は `false`。dry-run、ロック、既存マーカーの扱いを確認する。Firestore Rulesは本差分に伴う配信対象に含めない。

## 人物台帳

| タブ | 役割と形式 |
| --- | --- |
| 人物設定 | `NPC ID / 項目 / 内容 / 根拠区分 / 根拠資料ID / 適用範囲 / 監修状態 / 設定版`。1項目1行。既存の人物・話し方の項目と監修条件を維持する。 |
| 根拠資料 | 現行10列のうちパーサーが必要とするのは `資料ID / 根拠の種別 / 確認状態`。版、本文位置やURL、確認メモを編集のため残す。 |
| 物語記憶 | `schemaVersion / memoryId / bookId / bookTitle / text / tags / characters / spoilerLevel / evidenceStatus / confidence / sourceUrl`。追加の編集列は維持可。運用範囲は A1:N140。 |
| 運用ガイド | 台帳の編集手順と出典区分。 |

原作事実・二次情報・編集解釈・ゲーム演出は区別する。旧人物・話し方・原作・物語資料は非公開保存版から参照できる。台本の文面をそのまま人物設定や原作事実に転記しない。

ふたごの名前は人物設定の `twins / 名前ペア / JSON` 行で管理する。ペアごとに `schemaVersion:1`、`id`、`firstName`、`secondName`、`approval:"approved"` を持つ。既存ペアのID・順序・名前を保持する。旧Hostingへ戻すときは、使用する版が旧形式を要求するかを確認する。必要な場合は非公開保存版からその版の参照タブを復元し、旧パーサーと互換の人物設定スナップショットを用意してからHostingを戻す。

## Gemma検証

専用の非公開ブックに設定・キュー・結果・シナリオと、人物設定・根拠資料・物語記憶のスナップショットを置く。リポジトリのルートで `node scripts/build-forest-persona-probe.mjs` を実行し、生成した `gas/ForestPersonaProbe.gs` を専用ブックに紐づくGASへ保存する。スナップショットの出典と版を確認する。

正規テスト認証は専用GASのスクリプトプロパティ `CLOUDFLARE_AI_TEST_ACCOUNT_ID` と `CLOUDFLARE_AI_TEST_TOKEN` に設定する。同期ミラーを使うシナリオにはその読み取り先を指定する。新規シナリオだけを `PENDING` にして `yondeneGemmaTestProcessQueue` を実行し、結果行と会話内容を照合する。旧DRAFTとERRORは履歴として保全する。

実Gemmaの疎通試験は、ねこ・ふたご・キキの3件で実生成、結果保存、基本出力形式を確認済み。人物台帳原本は運用4タブで、検証の設定・キュー・結果・シナリオは専用ブックに置く。原本に紐づく旧検証トリガー、実行コード、設定を退役済み。旧台本・旧検証タブ・旧コードは非公開保存版で保全する。

## 同期台帳

日常運用のタブは本棚・シリーズ・Firestore原本・同期状態・更新キュー・設定。開発環境メモと推薦書影の一時作業資料は非公開保存版から参照できる。Firestoreの適用証跡は更新キューと対象文書・適用マーカーを照合する。

実運用GASは同期と通常writerを運用し、時間主導トリガーは `yondeneSyncNow` と `yondeneQueueProcess`。変更前のコードは非公開保存版に保全する。戻す際は実運用プロジェクトに必要なコード差分を復元し、公開版の無効設定や保存版の参照先で実運用設定を上書きしない。復元後は `yondeneQueueDryRun` と読み取り同期を確認する。
