# レビュー review-001 — Accessibility & Design tokens（PR #719 / Issue #692）

**レビュー観点:** Accessibility & Design tokens
**対象 PR:** #719（`issue/692/focus-caret-only-thin-ring`）
**レビュー日:** 2026-06-13

---

## 検証サマリー

### AC-4（WCAG 2.4.7 / 2.4.11、白・surface 両背景で 3:1 以上）— 満たす

新値 `--shadow-focus: 0 0 0 2px var(--color-accent)`、accent = `oklch(37.1% 0 0)`（無彩・alpha なし）。
OKLab → linear sRGB → 相対輝度で独自検算した結果:

- accent の相対輝度 Y ≈ **0.051**（ADR の「~0.105」より低い＝より暗い＝コントラストはより高く出る）
- 対 白背景（`--color-bg` = `#ffffff`、Y=1.0）: (1.0+0.05)/(0.051+0.05) ≈ **10.4:1**
- 対 surface 背景（`--color-surface` = `#f5f5f7`、Y≈0.93）: ≈ **9.5:1**

いずれも 3:1 を**大幅に**超過し、AC-4 を満たす。ADR-002 の確定値・方針判断は妥当（数値はやや控えめに見積もられているが、保守的な方向の誤差なので結論に影響なし。N-001 で補足）。

不透明 accent への切替により「フォーカス前（地のみ）↔ 後（不透明 2px リング）」の変化コントラストも確保され、2.4.11 の change-of-contrast 観点も満たす。旧値（`0 0 0 4px oklch(37.1% 0 0 / 0.28)`、白背景合成で実効 ~1.6:1）が抱えていた 2.4.11 未達を、細線化と同時に解消できている。

### WCAG 2.4.11「最小領域」要件 — 満たす

2.4.11 の最小領域は「(a) 1px 周長相当の面積、または (b) 短辺に沿った 4px ライン」のいずれか。本変更は要素の外周を**囲む solid 2px リング**（box-shadow spread 2px）であり、周長を 2px 幅で囲う形は (a) の「1px 周長」を上回る面積を満たす。2px へ細線化しても最小領域は割らない。実測（TC-003）でも `oklch(0.371 0 0) 0px 0px 0px 2px`（spread 2px・不透明）を確認済み。

### caret-only の書く面（キーボードフォーカス可視性）— 許容範囲

WysiwygEditor / InlineEditor / titleInput とも、caret = accent（`caret-accent`）+ 選択色（`bg-accent-surface`）でフォーカスを示す。テキスト編集領域における caret は標準的かつ WCAG 上受容されるフォーカス表現で、原稿キャンバスのメタファーとも整合する。ただし「無選択・空テキスト時の caret のみ」での可視性には弱さが残る（W-001）。

### auth error+focus のリング可視性 — 満たす

`data-[error]:focus-visible:shadow-[inset_0_0_0_1px_var(--color-error),0_0_0_2px_var(--color-error)]`。error 文脈で外側リングを error 色（`#c43e3e`）に統一する判断は意味の混線を避けており妥当（ADR-003）。error+focus 時は `focus-visible:bg-bg` で背景が白になるため、リング隣接背景は白。検算: error 色 vs 白 ≈ **5.1:1**（3:1 充足）。error 状態でも focus 可視性は保たれる。

### ダークモード非該当 — 正しい

`app/styles/` にテーマ分岐（`prefers-color-scheme` / `.dark` / `data-theme` / `color-scheme`）は存在せず、accent も無彩単一。非該当の前提は正しい。

### トークン同期（AC-5）— 完全

