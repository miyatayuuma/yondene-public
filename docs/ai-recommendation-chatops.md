# AIおすすめ（ChatOps）— 実装と運用

## 現行データとの互換性
- Firestore正本: `families/{fid}/recommendations/{recommendationId}`。本棚の `books` と別領域。
- 1回の推薦 = 推薦者単位の文書。作品カードは書名+著者の正規化値で集約し、各推薦者の理由・狙い・おすすめの読み方を別々に表示する。
- 異なる版でも同一作品ならカードを共通化する。書名だけの既存投稿を自動統合しない。表記ゆれや同名同著者の特殊な作品は手動照合。
- 人間の推薦は既存の認証UIDのまま。AIは `recommenderType:'ai'`、`recommenderId:'roku'|'gemini'|'muse'`、`authorUid:''`。AIの成りすましをWebクライアントから許可しない。
- AIの選書は本人が関心を示した事実ではない。「きになる」や読書履歴には反映しない。

## キューコマンドの例（実データではない）
```json
{
  "schemaVersion": 1,
  "commandId": "gas-ai-rec-example-001",
  "op": "recommendation.create",
  "recommendationId": "rec-roku-example-001",
  "reason": "推薦の登録（デモ）",
  "recommendation": {
    "title": "Synthetic Book",
    "author": "Example Author",
    "reason": "既読作品の特徴に基づく推薦根拠",
    "goal": "新しい物語世界に触れる",
    "recommendedMode": "read-aloud",
    "recommenderId": "roku",
    "rank": 1,
    "url": "https://example.org/book"
  }
}
```
- `recommendedMode`: `read-aloud`（読み聞かせ）、`independent`（自力読書）、`mixed`（併用）、`shared`（共読）。
- 複数AIが同一作品を推薦しても別々の文書を生成し、アプリでは1作品として表示。単一AIの同一作品の繰り返しは拒否。
- `commandId`、`recommendationId` は各推薦につき固有。適用マーカーで冪等性を確認する。`REVIEW`、`CONFLICT` の自動再投入は禁止。
- 公開GitHubに家族ID、UID、実書籍データやキューコマンドを保存しない。

## 本番更新手順
1. 公開GitHubでGAS・アプリの自動テストとFirestoreルール回帰を確認する。
2. 非公開Apps Scriptの `Queue.gs` に、公開GitHubから追加された差分だけを反映する。実運用の `WRITE_ENABLED=true` を保持し、公開コードの `false` で上書きしない。
3. Firebase Hostingへアプリのコードを反映し、管理者アカウントで既存のおすすめ表示を確認する。
4. 実際の推薦1件をキューに登録。GASの `APPLIED` / 永続マーカーとFirestore現在値を照合する。
5. 同じ作品を別のAIが推薦する通常データ1件を登録して、作品カードが1件で推薦理由が2つ表示されることを検証する。
6. 残りの推薦を登録し、既存のおすすめ、活動、本棚への無関係な変更がないことを確認する。
