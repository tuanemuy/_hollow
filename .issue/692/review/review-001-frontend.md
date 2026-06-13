# PR #719 レビュー (review-001) — Frontend

対象: PR #719 / Issue #692（input・エディタのフォーカス表現見直し: caret-only + グローバルリング細線化）
観点: Frontend
担当 AC: AC-1（エディタ本文 caret-only）/ AC-2（タイトル caret-only）/ AC-3（input 細線化）/ AC-6（auth 直値追従）

## AC 検証サマリ

| AC | 結果 | 根拠 |
|----|------|------|
| AC-1 エディタ本文 caret-only | OK | WysiwygEditor `EditorContent` から `focus-within:border-accent focus-within:shadow-focus` を削除（`WysiwygEditor.tsx:576`）。内側 `[&_.ProseMirror]:focus-visible:shadow-none` / `[&_.ProseMirror]:caret-accent` / `[&_.ProseMirror]:selection:bg-accent-surface` は残存。InlineEditor host からも同2クラスを削除（`InlineEditor.tsx:863`）。子孫打ち消し `[&_:focus-visible]:shadow-none` + `caret-accent` + `selection:bg-accent-surface` 残存 |
| AC-2 タイトル caret-only | OK | `titleInput` に `caret-accent` + `focus-visible:shadow-none` を追加（`editor/styles.ts:18`）。JSDoc も caret-only 方針に更新 |
| AC-3 input 細線化 | OK | `tokens.css:120` を `0 0 0 2px var(--color-accent)` に更新。`@theme inline` ブリッジ（`index.css:107`）とグローバル `:focus-visible`（`index.css:174-178`）は `var()` 参照で自動波及。`shadow-focus` ユーティリティ消費者（public search/TOKEN_INPUT/form、tag ×2）はトークン追従 |
| AC-6 auth 直値追従 | OK | `auth/styles.ts:40` の error+focus 合成影を `0_0_0_4px_oklch(37.1%_0_0_/_0.28)` → `0_0_0_2px_var(--color-error)` に更新。inset error 枠 `inset_0_0_0_1px_var(--color-error)` は維持。4px の取り残しなし |

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** ドラフト `draft-color-4-neutral.html` の旧 4px リングが取り残されている / `spec/design/drafts/draft-color-4-neutral.html:117`（define）・`:181`（consume） / グローバルトークン値 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` を **define かつ consume している** にもかかわらずこの PR で同期されていない。リポジトリ全体で旧値 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` を直値定義+消費する HTML はこのファイルだけが未同期で残る（他の `draft-color-*` 8件は別のアクセント色相を使うため正当に対象外、`drafts/P10-header-refined.html` は同期済み）。plan / ADR-003 は「define=consume=105（drafts は P10-header-refined のみ）」と grep 結果を確定していたが、`draft-color-*` 系の neutral バリアント（＝canonical 値と完全一致）を数え漏らしていた。AC-5 の「直値複製の全モック同期（乖離ゼロ）」趣旨に対する取り残し。**提案**: `draft-color-4-neutral.html:117`/`:181` も値文字列 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` 単位で `0 0 0 2px var(--color-accent)` に同期する。なお担当 AC（AC-1/2/3/6=アプリ実装）はいずれも満たされており、本件は AC-5（モック同期）側の漏れ。

### Notes
- **[N-001]** スコープ遵守は良好。WysiwygEditor / InlineEditor の編集で削除されたのは `focus-within:border-accent` と `focus-within:shadow-focus` の2クラスのみ。#689 の領分（`border-hairline` / `rounded-md` / `p-4` / `transition-[border-color,box-shadow]`）には一切触れていない（diff で確認）。`transition-[border-color,box-shadow]` は plan どおり残置（box-shadow トランジションが無害に残るのは許容、ADR-004）。
- **[N-002]** caret-only 打ち消しの機序は正しい。グローバル `:focus-visible` は `@layer base`（`index.css:174-178`、bare pseudo-class）で `box-shadow: var(--shadow-focus)` を当てており、`titleInput` の `focus-visible:shadow-none` は `@layer utilities` + `.focus-visible\:shadow-none:focus-visible`（class & pseudo-class）。カスケードレイヤー順・詳細度ともに base に勝つため打ち消しは効く（plan「詳細度の担保」/ ADR-002 note と一致）。`!important` への退避は発生しておらず、ユーティリティファースト規約に沿う。
- **[N-003]** WysiwygEditor 側で wrapper への `focus-visible:shadow-none` 追加が「不要」という plan の判断は正しい。`EditorContent` の root(div) は contenteditable でなくフォーカスを受けず、実フォーカスは内側 `.ProseMirror`（`[&_.ProseMirror]:focus-visible:shadow-none` 保有）。`focus-within:shadow-focus` 削除のみで caret-only が完結する。InlineEditor host(`<section>`) も `applyEditable` が host を除外しフォーカス不能で、子孫の箱リングは `[&_:focus-visible]:shadow-none` が打ち消す。両者とも削除のみで成立する点を確認。
- **[N-004]** auth INPUT の error+focus 合成 box-shadow は壊れていない。`data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_2px_var(--color-error)]` は inset 1px error 枠 + 外側 2px error リングの2レイヤー shorthand として well-formed。リング色を accent ではなく error 色に統一した点も ADR-003 の判断（error フィールドで accent リングと error 枠の意味混線を避ける）と整合。
- **[N-005]** 残存する `shadow-focus` 消費者（`public/styles.ts:202,299,346`、`tag/styles.ts:75,144`）はいずれも通常 input で、トークン経由で 2px に自動追従するのが正しい挙動。書く面ではないため caret-only 化の対象外。public TOKEN_INPUT の `focus-within:shadow-focus` も意図的に残置されており妥当。
- **[N-006]** Styling 規約遵守: 新規 handwritten CSS / `@apply` の追加なし。トークン変更は `tokens.css` SSOT の1箇所のみ（`@theme inline` ブリッジは `var()` 参照で非編集）。モック P12 の `.editor:focus-visible` / `.title-input:focus-visible { box-shadow: none }` 追加は mock 専用 HTML 内の static CSS であり、アプリ側の utility-first 方針とは独立（plan ステップ4 どおり）。
- **[N-007]** P12 モック（PC `spec/design/pages/P12-editor.html:484-487,709-711`、mobile も同様）に caret-only 上書きが追加され、`--shadow-focus` 直値も新値へ同期済み。アプリ実装とモックの一致が保たれている。

## 結論
担当 4 AC（AC-1/AC-2/AC-3/AC-6）はすべて正しく実装されている。Blocker なし。Warning は AC-5（モック直値同期）側の取り残し1件（`draft-color-4-neutral.html`）で、Frontend 担当 AC の合否には影響しないが「乖離ゼロ」の趣旨に対する漏れとして要修正。

---

## メインの仕分け（Round 1）
- **[W-001] → 見送り（スコープ外・設計判断）**: `spec/design/drafts/draft-color-*.html` は配色探索の凍結スナップショット。9色（slate/gray/zinc/neutral/stone/taupe/mauve/mist/olive）それぞれ別 accent 色 + 探索当時の `4px / alpha 0.28` フォーミュラを共有している。neutral 版だけリングを 2px へ同期すると探索セット内の一貫性が壊れる。本Issueの plan スコープは `spec/design/pages/**`（= 生きているデザインシステムのページモック）であり、`spec/design/drafts/` の配色探索アーカイブは対象外。「canonical 値の乖離」ではなく「探索当時の見た目を意図的に保持したアーティファクト」なので同期しない。ADR-006 に記録。
