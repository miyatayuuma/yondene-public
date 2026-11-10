# 本の森 — リアルタイムAI会話 v1（接続待ち）

## 実装済みの範囲

既存の承認済み会話ディレクターに任意で組み合わせる `book-forest-live-dialogue.mjs` と、Firebase AI Logic のクライアント接続モジュールを追加した。

1. NPCの承認済み台詞を最初に表示する。APIはその台詞を起点に**子ども向け返答候補2〜3件**を生成する。
2. 返答候補を実際に選んだときだけ、NPCの次の短い台詞と続きの返答候補を1回生成する。
3. 双子の自動会話、ねこの動作、本人の感想に由来する台詞は既存の承認済み台本のみを使う。自動進行中のAPIリクエストは発生しない。
4. 1セッション最大5回・日本時間1日最大12回（同一端末のキー単位）。API制限、通信失敗、不適切な形式の場合は承認済み台本へ戻る。自動再試行しない。
5. `localStorage` に生成候補・選ばれた候補・生成台詞を最大60件記録する。端末内だけの暫定ログで、ログアウト時に削除する。Firestoreへの書き込みや他端末からの参照はできない。

**APIがまだ使える状態ではない。** `firebase-config.mjs` の `forestAIConfig.enabled` は初期値 `false`。このPRをデプロイしても既存会話・Firestore・Sheetsに変更はない。すべてのキャラクターの台詞をリアルタイム生成する仕様ではなく、初回は承認済み台詞、選択後の返事を生成する縦方向の最小実装である。

## プロバイダーと料金

- Firebase AI Logic + **Gemini Developer API**。Sparkプランで無料枠を使い、Cloud Billingは有効にしない。Vertex / Agent Platform Gemini API は使用しない。
- デフォルトモデル：`gemini-3.8-flash`。モデル・無料枠の提供状況はGoogle公式ドキュメントとAI Studioのプロジェクト別レート制限で運用前に再確認する。
- 「無料枠」のGoogle利用規約ではプロンプトが製品改善に使われ得る。よって v1 では本人の感想、家庭情報、FirestoreのbookId、家族ID、非公開Sheets IDをAI入力へ送らない。
- フロントエンドへ秘密鍵を埋め込まない。Firebase AI Logic SDKとApp Checkの認証経路のみを使う。

## ユーザーが一度だけ行う有効化準備

1. Firebase Console の対象プロジェクト `kodomo-reading-shelf-87f11` が **Spark（Cloud Billing未接続）** のままであることを確認する。
2. Firebase Console → AI Services → AI Logic で **Gemini Developer API** を選び、ガイドに従い有効化する。Blazeへの移行を要求されたら中止する。
3. Firebase Console → App Check でWebアプリ用の **reCAPTCHA Enterpriseサイトキー**を登録する。2026-11-02以降、AI LogicではApp Checkが必須。`kodomo-reading-shelf-87f11.web.app` と使用する独自ドメインを許可し、App Checkの有効性を検証する。
4. 開発担当が公開可能なサイトキーを `forestAIConfig.appCheckSiteKey` に設定し、`enabled:true` に変更する。本人からの明示的なAI転送の受入後、限定実機テストへ進む。
5. 実機で「AI返答候補→選択→NPCの即興返答→再度候補生成」を確認。失敗時は承認済み台本へフォールバックすることを確認する。

サイトキーは公開識別子でありAIの秘密鍵ではないが、Firebase App Checkに正規登録したものだけを設定する。Cloud Billingの登録、Cloud Functionsのデプロイ、Firestore Rulesの変更はこのタスクに含めない。

## 検証

```
node --test reading-shelf-firebase/book-forest-live-dialogue.test.mjs \
  reading-shelf-firebase/book-forest-ai-provider.test.mjs \
  reading-shelf-firebase/book-forest-dialogue-director.test.mjs
```

Firebase AI Logicの実ネットワーク呼び出しはApp Checkの設定がない段階では未検証。ローカルテストはモデルの出力を模したデータによるAPI契約・制限・フォールバックの検証。

公式資料:

- https://firebase.google.com/docs/ai-logic/get-started?platform=web
- https://firebase.google.com/docs/ai-logic/pricing?api=dev
- https://firebase.google.com/docs/ai-logic/app-check
- https://ai.google.dev/gemini-api/docs/pricing
