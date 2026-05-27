# テスト実行サマリー — Issue #226

**実行日時**: 2026-05-27
**テストソース**: `.issue/226/testing.md`
**サーバー**: http://localhost:3000
**ブランチ**: `issue/226/upload-preview-modal`
**テストユーザー**: 既存シード `existing@example.com`

## 結果一覧

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | 単一ファイル: select→uploading→waiting→editing→登録 | 正常系 | PASS | モーダル内完結確認 |
| TC-2 | プレビュー編集中の「破棄」 | 正常系 | **PASS (再修正後)** | 初回は破棄が commit を発火する不具合 → ADR-012 で修正 |
| TC-3 | プレビュー編集中の「キャンセル」 | 正常系 | PASS | hash クリアでモーダル閉じ、ジョブはキューに残存 |
| TC-4 | 複数ファイル一括投入 | 正常系 | PASS | 全件キューに積まれて完了通知 |
| TC-5 | Front Matter raw JSON 編集 | 正常系 | PASS | 編集値が note に反映 |
| TC-6 | `/upload` ページの位置付け再整理 | 正常系 | PASS | 説明文更新確認 |
| TC-7 | spec/design への反映 | ドキュメント | PASS | P13a 新規 + B1/B2/B4 更新 |
| EC-1 | 180 秒タイムアウト | 異常系 | 未検証 | モック注入要 |
| EC-2 | LLM failed view | 異常系 | 未検証 | failed ジョブ生成要 |
| EC-3 | 権限エラーポーリング | 異常系 | 未検証 | jobId 改ざん要 |
| EC-4 | 不正な Front Matter JSON | 異常系 | PASS | TC-5 内で確認 |

**合計**: 11 件（PASS: 8 / FAIL: 0 / 未検証: 3）

## 完了条件評価

- **①「ファイル選択 → 推論待ち → 提案表示 → 登録／破棄」がモーダル内で完結**: ✓ 充足（TC-1, TC-2 再修正後, TC-3, TC-5）
- **②取り込みキュー画面の位置付け再整理**: ✓ 充足（TC-6）
- **③spec/design 配下のページ設計に新フロー反映**: ✓ 充足（TC-7）

## 検出された問題と修正

### 修正済み（同 PR 内で修正）

- **TC-2 破棄ボタンが commit を発火する不具合**: `ConfirmDialog` が内部に `<form>` を持つため、`IngestionPreviewForm` の `<form>` 内にレンダリングするとネストフォームになり、内側の submit が親 form を発火していた。`IngestionPreviewForm` を Fragment 化して `<form>` の外側に `<ConfirmDialog>` を配置することで解消（ADR-012）

### 軽微な改善余地（フォローアップ任意）

- Front Matter JSON 不正時のエラーメッセージが「エラーが発生しました」とジェネリック。`FRONT_MATTER_JSON_INVALID` の具体的文言にできるとより親切
- `ConfirmDialog` 自体が form を持つ設計は将来的に同種のネストフォーム不具合を引き起こす可能性。`<div>` ベースに置き換える or 規約明文化を検討

## 環境制約による未検証項目

- EC-1 / EC-2 / EC-3 は実環境では再現にモック注入や DB 直接操作が必要。本 PR ではユニットテスト (`UploadDialog.test.tsx`) でロジックを担保し、実機検証は将来のリグレッションテストに委ねる
