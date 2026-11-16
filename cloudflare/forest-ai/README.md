# 本の森 AI Worker（現行運用）

Cloudflare Workers AI `@cf/google/gemma-4-26b-a4b-it` に接続する、**管理者限定**の会話生成Worker。

- Worker名：`yondene-forest-ai`
- エントリ：`cloudflare/forest-ai/src/index.mjs`
- 設定：`cloudflare/forest-ai/wrangler.toml`
- 本番URL： https://yondene-forest-ai.akebi-lab-2611.workers.dev
- ブラウザ・Worker双方が共有するNPCレジストリ：`reading-shelf-firebase/forest-character-registry.mjs`

## 認証とデータ

`/dialogue` ではFirebase IDトークンを検証し、Workerシークレットに設定した `OWNER_UID` と照合する。クライアントのCORSは指定されたFirebase Hostingオリジンに限定する。**Firebase IDトークンはWorkers AIへの生成プロンプトには含めない。**

生成プロンプトには、そのNPCについて非公開Sheetsから取得した人物設定、選択肢・直近の会話、既読作品の確認済みの物語要約・場面情報を含む場合がある。

**現在の仕様では、子どもの読書感想の原文または保護者要約の一部も送信する。** 感想本文は最大180文字の抜粋で、書名、短いあらすじ、関連する物語文脈、本人発言か保護者要約かの区別とともに送る場合がある。感想が常に送られるわけではなく、既読状態・新着判定・話題分散の条件により選ばれる。

この実行時送信と公開GitHubは別の経路。**実際の感想・家族情報・非公開台帳の行やシートIDをGitへ保存しない。** 生成プロンプトには内部書籍ID・感想ID・家族IDを含めない設計だが、送信した抜粋本文そのものはWorkers AIの処理対象になる。公開ソースにAPI秘密鍵や所有者UIDを直書きしない。

## 無料枠と障害時の動作

- AI生成上限：レスポンス最大320トークン。ブラウザ側の上限は一日300回・一会話3回（端末内制御）。
- 無料枠・実際の消費量はCloudflareの現行仕様とダッシュボードで確認する。ブラウザ制御のみを課金防止の保証とみなさない。
- 利用上限・通信障害・不正な応答では、安全な非生成の代替表示に戻る。感想や読書記録をFirestoreへ自動更新しない。
- ねこは非発話の `action-writing` 形式。人物設定の正本は他NPCと同じ非公開Sheetsで、コードの個別人格定義を追加しない。

## 安全なデプロイ

**既存Workerを上書きする場合だけ**、最新main・配信先・`wrangler.toml` の `name` を事前確認する。リポジトリの `cloudflare/forest-ai` に移動した後、次の完全指定コマンドを使用する。

```sh
npx --yes wrangler@4 deploy ./src/index.mjs --config ./wrangler.toml --name yondene-forest-ai
```

`wrangler deploy` の単独実行は禁止。別Workerを作成しない。通常のコード整理や本棚更新ではデプロイしない。既存の `OWNER_UID` シークレットを変更しない。

デプロイ後に `https://yondene-forest-ai.akebi-lab-2611.workers.dev/health` を確認し、`configured` のほか `version`、`protocolRevision`、`registryRevision` がブラウザ側と一致することを確認する。`configured:true` だけでは合格としない。

WorkerとHostingを両方変更する場合は、原則Worker→Hostingの順。Hostingは [配信手順](../../docs/DEPLOYMENT.md) を参照。

## ローカル検証（実AIリクエストなし）

```sh
node --test cloudflare/forest-ai/src/index.test.mjs
node --test reading-shelf-firebase/book-forest-cloudflare-provider.test.mjs
cd cloudflare/forest-ai
npx --yes wrangler@4 deploy --dry-run --outdir /tmp/forest-worker-bundle
```

CIの単体テストやドライランでは、原作人物の再現度・本番Workerへの反映・Android実機の動作までは証明できない。
