# 開発・検証

## 日常の変更

Node.js 22以降。読み取りや書き込みの契約は現行コードで確認する。製品画面、本の森の描画、会話の入力と出力、GAS writerをそれぞれの入口から検証する。DB変更がない場合もデータ互換や権限の影響はエミュレーターで確認する。

```sh
node scripts/check-public-boundary.mjs
npm --prefix reading-shelf-firebase test
npm --prefix reading-shelf-firebase install --no-audit --no-fund
npm --prefix reading-shelf-firebase run test:rules
```

CIとローカルの通常テストは同じコマンドを使う。公開境界検査は現在追跡するファイルを対象とする。履歴やPRの添付、ログ、素材の権利は公開前に別途確認する。試験には合成データを使う。

## 森の確認

- `node scripts/check-forest-conversation.mjs` は合成モデルを使い、製品と同じ会話状態・Worker入出力検証を通す。実Gemmaには `--model` と正規テスト用の `CLOUDFLARE_AI_TEST_ACCOUNT_ID`、`CLOUDFLARE_AI_TEST_TOKEN` を環境変数で渡す。私的な入力・出力を保存する場合はリポジトリ外へ置く。
- `node scripts/build-forest-persona-probe.mjs` は検証用 `gas/ForestPersonaProbe.gs` を生成する。生成物は追跡せず、GASへ手動反映する場合はコミットと生成物のハッシュを記録する。キューの新規試験には `integrated-synthetic` または `integrated-mirror`。後者は鮮度と整合性が確認できた読取ミラーを使い、書誌を更新しない。結果は非公開検証先へ保存する。
- `python scripts/forest-dialogue-browser-check.py` はChromiumとPlaywrightで、合成素材を使った実UIを確かめる。`scripts/forest-visual-check.py` を使うCIでは、同じシーンの変更前後を描画して比較する。
- `node scripts/build-forest-voice-lab.mjs` は `scripts/forest-voice-lab.html` を生成する。Hosting対象外の開発ツール。ローカルサーバー上でアプリと同じオリジンに置く場合、保存した音声の個別調整をそのローカルアプリで確認できる。

## 整理対象のIssue

| 状態 | Issue | Draftの扱い |
| --- | --- | --- |
| コードで解消 | #3、#5、#6、#7、#10 | 台本入力と退避エンジンの削除、共通生成の2話者表示、非公開人物設定を確認。配信後に本番を受入。 |
| 実生成・実機の確認ありき | #1、#2、#4、#8、#9、#21 | 既存診断と名前永続化、安全検証を保持。初回の名乗り、人物らしさ、話題のばらつき、文字制約下の品質は最新GemmaとAndroidで判定。 |
| 旧工程を後継手順へ移管 | #12 | このDraftの仕様・台帳移行・配信手順に更新。 |

Issueは本番受入後に個別の達成条件を照合して更新する。
