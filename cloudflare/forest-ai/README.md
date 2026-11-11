# 本の森 — Gemma 4 26B A4B 接続

「よんでね」の管理者向けNPC会話を Cloudflare Workers AI に接続するためのWorkerです。
モデルは `@cf/google/gemma-4-26b-a4b-it`。Cloudflareアカウントを **Workers Free** のまま利用してください。
無料枠は Cloudflare アカウント全体で共有され、上限到達時はAI会話が止まり、アプリは既存台本に戻ります。
有料プランへ変更せず、課金されるリソースは作成しないでください。

## 初回セットアップ（Cloudflareにログインできる端末）

```sh
cd cloudflare/forest-ai
npx wrangler@latest login
npx wrangler@latest deploy
npx wrangler@latest secret put OWNER_UID
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
- AIへの出力上限は320トークン。ブラウザ側の利用上限は**300回/日、3回/会話**（Cloudflareの無料枠と同じ UTC 0時＝日本時間9時更新）です。上限は実際のNeurons消費量とは異なるため、Cloudflare側で無料枠に達した場合はその日の追加生成を停止し、承認済み台本に戻ります。
- CloudflareのWorkers AI Freeには10,000 Neurons/日の別の上限があり、アカウント内で共有されます。リセットは **UTC 0時＝日本時間9時** です。
- 管理者以外の会話、子どもの感想、非公開本棚データはLLMに送信しません。

## ローカル検証（実AI呼び出しなし）

```sh
node --test cloudflare/forest-ai/src/index.test.mjs
node --test reading-shelf-firebase/book-forest-cloudflare-provider.test.mjs
```

`wrangler dev` は実際のWorkers AIに接続するため、無料枠の消費を避けたい場合は使用しません。

## 口調エンジン v8 の公開順序

1. `cloudflare/forest-ai` から Worker を更新する。既存の秘密情報を変更する必要はありません。
2. 新しい `reading-shelf-firebase` を Hosting に反映する。Firestoreの本棚更新は不要です。
3. 管理者で「森の素材を更新」し、各NPCの承認済み第一声と即興の返答を確認する。

v8は既存の承認済み台本を第一声とし、AIには本人の人物像と、個人の読書記録を含まない承認済み短文例だけを渡します。
「思考の種」は既に選ばれた台本に合う場合だけ参照し、すべてのNPCへ同じ哲学的な問いを課しません。
API失敗や口調違反の場合は台本へ復帰し、同日の3回目訪問も会話自体は継続します。
生成結果のキャラらしさはテスト成功だけでは保証されないため、実機の複数回評価が必要です。

## 日替わり・交流 v9

- 個々のNPCが別の日替わりの小さな関心事を持ち、翌日には別の題材へ移ります。
- 通常の森での会話は、その日の関心事を使った本人らしい第一声と選択肢を1リクエストで生成します。初対面と原作エピソードの承認済み第一声は変更しません。
- 会話を選択したこと、会った順番、関係のある相手との直近の接点だけを端末内に記録し、次のNPCへ渡す短い文脈とします。子どもの本当の気持ちや、NPCが他の会話を聞いたという事実にはしません。
- ねこは話さず、ふたごの専用演出は変更しません。原作にない出来事を原作の事実として付け加えることも禁止します。
- 日替わりテーマがあっても承認済みの物語記憶を上書きせず、読書データ・感想・本棚への書き込みは行いません。
- WorkerとHostingの両方の更新が必要です。Cloudflare Freeの10,000 Neurons/日は増えません。追加課金を許可するものではありません。

## 本の記憶と交流 v10

- v9の固定24テーマ表を廃止。読了済みで出典・承認を確認した「物語記憶」と、その記憶に結びつく「思考の種」をキャラ別に選抜します。
- 対象は原作でその人物に紐づく記憶、または当該NPC向けに監修済みの物語台詞がある記憶のみ。別作品の話を勝手に自分の経験として話しません。
- テーマとしてAIに渡すのは短い事実とタグだけ。思考の問い・対立する見方は送りません。キャラの人格・話し方と承認済み台詞が優先です。
- 直近21日以内の読了本を優先し、最近の話題を避けます。約5分の1の日は日常会話にし、毎日作品の教訓ばかり話させません。
- 選んだゲーム上の選択肢に応じて、確認済み物語の同じ話題を翌日も最大3日目まで再訪できます。終了や「またね」選択では自然に終わります。
- 未読に戻した本の記憶は、その日のテーマや翌日の継続からも除外します。子どもの実際の発言・非公開ID・感想はAPIへ送りません。
- Cloudflare WorkerとFirebase Hostingの両方を更新してください。API利用上限300回/日と無料枠は変更しません。
