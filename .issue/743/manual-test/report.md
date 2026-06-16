# ブラウザ検証レポート — Issue #743

**実行日:** 2026-06-15
**テストソース:** `.issue/743/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**検証ツール:** agent-browser 0.27.3
**認証:** dev-admin（`__Host-session` cookie 注入）

## シードデータ

- ディレクトリ（dev-admin 所有）: `Documents`(`...741`) → `Research`(`...742`) の2階層
- ノート: `Research` 配下に「Research メモ」1件（active）

## 結果サマリー

| TC | テスト名 | 対応 AC | 結果 |
|----|---------|--------|------|
| TC-1 | 末尾（現在ディレクトリ）が非リンク | AC-1 | PASS |
| TC-2 | 祖先セグメントはリンクとして機能 | AC-2 | PASS |
| TC-3 | 末尾 × が無い | AC-3 | PASS |
| TC-4 | パンくずが見出し(h1)の上に表示 | AC-4 | PASS |
| TC-5 | clear-all 導線が担保される | AC-5 | PASS |
| TC-6 | 解決不能ディレクトリのフォールバックチップ | AC-6 | PASS |
| TC-7 | ディレクトリ未選択時はパンくず無し | — | PASS |

**合計: 7 件（PASS: 7 / FAIL: 0）**

## 主要な証跡

- `?directoryId=...742` の snapshot で main 直下が `navigation "現在のディレクトリ"`（`link "Documents"` + 非リンク `StaticText "Research"`）→ h1 → フィルタ群の順。末尾 Research は link role を持たず、× ボタンも nav 内に存在しない（TC-1/3/4）。
- パンくず「Documents」クリックで URL が `directoryId=...741` へ遷移（TC-2）。
- 「フィルタをすべてクリア」で `/` に復帰（TC-5）。
- 実在しない `directoryId=...09ff` では nav が出ず、フィルタ行に「ディレクトリ」フォールバックチップ＋解除 × が出現、× で `/` に復帰。location（ヘッダ）/ filter（フィルタ行）の棲み分け成立（TC-6）。
- `/` では nav もフォールバックチップも無く h1 が main 最上部（TC-7）。

## 起票した Issue

なし（全 PASS）。

## 環境メモ（不具合ではない）

当環境の agent-browser では `find text` / CSS `:has-text()` が not found になるケースがあり、snapshot の a11y ref 経由のクリックに切り替えて検証した。テスト結果には影響なし。
