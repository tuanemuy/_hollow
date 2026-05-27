# ブラウザ検証レポート — Issue #241

**実行日時**: 2026-05-27
**Issue**: #241 — spec(design): P13-upload.html モックの FrontMatter 例示を「あれば表示」モデルへ更新
**テストソース**: `.issue/241/testing.md`
**対象ファイル**: `spec/design/pages/P13-upload.html`

---

## 結果概要

- テストケース: 2 件
- PASS: 2 / FAIL: 0
- 起票した Issue: なし

## 環境

- 検証方法: 静的 HTML を `file:///Users/hikaru/github.com/tuanemuy/hollow/spec/design/pages/P13-upload.html` で agent-browser から直接オープン
- dev サーバー起動: 不要
- シードデータ整備: 不要
- agent-browser: 0.27.0
- タイムアウト: `AGENT_BROWSER_DEFAULT_TIMEOUT=20000`, `AGENT_BROWSER_IDLE_TIMEOUT_MS=120000`

## テスト結果

### TC-001: FrontMatter 例示文言が新モデルに沿った表現になっている — **PASS**

- 詳細: `results/TC-001.md`
- 確認内容:
  - Row 4 メタ行の右端に `FrontMatter: date / title / description などを検出` が右寄せ表示されている
  - `tags` / `status` の語は含まれていない
  - チップ群（`#design` `#essay` `#apple`）と文言の横並び・右寄せが維持されている

### TC-002: 旧文言が他箇所に残っていない — **PASS**

- 詳細: `results/TC-002.md`
- 確認内容: `grep -rn "title, date, tags, status" spec/` の結果が 0 件

## スクリーンショット

`screenshots/tc-001/` に格納:
- `step-01-full-page.png` — ページ全体（初期表示）
- `step-02-row4-area.png` — Row 4 の上半分
- `step-03-frontmatter-line.png` — FrontMatter 例示行（決定的証拠）

## 起票した Issue

なし（全 PASS）。

## 結論

実装は `.issue/241/plan.md` の意図どおりに完了している。Issue #241 の受け入れ条件（旧モデル前提の `title, date, tags, status` 例示の撤去・新モデル表現への置き換え）を満たすことをブラウザで実機確認した。
