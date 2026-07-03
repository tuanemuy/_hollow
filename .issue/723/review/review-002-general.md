# レビュー記録 — Issue #723 / PR #815（P12 エディターモックの FrontMatter 下部常設追従）

**Round:** 2回目（フルレビュー・ゼロベース）
**Date:** 2026-07-03

対象差分（`gh pr diff 815`）: `.issue/723/plan.md`, `.issue/723/testing.md`,
`.issue/723/review/review-001*.md`, `app/components/note/editor/styles.ts`（JSDoc 1 行）,
`spec/design/pages/P12-editor.html`（desktop）, `spec/design/pages/mobile/P12-editor.html`（mobile）。
アプリ実装（`app/` のロジック）への変更はゼロ（styles.ts は JSDoc コメントのみ）。スコープはクリーン。

## 受け入れ基準（AC-1〜AC-5）の検証結果

| ID | 基準 | 判定 | 根拠 |
| --- | --- | --- | --- |
| AC-1 | モードタブに `FrontMatter` が無い | OK | desktop は `WYSIWYG/HTML`（#776 で APG 化済み・回帰なし、L1143-1144）。mobile は L1163 の `FrontMatter` ボタンを除去し `WYSIWYG/HTML` の 2 タブに（L1162-1164）。 |
| AC-2 | 本文下にメタデータ領域が常設描画 | OK | 両モックとも `editor-body-panel` の**直後**（`link-suggest` 静的見本の前）に `<section class="fm-panel" aria-label="メタデータ">` を追加。実装 `NoteEditor` の「本文パネル直後・保存アクション前に常設マウント」と一致。 |
| AC-3 | 構造モード（トグル+キー行+キー追加行）を反映 | OK | `生編集（JSON）` トグル（`aria-pressed="false"`）+ 空 `aria-live="polite"` 領域 + `date/description/slug` の 3 キー行（各 `削除`）+ `キーを追加` 行 + `<datalist>`（date/description/title/slug）。実装 `FrontMatterEditor.tsx` の `SUGGESTED_KEYS`・`frontMatterRow`・pillBtn 群と対応。 |
| AC-4 | 「別タブ排他」コメントを更新 | OK | desktop L651 のコメントを `#697` 常設パネルへ書き換え。`grep 別タブ排他 spec/design/pages/` はヒットなし。 |
| AC-5 | 新トークンを定義せず既存トークンで馴染む | OK | 差分に `:root` / 新 `--*` 定義の追加なし（grep 確認済み）。`.fm-*` は既存トークン（`--color-hairline`, `--color-surface-elevated`, `--color-bg`, `--space-*`, `--radius-lg/md`, `--shadow-focus`, `--font-mono`, `--transition-bg`）のみ使用。全て desktop `:root` に定義済みを確認。 |

全 AC を満たす。

## 前ラウンド指摘の反映確認

- **W-001（可視見出し「メタデータ」除去）**: 対応済み。両モックとも `.fm-panel-title` の CSS 定義・DOM span を完全に除去。`grep fm-panel-title` はヒットなし。「メタデータ」文字列は `aria-label="メタデータ"` の不可視ランドマークとコメント内のみに残り、実装（可視見出しなし）と一致。
- **W-002（styles.ts:57 の相互参照）**: 対応済み。JSDoc の `.meta-field` → `.fm-row` に更新（styles.ts L57）。モック側クラス名（`.fm-row`）と一致し、相互参照が復旧。

## General Review

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** mobile の `.mode-tabs` タブ列が APG 属性を欠く（pre-existing・本 PR では未悪化）
  - 場所: `spec/design/pages/mobile/P12-editor.html:1162-1164`
  - 内容: mobile の `role="tab"` ボタンは `aria-controls` / `id` / roving `tabindex` を持たず、desktop（L1143-1144, #776 で APG 化済み）および実装 `EditorModeSwitch.tsx`（`aria-controls={EDITOR_BODY_PANEL_ID}` + `editorModeTabId` + roving tabindex）に比べて不完全。ただしこれは #776 の APG 化が mobile モックに未到達だった pre-existing ギャップ（plan L74 が明記）であり、本 PR は `FrontMatter` ボタンを 1 つ除去しただけで悪化させていない。本 Issue のスコープ（FrontMatter 下部常設の追従）外。別 Issue で mobile モックの tablist を APG 準拠化するのが望ましい。

- **[N-002]** 「キーを追加」ボタンが空入力状態で活性表示（実装は空時 disabled）
  - 場所: `spec/design/pages/P12-editor.html:1462` / `spec/design/pages/mobile/P12-editor.html:1458`（`<button ...>キーを追加</button>`、追加行の入力は空）
  - 内容: 実装 `FrontMatterEditor.tsx` L367 は `disabled={disabled || newKeyBuffer.trim().length === 0}` で、追加入力が空のとき「キーを追加」を無効化する。モックは追加入力を空（placeholder のみ）で描きつつボタンを活性で見せており、この 1 状態のみ実装とズレる。静的スナップショットの表現上の微差で実害はない。忠実にするならボタンに `disabled` を付す（ただし「操作可能な様子」を見せたい意図なら現状も許容範囲）。

- **[N-003]** sr-only `<label>` が入力と未関連付け（round-1 N-001 の据え置き分・実害なし）
  - 場所: 両モックの各 `<label class="sr-only">キー</label>` / `値`（desktop L1385 付近〜, mobile L1409 付近〜）
  - 内容: モックの sr-only `<label>` は `for` を持たず対応 `<input>` も `id` 無しで孤立するが、各 input が `aria-label`（`FrontMatter キー` / `date の値` 等）でアクセシブル名を持つため実害なし。実装 `KeyRow` は `htmlFor`/`id` で関連付ける（もっとも aria-label が優先されラベル文言は上書きされる）。`.sr-only` は両モックに定義あり（desktop L823 / mobile L893）なのでラベルは不可視で、実装との視覚的乖離はない。

- **[N-004]** 良い点: 命名衝突を回避しつつスコープ厳密
  - mobile は既存 `.meta-field`（場所/タグの `.meta-field-label` フィールド、L1186/1239）を保持したまま、FrontMatter 領域は `.fm-*` 接頭辞で分離。命名衝突なし。desktop 本文が「既存ノート編集なのにタブは新規セット」という #776 由来の pre-existing 不整合も温存され、触れていない（plan 方針どおり）。

- **[N-005]** 良い点: desktop / mobile の FrontMatter DOM が完全一致
  - キー（`date`/`description`/`slug`）・値（`2026-04-01` / `Q2 のプロダクトレビューに向けた計画メモ` / `q2-plan`）・文言（`生編集（JSON）`・`削除`・`キーを追加`・`新しいキー名`）・`<datalist>` 候補（date/description/title/slug）・`aria-pressed`/`aria-live`/各 input の `aria-label` が両モックで一致し、実装 `FrontMatterEditor.tsx` と対応。datalist の `id="fmSuggestedKeys"` は各ファイル 1 個のみで重複 id なし。レスポンシブ（desktop は `@media` で `.fm-row` を `flex-column`、mobile は既定でスタック）も既存パターンに馴染む。
