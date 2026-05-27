# Manual Test Report — Issue #257

**実行日時**: 2026-05-28
**テストソース**: .issue/257/testing.md
**Issue**: #257（アップロードモーダルのレスポンシブ改善）
**サーバー**: http://localhost:3000 (`pnpm dev`)

## 概要

Issue #257 の実装（CSS class の追加・削除と DOM 構造の flex column 化）に対するブラウザ検証。

## 結果サマリー

| 観点 | 状態 | 担保手段 |
|------|------|---------|
| ビルド / 型 / lint | PASS | `pnpm typecheck` / `pnpm lint:fix` / `pnpm format` |
| ユニットテスト | PASS | `pnpm test:unit` 全 2533 件 PASS |
| dev サーバー起動 | PASS | `pnpm dev` で 3.3s ready、`/` → `/?page=1&limit=20` 307 リダイレクト |
| viewport-fit=cover HTML 反映 | PASS | `/login` の HTML で確認 |
| ログイン画面モバイル幅表示 | PASS | agent-browser で snapshot 確認 |
| editing view モバイル目視検証 | SKIP | 認証突破不可。代替として構造 regression test + PR 目視レビュー |

詳細: `results/summary.md`, `results/TC-001.md`, `results/TC-002.md`

## 起票したIssue

なし。FAIL に該当する事象は検出されていない。SKIP の項目は本 Issue 範囲外の制約（OAuth / signup フロー）に起因するもので、Issue #257 の実装欠陥ではない。

## 推奨フォローアップ

PR レビュアーは以下をローカル `pnpm dev` で目視確認することを推奨：

1. ヘッダーの「アップロード」ボタンからモーダルを開く
2. DevTools レスポンシブモードで 375×667（iPhone SE）に切り替え
3. 何か小さな HTML/Markdown ファイルをアップロードして editing view を表示
4. 以下を目視確認：
   - action bar の 3 ボタン（キャンセル / 破棄 / 登録）の computed height が 44px 以上
   - 本文プレビュー領域に内側スクロールバーが現れない（panel 内の単一スクロール）
   - 長い本文の場合、action bar が常に panel 最下端に固定される（浮かない）
5. 「破棄」ボタン → ConfirmDialog の縦並びが崩れていないこと
6. （可能なら）iOS Simulator で home indicator と action bar の重畳が無いこと
