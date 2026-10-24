# 本番 Hosting 切替手順（準備版）

## 範囲と前提

- 変更対象は **Firebase Hosting の静的配信コードのみ**。Firestore 正本、Rules、Authentication、GAS、非公開 Sheets は保持する。
- 既存 URL は `https://kodomo-reading-shelf-87f11.web.app/`。新しい Firebase プロジェクトは作らない。
- 現時点で**本番デプロイを許可・実施したことにはならない**。
- GitHub 公開コードから既存の非公開 Git 履歴、書籍コマンド、読書記録、Sheets の識別子を引き継がない。

## 切替前ゲート

1. 公開 PR の匿名テスト・Firestore Rules エミュレータテストが全件 PASS。
2. `node scripts/check-public-boundary.mjs` が PASS。レビューで公開ソースに個人情報・認証鍵・現行読書記録がないことを再確認。
3. 認証済み本人/家族で表示・管理操作をプレビュー環境で確認する。未ログイン時は個別の本棚名を出さない。
4. 既存 Hosting のリリース番号、デプロイ時刻、復旧方法を控える。
5. Firestore のデータ更新経路が旧 private writer か新 GAS writer の**どちらか一方**であることを確認する。Sheets の現在値ミラーから Firestore を全件上書きしない。

## 公開リポジトリからの手動 Hosting デプロイ

事前に上記のゲートを通過し、管理者が本番切替を承認した場合に限る。Cloud Shell で次を実行する。

```bash
git clone https://github.com/miyatayuuma/yondene-public.git
cd yondene-public
node scripts/check-public-boundary.mjs
cd reading-shelf-firebase
firebase deploy --only hosting --project kodomo-reading-shelf-87f11
```

`--only hosting` を外さない。`firebase deploy` を無指定で実行すると、同じ `firebase.json` の Firestore Rules も展開対象となり得る。

## 切替後

- 本番 URL で匿名状態の非公開情報非表示と、既存アカウントでの読書記録表示・活動・★評価などを確認する。
- GitHub Actions は静的検証のみに使う。Firebase への自動書き込みや本番デプロイを含めない。
- 不具合が出た場合は Firebase Hosting のリリース履歴から直前の正常版へ戻す。Firestore・Sheets に復元操作をしない。

## データ更新経路の別工程

Sheets→GAS 更新キューの Stage A（コード・匿名テスト・Sheetsタブ準備）は実装済み。ただし GAS 書き込みはハードコードで無効、トリガーは未設定、受入は未実施。現状の同期は Firestore→Sheets の読み取りのみ。新しい GAS writer の権限・CAS・冪等性・監査を確認するまで旧 private writer を無効化しない。
