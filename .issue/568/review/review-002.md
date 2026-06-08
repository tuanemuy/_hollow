# PR Review #002 — feat: 領域5(P30/P31/P32)モックの未追従機能 (#568)

**PR:** #604
**Date:** 2026-06-09
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（修正の妥当性確認）
- Verdict: **APPROVED**

Round 1 の Blocker 2 + Warning 7 の修正を 3 視点（Security&Backend / Frontend&a11y / Test&Build）で再検証。すべて指摘の意図を満たして正しく修正され、新たな問題は検出されなかった。

---

## Security & Backend (Round 2) — Blocker 0 / Warning 0

- [B-001] `searchPublicByUsernamePrefix` の EXISTS に `JOIN notes ... AND notes.status='active'` が追加されタグ側と対称化。trashed 公開ノートのみの著者が除外されることをテストが固定（`trash-only` 除外 / `trash-live` 残置で note status 単位ゲートを証明）。
- [B-002] route 両方（`search.tsx` / `u/$username/index.tsx`）の `validateSearch`/`renderInputSchema` の `tags` に `.max(8)`、`SearchQuery.create` で `tagNames.slice(0,8)` の多層防御。境界正しく副作用なし。
- [W-SEC-001] `listPublicBacklinks` の `findReferrers(noteId, { limit: 20, offset: 0 })` でハイドレート上限。可視性フィルタ前の cap で順序正しい。
- リグレッション・新規列挙経路なし。typecheck/unit/lint クリーン。

## Frontend & a11y (Round 2) — Blocker 0 / Warning 0

- [W-FE-001] アイコン寸法トークン `--icon-2xs/xs/sm/md` を tokens.css + @theme inline + tokens.md ミラーの SSOT 3 点に追加（CLAUDE.md 手順準拠）。`SearchFilterDrawer`/`PublicTopControls` の lucide は全て `size-[var(--icon-*)]` に置換、**新規リテラル px ゼロ**（grep 確認）。lightningcss の `var()`-in-media 制約には非抵触。
- [W-FE-002] focus trap（open 時退避+close ボタンフォーカス / Tab・Shift+Tab ループ / outside 引き戻し / cleanup でフォーカス復帰 / Esc 維持 / 閉時 `inert`+`aria-hidden`）が堅牢。`aria-modal` と DOM 実態が整合。
- [W-FE-003] ヒーロー検索フォームに `tags`（配列反復）/`period` の hidden を追加し `username` と対称化。`z.array().max(8)` と round-trip 整合。`cursor`/`limit` リセットはコメント明示。

## Test & Build (Round 2) — Blocker 0 / Warning 0

- [W-TEST-002] user LIKE エスケープテストはミューテーション（`escapeLikePattern` 除去）で赤化を確認＝意味ある固定。
- [B-001 テスト] trashed 著者除外テストもミューテーション（visibility-only EXISTS に戻す）で赤化を確認。
- [N-TEST-002] `countPublicSearchFacets` の username 経路・存在しない username の NotFoundError を固定。
- ビルド修正: `searchActions.ts` の top-level zod schema を `public/schema.ts`（既存 `resolveShareLinkSchema` と同居）に切り出し。`pnpm build` 完走を実機確認。慣習（ingestion は z をインラインで top-level const を作らず回避）と整合。
- テスト戦略（real-DB integration / fake 不使用）遵守。回帰なし（public component 8 ファイル + 対象 integration 2 ファイル green）。

---

## Design Decisions

ADR-012(backend) / ADR-012(frontend) を Round 1 修正時に追記済み（active JOIN 対称化・tags クランプ・アイコン寸法トークン化）。本ラウンドで新規の設計判断なし。

## 完了

1 ラウンドクリーン（Blocker 0 + Warning 0）の完了条件を満たしたため、レビュー完了 = APPROVED。
