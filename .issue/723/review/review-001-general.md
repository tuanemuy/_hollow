# レビュー記録 — Issue #723 / PR #815（P12 エディターモックの FrontMatter 下部常設追従）

対象差分（`gh pr diff 815`）: `.issue/723/plan.md`, `.issue/723/testing.md`,
`spec/design/pages/P12-editor.html`, `spec/design/pages/mobile/P12-editor.html` の 4 ファイルのみ。
アプリ実装（`app/`）の変更はゼロ。スコープはクリーン。

## 受け入れ基準（AC-1〜AC-5）の検証結果

| ID | 基準 | 判定 | 根拠 |
| --- | --- | --- | --- |
| AC-1 | モードタブに `FrontMatter` が無い | OK | desktop は既に `WYSIWYG/HTML`（回帰なし）。mobile は L1114 の `FrontMatter` ボタンを除去し `WYSIWYG/HTML` の 2 タブに。 |
| AC-2 | 本文下にメタデータ領域が常設描画 | OK | 両モックとも `editor-body-panel` 後・`link-suggest` 前に `<section class="fm-panel" aria-label="メタデータ">` を追加。 |
| AC-3 | 構造モード（トグル+キー行+キー追加行）を反映 | OK | `生編集（JSON）` トグル（`aria-pressed="false"`）+ `date/description/slug` の 3 キー行（各 `削除`）+ `キーを追加` 行 + `<datalist>`（date/description/title/slug）が揃う。実装 `SUGGESTED_KEYS`・`frontMatterRow` と一致。 |
| AC-4 | 「別タブ排他」コメントを更新 | OK | desktop L648 のコメントから「別タブ排他」を削除し `#697` + `.fm-panel` 常設へ書き換え。`grep 別タブ排他` はヒットなし。残る L1146 の「FrontMatter タブ表記は #697 で削除済み」は実態に整合。 |
| AC-5 | 新トークンを定義せず既存トークンで馴染む | OK | PR 差分に `:root` / 新 `--*` 定義の追加なし。`.fm-*` は全て既存トークン（`--color-hairline`, `--color-surface-elevated`, `--space-*`, `--radius-*`, `--shadow-focus`, `--font-mono` 等）のみ使用。 |

全 AC を満たす。以下は品質面の指摘。

## General Review

### Blockers

なし。

### Warnings

- **[W-001]** 実装に存在しない可視見出し `メタデータ` をモックが追加している（実装との乖離）
  - 場所: `spec/design/pages/P12-editor.html:725,1390` / `spec/design/pages/mobile/P12-editor.html:793,1415`（`.fm-panel-title` 定義と `<span class="fm-panel-title">メタデータ</span>`）
  - 理由: 追従先の `FrontMatterEditor.tsx`（L284-314）は `<section aria-label="メタデータ">` の**不可視ランドマークラベルのみ**で、可視の見出しテキストを一切描画しない（最初の可視要素はトグルボタン）。モックは `.fm-panel-title` として「メタデータ」を可視表示しており、SSOT である spec/design が実装より要素を 1 つ多く持つ状態になる。モックから再実装・比較する者が「見出しがあるはず」と誤読する恐れがある。加えて `text-transform: uppercase; letter-spacing: 0.06em` は和文カタカナに視覚効果がなく、実装にも対応する装飾がない。
  - 提案: 実装に忠実にするなら `.fm-panel-title` span を削除し、`aria-label="メタデータ"` のみで landmark を表現する（静的モックとして節を示したいなら `sr-only` 相当の不可視ラベルにするか、コメントで「実装は可視見出しを持たない」旨を明記）。可視化を意図的に残すなら、それは実装追従ではなくデザイン提案なので Issue #723 のスコープ外である点を明示すべき。

- **[W-002]** `styles.ts` の相互参照コメントが今回の `.fm-*` リネームで宙に浮く
  - 場所: `app/components/note/editor/styles.ts:57`（`P12 FrontMatter key/value row (mock structured `.meta-field` rows)`）
  - 理由: plan L27 は当初「モック側のクラス名は `.meta-field` を用いて styles.ts ↔ モックの相互参照を成立させる」としていたが、mobile 既存の `.meta-field`（場所/タグ、L506/546）との衝突回避のため最終的に `.fm-*` へ変更した（plan L78）。結果、`styles.ts` の JSDoc が参照する `.meta-field` はモックの FrontMatter 行に存在せず（モックは `.fm-row`）、クロス参照が誤りになった。本 PR は `app/` を触らないため未修正のまま。
  - 提案: 追随フォローとして `styles.ts:57` の JSDoc を `.fm-row` 参照へ更新する（別 PR / 別コミットでも可）。少なくとも本 PR のレビューコメントか Issue に残し、宙ぶらりんな参照を放置しない。

### Notes

- **[N-001]** sr-only `<label>` が入力と未関連付け（実装は関連付け済み）
  - 場所: `spec/design/pages/P12-editor.html:1406-1434`（各 `<label class="sr-only">キー</label>` / `値`）ほか mobile 同箇所
  - 内容: モックの `<label class="sr-only">` は `for` を持たず、対応 `<input>` も `id` を持たないため孤立ラベル。ただし各 input は `aria-label`（`FrontMatter キー` / `date の値` 等）でアクセシブル名を持つので実害はない。実装 `KeyRow` は `htmlFor={keyInputId}`/`id` で正しく関連付ける（もっとも aria-label が優先されるため実装でもラベルテキストは上書きされる）。静的モックの忠実度としては軽微な差。気になるなら孤立 `<label>` を削るか `for`/`id` を付す。

- **[N-002]** 良い点: スコープが厳密。PR 差分は P12 の 2 モック + `.issue/723/` の計画/確認ドキュメントのみで、既知の pre-existing 不整合（desktop 本文は既存ノートだがタブは新規セット、#776 由来）は温存され触れていない。plan の方針どおり。

- **[N-003]** 良い点: desktop / mobile 間で FrontMatter DOM が完全一致（キー `date/description/slug`、値、`生編集（JSON）`・`削除`・`キーを追加` の文言、`<datalist>` の候補 `date/description/title/slug`）。`aria-pressed`・`aria-live="polite"`・各 input の `aria-label` も実装（`FrontMatterEditor.tsx`）と対応。トークン運用・レスポンシブ（desktop は `@media` で `.fm-row` を `flex-column` にスタック、mobile は既定でスタック）も既存パターンに馴染む。
