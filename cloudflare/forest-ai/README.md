# 本の森 — Gemma 4 26B A4B 接続

「よんでね」の管理者向けNPC会話を Cloudflare Workers AI に接続するためのWorkerです。
モデルは `@cf/google/gemma-4-26b-a4b-it`。Cloudflareアカウントを **Workers Free** のまま利用してください。
無料枠は Cloudflare アカウント全体で共有され、上限到達時はAI会話が止まり、アプリは既存台本に戻ります。
有料プランへ変更せず、課金されるリソースは作成しないでください。

## 初回セットアップ（Cloudflareにログインできる端末）

```sh
cd cloudflare/forest-ai
npx wrangler@latest login
npx wrangler@latest secret put OWNER_UID
npx wrangler@latest deploy
```

`OWNER_UID` は Firebase Console → Authentication → Users にある **管理者の Firebase Auth UID** です。
コマンド実行後に入力する値であり、GitHubやChatGPTには公開しないでください。
WorkerはFirebase IDトークンの署名・発行者・プロジェクト・有効期限・UIDを検証します。

Wranglerが表示する `https://yondene-forest-ai.*****.workers.dev` を控えます。
応答確認：`https://＜WorkerのURL＞/health` → `configured:true` が返ること。
認証されていないブラウザからの `/dialogue` 呼び出しは拒否されます。

## Firebase Hostingのアプリと接続

1. `reading-shelf-firebase/firebase-config.mjs` の `forestAIConfig.workerUrl` にWorker URLを設定します（末尾の `/dialogue` は不要）。
2. 変更をmainへマージし、**Hostingのみ** デプロイ：`firebase deploy --only hosting --project kodomo-reading-shelf-87f11`。
3. 管理者でログインし「本の森」へ。登場人物の返答候補を選び、即興の次の発言が表示されることを確認します。
4. Cloudflare Workers AIの使用量を確認。上限時・接続失敗時は既存の承認済み台本に戻ることを確認します。

Worker URL未設定時は従来のFirebase AI Logic（Gemini）が動く構成です。
Worker URLを設定した後はGemmaを優先し、失敗時に別の課金先へ自動転送しません。
親のFirestore・GAS・読書記録は一切変更しません。会話の選択肢とNPCの文脈のみを送信します。

## 無料枠と保護

- Workerの公開エンドポイントは管理者のFirebase IDトークンを必須とし、署名をGoogle公開鍵で検証します。
- CORSはFirebase Hostingの2ドメインに限定。管理者UIDはWorkerのシークレットに保管します。
- AIへの出力上限は320トークン。ブラウザ側の利用上限は**150回/日、20回/会話**（日付は日本時間）です。
- CloudflareのWorkers AI Freeには10,000 Neurons/日の別の上限があり、アカウント内で共有されます。リセットは **UTC 0時＝日本時間9時** です。
- 管理者以外の会話、子どもの感想、非公開本棚データはLLMに送信しません。

## ローカル検証（実AI呼び出しなし）

```sh
node --test cloudflare/forest-ai/src/index.test.mjs
node --test reading-shelf-firebase/book-forest-cloudflare-provider.test.mjs
```

`wrangler dev` は実際のWorkers AIに接続するため、無料枠の消費を避けたい場合は使用しません。
