# PR Review #001 — refactor(issue/152): disabled 中の hover/active を pill button ファミリーに横断無効化

**PR:** #330
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

複雑度「小〜中規模」のため General Review 1本で実施。

---

## General Review

#### Blockers
- なし

#### Warnings
- なし

#### Notes

- **[N-001]** 正しさ: 打ち消し漏れなし。`pillBtn` 族の全 hover/active カラー/スケール utility（`hover:bg-surface-hover` / `active:bg-surface-hover` / `active:scale-[0.985]` / `data-[primary]:hover:bg-accent-hover` / `data-[primary]:active:bg-accent-pressed` / `data-[danger]:hover:bg-error-surface`）に `not-disabled:not-aria-disabled:` が漏れなく付与されている。`dialogCloseButton` の `hover:bg-surface` / `hover:text-ink`、`EDITOR_TOOLBAR_BTN` の hover/active 4 か所も `not-disabled:` で揃っている。残った無ガード utility（`motion-reduce:active:scale-100`、`focus-visible:*`、base 色）はいずれも disabled で視覚差を生まない正当なもの。

- **[N-002]** アンカー対応は妥当。`pillBtn` が実際にアンカー（`<Link className={pillBtn}>`）で使われていることを確認（`NoteActions.tsx`、`UploadDialog.tsx`、`TrashList.tsx`、`NoteRevisionRestorePanel.tsx`）。`NoteRevisionRestorePanel.tsx` では `<button disabled aria-disabled>` で aria-disabled も実在し、`not-aria-disabled:` ガードが空振りでないことを実証。`dialogCloseButton` と `EDITOR_TOOLBAR_BTN` は常に `<button type="button">` でアンカー化されず aria-disabled 契約も持たないため、`not-disabled:` のみとした切り分けは正確。

- **[N-003]** リグレッションなし。有効状態の hover/active セレクタは `:hover` → `:hover:not(:disabled):not([aria-disabled=true])` への純粋な絞り込みで、有効時の特異度・適用結果は不変。生成 CSS で実セレクタを確認（danger / scale / dialogClose が設計どおりに分かれて出力）。variant スタック順 `hover:not-disabled:`（hover 先頭）は既存コンベンション（`auth/styles.ts`・`public/styles.ts`）と一致。

- **[N-004]** ビルド検証クリア。`pnpm build` 成功、生成 CSS に `not([aria-disabled=true])` が出力されることを確認したため ADR-001 のフォールバック (C) は不要。`pnpm typecheck` もパス。lint の警告は変更外テストファイル由来で本 PR と無関係。

- **[N-005]** スコープ・規約・コメントすべて妥当。未対応だった pill 定数だけを既存 `hover:not-disabled:` パターンに揃えており過不足なし。`directory/styles.ts` のドロップダウンメニュー項目と `hover:underline` テキストリンクをスコープ外とした判断は plan に明記され妥当。`pillBtn` の JSDoc に `not-aria-disabled:` の WHY が ADR 参照付きで残されている。

---

## Design Decisions

特になし（既存の ADR-001 で `not-aria-disabled:` 採用理由を記録済み。レビューでその妥当性を裏付けた）。
