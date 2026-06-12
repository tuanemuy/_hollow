# ブラウザ検証レポート — Issue #664

**実行日時**: 2026-06-13
**テストソース**: .issue/664/testing.md
**サーバー**: http://localhost:3001（pnpm dev --port 3001、ローカル D1）
**シードデータ**: #658 のシードを再利用（dev-admin + test-note-01〜14 / test-tag-01〜14、`.issue/658/manual-test/seed-data.md` 参照）

## 結果

4 件すべて PASS（PASS: 4 / FAIL: 0）。詳細は results/ を参照。

- TC-1: batch による 3 連クリックで `tagNames` に 3 タグすべて累積（lost update 解消を確認）
- TC-2: 選択済みタグの再クリックで該当タグのみ解除
- TC-3: 全解除で `tagNames` パラメータが URL から消え全件表示に復帰
- TC-E1: 解除+追加の混在を同一タスク内 3 連クリック（eval）で実行し、期待の 2 タグに収束

## 特記事項

TC-E1 の初回 batch 実行は、agent-browser の `click @ref` が再レンダー中の ref 再解決に失敗してクリック未達となる既知の制約による偽陽性だった。`eval` による `button.click()` 3 連発（Issue の再現条件である同一タスク内連打をより正確に再現）では期待どおり動作。コード側 Issue の起票なし。

## 起票した Issue

なし
