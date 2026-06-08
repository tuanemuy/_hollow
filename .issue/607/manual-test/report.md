# ブラウザ検証レポート — Issue #607: タグ管理(P18) デザイン追従＋楽観的更新

**実行日時**: 2026-06-09
**テストソース**: `.issue/607/testing.md`
**サーバー**: http://localhost:3000
**結果**: 9 件中 9 件 PASS（TC-M1 は初回 FAIL を即時修正し再検証 PASS）

## 概要

タグ管理ページ(P18 `/tags`)の①デザイン追従（作成フォームの意匠/トークン/余白）②作成・統合・並び替え・検索の楽観的更新化を、デスクトップ・モバイル両幅でブラウザ検証した。デスクトップは全項目で期待挙動を確認。モバイルで作成フォーム入力欄の縦潰れと検索〜ソート間の大空白が見つかり、`max-sm:flex-none` 付与で修正・再検証 PASS。

## 検証結果

### デザイン追従
- **TC-001（意匠/トークン）**: 作成フォームの入力欄が surface pill、追加ボタンが primary 塗り pill。ツールバーの検索 pill / segmented と統一トークン。admin 風の素朴 label+input の浮きは解消。
- **TC-002（余白）**: タイトル→件数→作成フォーム→ツールバー→一覧の縦リズムが自然。ツールバー直下に hairline 境界で一覧が続き、二重余白なし。

### 楽観的更新
- **TC-003（作成）**: 「追加」押下直後（ネットワーク完了前）に新規行が即時表示、件数 11→12 に即増。確定後も維持、入力欄クリア。「作成中...」固着の旧挙動なし。
- **TC-004（統合）**: 統合元 `essay` を `research` に統合。確定でダイアログ即閉じ、統合元が直後レンダーで消去（12→11件）、統合先件数 5→6。進捗バナー・全体リロード待ちなし（ADR-003 どおり）。
- **TC-005（並び替え）**: 軸/方向クリック直後に active 即切替。連続クリック中も全ボタン `is enabled = true`（disabled 撤廃を確認）。最終 URL と一覧順が整合。
- **TC-006（検索）**: submit 型維持（打鍵ごとに URL 不変）。`re`/`日` で絞込、空 submit で `q` 消滅。日本語が壊れず正しくエンコード。

### 異常系
- **TC-E1（作成重複名）**: 楽観追加行が snap back で消え、フォーム直下にエラー表示。
- **TC-E3（不正 URL）**: `?sort=bogus&order=xxx` がデフォルト（名前/昇順）に正規化、エラー画面なし。

### レスポンシブ
- **TC-M1（モバイル 390px）**:
  - 初回 FAIL: 作成入力欄が 15px に縦潰れ／検索欄〜ソート間に約 200px の空白（`max-sm:flex-col` 縦積み時に `flex-1` が高さ方向に作用）。
  - 修正: `TAG_CREATE_INPUT` / `TAG_SEARCH` に `max-sm:flex-none` を付与（縦積み時の flex-grow を停止、`h-9` の高さと `items-stretch` の全幅を維持）。
  - 再検証 PASS: 入力欄 34px、検索〜ソート間 12px、横スクロールなし、モバイル SSOT と整合。

## 修正したファイル（変更箇所起因の即時修正）

- `app/components/tag/styles.ts` — `TAG_CREATE_INPUT` / `TAG_SEARCH` に `max-sm:flex-none` を追加。

## 起票した Issue

なし（FAIL は変更箇所起因かつ即時修正可能だったため Phase 2 に戻して修正）。

## 成果物

- サマリー: `.issue/607/manual-test/results/summary.md`
- スクリーンショット: `.issue/607/manual-test/screenshots/`
  - tc-001-design.png / tc-002-spacing.png / tc-003-create.png / tc-e1-dup-error.png
  - tc-004-merge.png / tc-005-sort.png / tc-006-search.png / tc-e3-invalid-url.png
  - tc-m1-mobile.png（初回 FAIL）/ tc-m1-mobile-fixed.png（修正後 PASS）
- サーバー情報: `.issue/607/manual-test/server-info.md`
