# ブラウザ検証レポート — Issue #498

**実行日:** 2026-06-05
**テストソース:** `.issue/498/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**検証ノート:** `/notes/019e9839-509f-727f-b77d-f1c1f396871d`（Issue 498 Codeblock Test）

## サマリー

| TC | 内容 | 結果 |
| --- | --- | --- |
| TC-001 | コードブロック入りノートの作成（HTML モード入力→保存） | PASS |
| TC-002 | 読み取り専用ビューのシンタックスハイライト | PASS |
| TC-003 | inline 編集の focus 中プレーン / blur 再ハイライト | PASS |
| TC-004 | `<pre>` 内 Tab / Shift+Tab / Esc | PASS |
| TC-005（最重要） | 保存 HTML に span / contenteditable が漏れない | PASS |
| TC-006 | 公開/履歴ビューのハイライト | SKIP（到達不可） |

**合計:** 6 件（PASS: 5 / FAIL: 0 / SKIP: 1）。実装バグなし。

## 観察した実際の挙動

- **TC-002:** 読み取り専用 `.note-detail-content` 内で `language-typescript` ブロックに shiki トークン span が注入され、keyword=赤 `rgb(170,62,62)`（= `--code-keyword` #aa3e3e）/ function=紫 `rgb(91,61,161)` / string=緑 `rgb(42,140,79)` / comment=灰 `rgb(134,134,139)` と色が分かれる。言語クラス無しブロックは span 0 で plain（フォールバック正常）。
- **TC-003:** inline 編集で初期にハイライト span（10個）、コードブロックにフォーカスで当該ブロックが span 0（plain 化）、外を実クリックで blur すると再ハイライト。ブロック消失・巻き戻りなし。
- **TC-004:** `<pre>` 内 Tab で行頭スペース 2→4（2挿入）、Shift+Tab で 4→2（2除去）、いずれもブロック構造維持・フォーカス離脱なし。Esc で `blur()` → `focusout` 発火、BODY へ抜けて再ハイライト。
- **TC-005:** 保存後の生 HTML は `shiki-token` / `<span` / `contenteditable` をいずれも含まず、clean な `<pre><code class="language-typescript">…</code></pre>` + `<pre><code>plain…</code></pre>`。最重要不変条件を満たす。

## 偽陽性として切り分けた事象（実装バグではない）

1. **React onClick が agent-browser `click` で発火しない**（既知問題）: `.focus()` + `press Space/Enter` で確実にアクティベートして回避。
2. **eval 内 `.click()` がデーモンをハング**（agent-browser 0.27.0）: `.focus()` + `press` 系へ切替えて回避。
3. **プログラム的 focus + 残存 Selection の refocus ループ**: `.focus()` + Selection API で caret を置いたまま blur するとブラウザが focus を戻す。実クリック blur では正しく再ハイライト。`focusout` 発火はイベントログで確認済みのため実装は正常。

## SKIP / 未検証の理由

- **TC-006（公開/履歴ビュー）:** 検証ノートが非公開で公開ビューへの直接リンクなし、履歴は複数版前提で未到達。公開（PublicNoteDetail）/ 履歴（NoteRevisionDetail）/ 法的文書（LegalDocument）ビューは TC-002 と同一の `app/components/note/content/highlighter` を共有する派生表示のため、TC-002 合格をもって蓋然性高と判断。
- **「他のコードブロックは focus 中もハイライト維持」:** 本ノートのハイライト対象が 1 ブロックのみ（no-lang は元来 plain）のためデータ制約で直接検証できず。`onFocusIn`/`highlightPre` が `<pre>` 単位で動作するコード上、影響は当該ブロックに限定される。
- **IME / JS 無効 / shiki ロード失敗 / `dist/server` への shiki 混入:** ブラウザ操作の範囲外。`dist/server` の shiki 0 件混入はメインエージェントが `pnpm build` + grep で別途確認済み（ADR-005）。

## スクリーンショット（`.issue/498/manual-test/screenshots/`）

- `tc-001-saved.png`
- `tc-002-readonly-highlight.png`
- `tc-003-inline-highlighted.png` / `tc-003-focus-plain.png` / `tc-003-blur-rehighlight.png`
- `tc-004-tab-indent.png` / `tc-004-esc-blur.png`
- `tc-005-clean-html.png`
