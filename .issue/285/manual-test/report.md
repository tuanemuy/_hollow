# ブラウザ検証レポート — Issue #285: inline モードで `<pre>` コードブロックの編集をサポートする

**実行日時**: 2026-06-05
**テストソース**: `.issue/285/testing.md`
**サーバー**: http://localhost:3005（`PORT=3005 pnpm dev --port 3005`）
**テストユーザー**: existing@example.com / Password123!
**検証ノート**: `/notes/019e953b-4922-713e-94b5-8dc5dfc2adac`（`<pre><code>` を含む）

## 結果

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-285-001 | `<pre><code>` 内テキストのインライン編集 | PASS |
| TC-285-002 | `<pre>` 内 Enter で改行（リテラル `\n`） | PASS |
| TC-285-003 | 保存後の HTML 反映・contenteditable 非漏洩 | PASS |

合計 3 件（PASS: 3 / FAIL: 0）

## 確認できたこと

- **編集可能化（ADR-001）**: 既存ノートを inline モードで開くと `<pre>` に `contenteditable="true"` が付き、内側 `<code>` は継承で `isContentEditable === true` になる。本文コンテナ自体は contenteditable=null で、各ブロックが個別に editable になる設計どおり。コードブロック内テキストの追加が反映される。
- **Enter 改行（ADR-002）**: コードブロック内で Enter を押すとリテラル改行が挿入され、`<br>` も新規 `<p>` も生成されない（`<pre>` 個数 1・本文直下 `<p>` 2 のまま、`pre br` 0、code 改行数 +1）。
- **保存と非漏洩**: 保存後の読み取り専用ビューに編集結果が反映され、ページ内 `[contenteditable]` 要素数 = 0。HTML モードのソースに `contenteditable` 文字列が含まれず、`<pre><code>...</code></pre>` 構造が保持される。

## 既知の制約（偽陽性ではない旨）

- agent-browser の contentEditable へのキー供給が不安定（`type` 無効、`press` で 1 文字ずつ、稀に取りこぼし）。これは自動操作の制約であって実装バグではない。編集・改行・構造保持はいずれも eval による DOM 検証で確認したうえで PASS と判定した。
- 単体テスト（`app/components/note/editor/__tests__/inlineEditor.test.tsx` 23 件 PASS）で `<pre>` 編集・Enter 改行・characterData emit・構造ロールバック・Tab preventDefault を pin 済み。

## 起票した Issue

なし（全 PASS）。

## 成果物

- サマリー: `.issue/285/manual-test/results/summary.md`
- TC 結果: `.issue/285/manual-test/results/TC-285-001.md` 〜 `TC-285-003.md`
- スクリーンショット: `.issue/285/manual-test/screenshots/`
