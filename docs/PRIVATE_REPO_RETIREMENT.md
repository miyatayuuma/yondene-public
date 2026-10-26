# よんでね — 最終移行チェック（2026-10-26）

## 保護対象

1. **Firestore現行本棚**：書籍・シリーズ・読書記録・感想・★評価・家族・更新マーカー。
2. **今後の更新**：非公開Sheetsのキュー → 非公開GAS → Firestore。Firestore → Sheetsは読み取り専用。
3. **新システムのソース**：公開GitHub main。

## 完了

- 旧 `miyatayuuma/yondene` と `miyatayuuma/legacy-games` mainの本棚GitHub Actions経路を撤去。
- 公開GitHubへアプリと汎用GASコードを統合。PWAは公開ソースからHosting配信、ユーザー実機受入済み。
- GAS限定本番受入（無変更マーカー／書誌1フィールド更新）は実施・独立再同期確認済み。
- 非公開Sheetsから不要な旧GitHub履歴アーカイブ、移行監査、未実行の無変更テストコマンドを削除。現在の運用6タブだけを維持。

## 削除前の最小条件と確定結果（2026-10-26）

1. **GAS通常運用：PASS（自動起動）**。非公開Apps Scriptで通常writerの `WRITE_ENABLED=true` を2026-10-26 23:05のdry-runログで確認。5分ごとの `yondeneQueueProcess` が23:10、23:15、23:20、23:30に正常終了。処理待ち0件のため、切替後の一般書籍作成・編集コマンドの自動適用はまだ未検証。以前の限定本番 `book.patch`・`family.rename` と同期照合はPASS。
2. **旧クラウド認証：PASS**。Cloud ShellでWorkload Identity Pool `reading-shelf-github` の旧GitHub専用Provider `repo-main`（legacy-games）と `repo-yondene` を両方 `disabled=True` と確認。共有サービスアカウント `reading-shelf-gh-sync` の `roles/iam.workloadIdentityUser` から両旧リポジトリへの委任を削除し、残存bindingなしと確認。既存GAS OAuth経路は変更していない。
3. **バックアップ方針：ユーザー判断で確定**。課金が必要なFirestoreネイティブ日次バックアップは設定しない。Firestore→非公開Google Sheetsの1時間ごとの現在値ミラーをバックアップ先として採用する。ただしこれは過去世代を保持する完全な災害復旧バックアップではなく、Firestore側の誤削除・破損が後続同期に伝播し得る。この残存リスクを認識した運用判断であり、ネイティブバックアップ未設定を非公開リポジトリ削除のブロッカーにはしない。
4. **ユーザーによる最終削除のみ未実行**。非公開GitHubの全コミット・Issue・PR・Actions履歴を保存せず破棄することは承認済み。ChatGPTが自動削除せず、ユーザーが対象リポジトリを最終確認して実行する。

**削除判断**：旧 `miyatayuuma/yondene` は現在のアプリ配信・通常更新の必須依存先ではないため、上記の承認済みリスクを前提に削除可能。削除は既存Firestoreデータを削除しない。今後のGAS一般コマンドが正常に適用されることまで検証済みだという意味ではない。

**履歴アーカイブは不要**。現在の本棚データを旧記録から復元・再投入・上書きしない。履歴保管のための追加テストや無変更コマンドは作らない。

最終削除までは、上記未完了工程と実行権限を混同しない。
