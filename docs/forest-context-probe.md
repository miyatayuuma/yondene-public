# 本の森：Firestore同期ミラーを使う本番文脈・Gemma改善テスト

## 目的・データ境界

児童の読書記録をAI会話へ利用する際の**選択・帰属・反復・生成**を、本番へデプロイせず比較する。人物の正本は非公開キャラクターSheets、本棚・感想の唯一の正本はFirestore。非公開の「よんでね Firestore同期台帳」の「Firestore原本」は**定期同期の読取専用スナップショット**であってFirestoreの現在値ではない。

- 非公開キャラクターSheetsに既存の `Gemma検証キュー` / `Gemma検証結果` を利用する。Issueごとの新タブは作らない。
- 同シート「Gemma検証設定」**B22**に読み取り専用ミラーのIDを保持（公開コードやREADMEに実IDは記載しない）。スクリプトプロパティ `YONDENE_TEST_SHELF_MIRROR_ID` があれば優先。GASが別のSheetsを読める権限を要する。
- Cloudflare検証用の既存2つのScript Propertiesを再利用。通常本棚writer、Firestore、Worker本番認証は変更しない。
- プローブは必要な書籍・感想だけを選別し、家族ID・UID・生の全Firestore JSONをモデルへ送らない。ただし **該当する実感想の短い引用はモデルへ送信され、入力JSONが非公開の検証結果タブに保存される**。利用者以外へ共有しない。
- 未読・撤回・非表示の感想は使用禁止。読書状態と子どもの実発言（`verbatim`）、保護者の要約（`parent-summary`）を混同しない。
- ミラー同期日時を読み取り、**2時間を超える古いスナップショットでは実データ試験を拒否**。同期ミラーで成功しても本番Firestoreの現在値を保証しない。

## 共通化された本番ルール

アプリと検証GASは `book-forest-reflection-source.mjs` を共有する。
`activity` 最新60件、非表示の除外、読了書籍のみに限定、書籍ID+感想IDの重複排除、最大12件、現存する `books/{bookId}/childReflections/{sourceId}` を再取得、`verbatim` / `parent-summary` のみ許可する。

最近の感想の取り上げ方は `chooseForestReflectionSpotlight` を使用する。14日以内の感想、既読本、関連度、同日の表示回数、感想を取り上げる間隔などは本番関数のルールに従う。選ばれた実感想は最大180字をモデルに渡す。本番では**初対面/物語/引継ぎではなく、雑談枠が選ばれた場合にのみ感想への反応を開始する**。

既読の確認済み物語記憶には `unlockedStoryMemories`、日常の話題には `createForestDailyContextSession`、全モデル入力には `promptFor` と `forestGenerationInput`、出力は `readCompletion` を共有する。

## 既存キュー（I:N）の追加列

| 列 | 意味 |
|---|---|
| I 文脈モード | `synthetic`（省略時の旧動作）、`mirror-reflection`、`mirror-daily`、`mirror-story`、`continuation` |
| J 対象書籍ID | 任意。本棚ミラーで `read` の書籍に限る |
| K 先行requestId | 続きのターンで使う、成功した既存結果のrequestId |
| L 選択した返答 | 先行Gemmaが提示した選択肢から**正確に1つ選ぶ**（子どもの本当の信念とはみなさない） |
| M ケースID | 同じ条件で繰り返す比較ケース（例：反応の主体性） |
| N 関連Issue | GitHub Issue番号。集計の参照に使用 |

旧8列のリクエストは `synthetic` として動作する。既存ERRORを再投入せず、新しいrequestIdを使う。既存のDRAFTは自動生成対象外。

結果のS:ABには文脈モード、ミラー同期日時、書籍ID、感想帰属、文脈確認、先行requestId、ケースID、関連Issue、返答ターン、感想IDを記録する。モデル入力JSONには利用した人物設定版・指紋・選択した感想や日次文脈が含まれる。採点（人物らしさ、自然さ、原作逸脱）は人間または独立評価による**生成後の別工程**であり、JSON形式PASSを品質合格とは扱わない。

### 試験モードの精度の境界

- `mirror-reflection` は、本番と**同じ感想資格・順位付け**を使い、意図的に「再訪時の雑談枠」を指定する。実際の初対面・話題選択が必ずその枠を生むわけではない。
- `mirror-daily` は、本番と**同じ日次話題選定**を使うが、ブラウザに蓄積した訪問/選択履歴は新規テストとして始める。
- `mirror-story` は、既読/出典承認/キャラとの関連に通った事実から1件を選ぶ。自動会話全体の順位・初対面優先は別途実機相当テストが必要。
- `continuation` は前回の実生成結果と選択肢を確認し、本番の `promptFor` を用いて2回まで返答する。編集による既読→未読・感想撤回があれば中止する。
- さらに `forest-production-context-parity.test.mjs` で、本番会話ディレクターを直接実行して**初対面時には感想を出さず、雑談枠でのみ感想を使い、表示後は再掲を抑える**ことを合成データで確認する。

以上により**実生成の人物・文脈品質を配信前に検証**できる。ただし本番Firestoreの直読み、所有者認証、実際の端末キャッシュ、UI・音声・Worker配信が正しいことの証明にはならない。本番配信の判断は検証結果を見て行う。

## 改善ループの運用

1. GASファイルはmainの `gas/ForestPersonaProbe.gs` **全文に置換**（追加貼り付けで旧関数と二重化しない）。コードの再生成元は `gas/ForestPersonaProbe.mjs`、ビルドは `node scripts/build-forest-persona-probe.mjs`。
2. 既存の時間主導トリガーは `yondeneGemmaTestProcessQueue` を実行する。試験したいDRAFTを1件ずつPENDINGへ移す。初回は `mirror-reflection` の成功・帰属を確認。
3. `Gemma検証結果` で実生成、引用の帰属、文脈種別、設定指紋、同期日時、出力形式を照合。続きのテストは新requestIdと元の選択肢で `continuation` を作る。
4. キャラ別・場面別・既読/感想・再訪を比較し、人物らしさ、自然さ、反復、原作逸脱を採点。**原因が人物設定なのか、感想選択なのか、プロンプトなのか**を特定する。
5. 非公開Sheetsの人物設定または共通コードのみ最小修正。改訂前後のrequestIdと設定指紋を比較して再試験する。完成台本や思考の種を追加して補修しない。
6. Issueに検証の要約・修正・回帰・残リスクを記録し、品質目標が満たされた後にWorker→Hosting本番切替。

現在のGASは時間主導で最大3件/実行、60回/日。予期しないAPI失敗を同じrequestIdで自動再試行しない。実データモードで古いミラー、閲覧権限なし、未読、感想不在、撤回を見つけたらモデルを呼び出す前に失敗とする。
