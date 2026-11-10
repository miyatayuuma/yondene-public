# 本の森 — 共有物語記憶 v0.1

## 何ができるか

本を読み終えると、その作品について公開情報から調査・承認された知識が、森のどの登場人物との会話でも参照候補になる。会話に使うのは質問に関連する数件だけ。読後の知識は全員で共有するが、**話し方・価値観・反応は個別のキャラ設定を優先**する。

このバージョンには、(1) 非公開スプレッドシートに整理した物語記憶・根拠台帳、(2) 読了判定と検索・予算制限の純粋関数、(3) 自動テストがある。**本番アプリの対話AIへの配線はまだ行っていない。**

## データの所有権

- Firestore の `families/{familyId}/books` が読書状態の唯一の正本。既存の `status: 'read'` を読むだけで、更新や新しい読了フラグは作らない。
- 非公開のキャラクター設定台帳の「物語記憶」「物語資料」「物語運用」が編集・出典確認の場所。
- この公開リポジトリにはスキーマ、選別器、架空 ID のテストだけを置く。**実物の bookId、家族 ID、読書記録、台帳 URL、台帳の内容そのものは置かない。**
- 原作・小説・映画・テレビアニメは別の著作物として扱う。確認できない筋書きや長い引用を加えない。

## 物語記憶の列

| 列 | 意味 |
| --- | --- |
| `schemaVersion` | 1 |
| `memoryId` | レコード識別子（重複禁止） |
| `bookId` | Firestore 既存本棚の ID と完全一致させる |
| `bookTitle` | レビュー用の表示名。**認可には用いない** |
| `text` | 調査内容を独自に短く要約した物語上の事実（最大400文字） |
| `tags` | 話題検索用のキーワード（カンマ区切り） |
| `characters` | 関係する NPC の ID。**アクセス制御には用いない** |
| `spoilerLevel` | 0=設定、1=序盤、2=途中、3=結末 |
| `evidenceStatus` | `approved` のみ採用 |
| `confidence` | `high` または `medium` のみ採用 |
| `sourceUrl` | 対応する書誌・出版社・著者・書評の HTTPS 出典 |
| その他 | 資料種別・レビュー日など監査欄。推論実行時には渡さない |

## 取り出し方

`book-forest-story-memory.mjs` の `parseStoryMemoryRows` はシートのヘッダ付き値配列を解析する。
`retrieveStoryMemory` は渡された **最新の** Firestore 本棚スナップショットで `read` のものだけを許可し、未承認の行と出典なしの行を拒否する。`maxSpoilerLevel` の初期値は2。質問の語句・タグ・関連人物で並べ替え、最大3件・本文約680文字（設定可能、ハード上限1200文字）に絞る。

`storyMemoryPrompt` は選ばれた本文に対し、知らない内容を創作せず、人格を維持し、実際には見ていない読書行動を目撃したように話さない指示を追加する。返却された `context` には非公開 bookId と出典 URL を混ぜない。

```js
import {parseStoryMemoryRows,retrieveStoryMemory,storyMemoryPrompt} from './book-forest-story-memory.mjs';

const catalog=parseStoryMemoryRows(privateSheetValues); // 秘密のサーバー側でのみ取得
const selection=retrieveStoryMemory({
  books:currentFirestoreBooks, // 現在の本棚状態。過去のキャッシュではない
  catalog,
  query:'ドラゴンの出てきた本について教えて',
  characterId:'cat',
  maxSpoilerLevel:2
});
const memoryContext=storyMemoryPrompt(selection);
```

## 本番接続の条件（未実装）

1. Firebase Authentication による認証・家族の権限確認を行う**サーバー側**に、非公開記憶の読み込みを置く。公開ブラウザに Google Sheets 認証情報、LLM API キー、非公開の全レコードを渡さない。
2. Firestore から最新の対象家庭の読書状態を取得し、認可確認後に毎リクエスト `retrieveStoryMemory` を実行する。読了を取り消した本の知識は次回会話から表示しない。
3. 既存の NPC 人格・口調の文脈、選別済みの物語記憶、直近の会話だけを LLM に送る。送出前にプライバシー・根拠・長さを再検証する。
4. `book-forest.mjs` の `dialogue.start` / `dialogue.select` アダプタに接続する。キー管理・費用上限・子ども向けの応答安全性を確認してから本番へ配信する。

現在のアプリは専用の会話 API を持たないため、この PR の時点で森のセリフが変わるわけではない。Firebase の課金設定・Firestore Rules・本棚データは変更しない。

## テストと費用

```sh
node --test reading-shelf-firebase/book-forest-story-memory.test.mjs
```

本の数に比例して毎回全事実をトークン化する構成を避けた。追加消費は検索で採用された短い記憶と補助指示だけで、既読冊数と必ずしも比例しない。**文字数はトークン数の保証ではない**。正確なAPI消費量は後で選ぶモデルと実リクエストの計測で確かめる。
