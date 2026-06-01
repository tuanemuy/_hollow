# ブラウザ検証レポート — Issue #405

**実行日時:** 2026-06-02
**テストソース:** `.issue/405/testing.md`
**サーバー:** `pnpm dev`（vite, http://localhost:3003）
**検証方式:** ローカル D1 にテストユーザー＋保存ビュー（healthy ＋ broken）をシードし、セッショントークンを agent-browser に注入して認証済み `/views` を実描画検証。

## セットアップ

- ローカル D1（`.wrangler/state/v3/d1/...`）にテストユーザー・セッション・保存ビュー2件（`全ノート`=健全 / `研究ノート`=壊れた条件あり）をシード（`seed.sql`）。
- `研究ノート` の `broken_conditions_json` に `{kind:"directory", lastSeenName:"Research / Papers"}` を仕込み、機能5（具体名表示）を検証。
- 認証は `sessionService.resolve` が `sessions.token` を生比較する仕様を利用し、`__Host-session` Cookie を `agent-browser eval`（`document.cookie`）で注入。
- 検証後、シードデータは削除済み（環境を汚さない）。

## テスト結果

| TC | テスト名 | 結果 | 確認内容 |
|----|---------|------|---------|
| TC-01 | `/views` 全機能のUI描画 | PASS | 下記スクショ参照 |
| TC-02 | 編集 Dialog（機能1） | PASS | 「編集」→「ビューを編集」Dialog が開き、名前欄に既存値「研究ノート」が初期表示。ディレクトリ/公開範囲/キーワード等のフィルタ編集フォームが描画 |
| TC-03 | 新規作成導線（機能4） | PASS | 「新しいビュー」ボタン存在。クリックで作成モードの `ViewFormDialog`（編集と同一コンポーネント、TC-02で描画確認済み）を開く |
| TC-04 | ADR-B name 保持（ライブ） | PASS | シード時 `lastSeenAt=2026-05-01` が、ライブ `/views` リクエスト後に `listSavedViews` の再検出で `now` へ bump されつつ `lastSeenName="Research / Papers"` を保持（name なし detect マーカーが name 付きを潰さない＝ADR-B）を実 DB で確認 |

### TC-01 で確認した描画要素（`screenshots/tc-01-views-list.png`）

- ✅ **機能4**: ヘッダーに「新しいビュー」ボタン
- ✅ **機能1**: 各ビュー行に「編集」ボタン
- ✅ **機能2**: 各ビュー行に「複製」ボタン
- ✅ **機能3**: 壊れた条件バナー内に「修復」ボタン
- ✅ **機能5**: 「壊れた条件があります／削除済みディレクトリ `Research / Papers` を参照しています。」の具体名表示
- ✅ 回帰: 既存の「適用」「名前変更」「既定にする/解除」「削除」も健在

## スクリーンショット

- `screenshots/tc-01-views-list.png` — /views 一覧（全機能のUI）
- `screenshots/tc-02-edit-dialog.png` — 編集 Dialog（初期値表示）
- `screenshots/tc-03-new-dialog.png` — 新しいビュー Dialog

## カバレッジと限界

- **描画・Dialog開閉（クライアント側）**: agent-browser で実検証（PASS）。
- **mutation 本体（保存・複製・修復・作成の永続化）**: agent-browser からの server-function POST は cross-origin で 403 となるため、ブラウザでは実行しない。これらは application 層の integration テスト（`duplicateSavedView.test.ts` / `repairSavedView.test.ts` / `updateSavedView.test.ts` / `handlers.test.ts` / `savedViewRepository.integration.test.ts`、計 544 integration + 3026 unit すべて green）で担保。
- TC-04 はライブサーバーの実 DB 観測で ADR-B の name 保持を直接確認した（ブラウザ操作ではなく永続化結果の検証）。

## 結論

全テストケース PASS。失敗・Issue 起票なし。5機能すべての UI が `/views` で正しく描画され、機能5の具体名表示と ADR-B の name 保持がライブ環境で確認できた。