- `tokens.css`（SSOT、120 行）/ `spec/design/tokens.md`（226 行値表・535 行 mobile `:root`）を新値に同期。
- 311 行 prose に caret-only 例外の一文を追記（ドキュメント乖離防止）。
- `spec/design/pages/**` の旧値 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` 残存 **0 件**、新値 `0 0 0 2px var(--color-accent)` を **105 ファイル**で確認。
- P12-editor.html（PC / mobile 両方）に `.editor:focus-visible { box-shadow: none }` / `.title-input:focus-visible { box-shadow: none }` の caret-only 上書きを確認。
- `@theme inline` ブリッジ（`index.css:107`）・グローバル `:focus-visible`（`index.css:174-178`）は `var()` 参照で未編集（自動波及）。設計どおり。

---

## Accessibility & Design tokens

### Blockers

- なし

### Warnings

- **[W-001]** caret-only の書く面で「空・無選択時」のフォーカス可視性が弱い
  場所: `WysiwygEditor.tsx:576` / `InlineEditor.tsx:863` / `editor/styles.ts:titleInput`
  理由: フォーカス表現が caret + 選択色のみになったため、テキストが空（新規ノートのタイトル/本文）でキーボードで Tab 移動した場合、可視手がかりは点滅 caret 1 本だけになる。caret は標準的フォーカス表現として WCAG 上受容されるが、accent caret は無彩（`oklch(37.1% 0 0)`）で点滅幅も細く、白背景上では「今どこにフォーカスがあるか」を瞬時に把握しづらい場面が起こりうる。2.4.7（Focus Visible）は満たすが、2.4.11/2.4.13（AAA）の "強い可視性" 観点ではリング廃止により後退している。
  提案: ブロッカーではない（ADR-001 のトレードオフとして許容された設計判断であり、text input の caret は WCAG 適合）。ただしマニュアルテストのエッジケース「キーボードでの書く面フォーカス可視性」は TC として独立実行されていない（summary は TC-001/002/003 のみ）。空タイトル・空本文を Tab だけで辿る検証を 1 ケース追加で実機確認し、「caret だけで見失わない」ことを記録すると AC のエッジケース網羅が閉じる。実装変更は不要。

### Notes

- **[N-001]** ADR-002 のコントラスト数値が実測より控えめ
  場所: `.issue/692/adr.md:60-63`
  理由: ADR は accent の相対輝度を ~0.105、白 6.8:1 / surface 6.3:1 と記載。独自検算では Y≈0.051、白 ~10.4:1 / surface ~9.5:1。差は OKLab L→輝度変換の見積り方法の違いによるもので、**保守的（低めに出す）方向の誤差**。3:1 を満たすという結論には一切影響しない。記録の正確性のため、将来 ADR を更新する機会があれば実測寄りの値に直してもよい（必須ではない）。

- **[N-002]** error+focus リングの spread が 2px・inset 枠が 1px で合成
  場所: `auth/styles.ts:40`
  理由: 外側 error リング 2px + 内側 inset error 枠 1px の二重表現。両方 error 色（`#c43e3e`）で、白背景に対し 5.1:1。視認性・コントラストとも問題なし。旧 4px の取り残しゼロ（grep・実測で確認）。AC-6 充足。指摘ではなく確認記録。

- **[N-003]** `transition-[border-color,box-shadow]` が wrapper に残置
  場所: `WysiwygEditor.tsx:576` / `InlineEditor.tsx:863`
  理由: box-shadow を削除した後も box-shadow トランジションが残る。ADR-004 で #689（border 撤去）の領分として意図的に残す判断であり、無害（遷移対象が無くなるだけ）。A11y 影響なし。`motion-reduce:transition-none` も維持されており動き軽減配慮も保たれている。指摘ではなく確認記録。

---

## 結論

A11y・Design tokens 観点で **Blocker なし**。WCAG 2.4.7 / 2.4.11 の可視性・コントラスト・最小領域はいずれも独自検算で 3:1 を大幅超過し満たす。トークン同期（SSOT / mirror / 105 モック / prose）も完全。caret-only の空テキスト時可視性のみ AAA 観点で軽微な後退があり、エッジケースの実機検証記録の追加を推奨（W-001、実装変更不要）。

---

## メインの仕分け（Round 1）
- **[W-001] → 見送り（許容済みトレードオフ + 検証済み）**: 書く面の caret-only は ADR-001 で許容したトレードオフ。空状態のフォーカス可視性は、ブラウザ検証 TC-001/TC-002（`/notes/new` = 空の新規ノート）で空の本文・タイトルをフォーカスし caret=accent / box-shadow=none を実機確認済み。追加のコード変更は不要。
