# よんでね (Yondene)

家族向け読書記録 PWA の**公開アプリケーションコード**です。Firestore をデータの正本とし、Google 認証・Firestore Security Rules で各家庭の記録を保護します。

## 公開・非公開の境界

- **公開するもの**: `reading-shelf-firebase/` の PWA 本体、Firestore Rules と匿名のテスト、公開 CI、運用ドキュメント。
- **公開しないもの**: 実際の読書記録、個人の名前・メール・UID、Firestore の家族 ID、Sheets のファイル ID、GAS のデプロイ ID、サービスアカウント鍵、書き込みコマンドや更新履歴。
- Firebase Web SDK のクライアント設定は通常公開情報です。これ自体を権限の根拠にせず、Firestore Security Rules と適切な認証・IAM 設定で保護します。
- スプレッドシートは**非公開**で、Firestore からの参照用ミラーです。編集キューの稼働と旧書き込み経路の廃止は別工程です。

## 開発・検証

```bash
cd reading-shelf-firebase
npm install
node --test activity.test.mjs bibliography-identity.test.mjs cover-thumbnails.test.mjs domain.test.mjs invite-links.test.mjs nickname.test.mjs pending-reflections.test.mjs pwa.test.mjs reader-name.test.mjs reading-record-domain.test.mjs startup-recovery.test.mjs
```

Firestore Rules のテストには Firebase CLI / Java とエミュレータが必要です。公開リポジトリの CI は本番 Firestore に接続しません。

## 本番への移行

現時点でソースコードの配置だけを準備します。**本番 Firebase Hosting、Firestore データ、Rules、GAS、既存の非公開書き込み経路には変更を加えません。**

1. 公開リポジトリで匿名テスト・Firestore Rules エミュレータテストを PASS。
2. 既存配信物との機能差分と公開禁止情報を再監査。
3. 後続の Sheets→GAS 書き込みキューを CAS・冪等性・単一 writer の下で受入。旧 private Actions writer は切替まで維持。
4. 切替手順とロールバック手順を受入後、Hosting **のみ**新ソースからデプロイする。

手順は [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) を参照。

## 注意

このリポジトリの Git 履歴は公開用に新規開始したものです。非公開 `miyatayuuma/yondene` の Git 履歴・Issue・PR・Actions ログを移行しません。
