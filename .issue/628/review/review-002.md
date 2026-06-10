# PR Review #002 — feat(layout): ヘッダー（グローバル）UIを再設計

**PR:** #638
**Date:** 2026-06-10
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0（コード上）
- Notes: 数件（既存 dead constant 等、本PR起因でないもの）
- Verdict: **APPROVED**

3観点（Frontend/a11y、Styling/Tailwind特異度、Spec/Design整合）で round 1 の修正を再検証。全 Warning が解消され、新規の Blocker/Warning は検出されなかった。

---

## Frontend
- Blockers: なし / Warnings: なし
- Escape ガード [FE-W001] の正しさを3点検証して妥当: (a) `[aria-haspopup][aria-expanded="true"]` は DirectoryTree の素の `aria-expanded`（haspopup 無し）を誤検知しない、(b) 同一イベントディスパッチ内で aria 属性は更新されずリスナ登録順非依存、(c) usePopover が open 時に `aria-haspopup`+`aria-expanded=true` を確実に付与。UserMenu は aside 子孫として描画されガードに捕捉される。デスクトップは UserMenu 自身が Escape を処理（二重なし）。
- テスト更新 [FE-W002]・アバター shrink-0 [FE-W003]・menuPanel JSDoc も解消確認。

## Styling / Architecture
- Blockers: なし / Warnings: なし（コード）
- [STYLE-W001] の hover ガード修正を実ビルドCSSで裏取り: demote hover が (0,4,0) を確保し base hover (0,4,0) に対し source order で後勝ち → `surface` 採用で正しい。`HEADER_CTA_COLLAPSE` の `min-h-9!`/`px-0`/`w-9` も実CSSで全て有効。
- CTA バー連鎖削除は完全（取り残しゼロ）。新規 dead constant なし。layout `ICON_BTN` は merge-base 時点からの既存 dead（本PR起因でない・別途整理候補）。
- 注: round 1 修正は本レビュー時点でワーキングツリーのみ（[STYLE-W101]）→ **本レビュー直後にコミット・push して解消**。

## Spec / Design Consistency
- Blockers: なし / Warnings: なし
- [SPEC-W001] デスクトップモック新規作成の `cta-icon` 二段ルールを agent-browser 実測で検証: desktop = テキストのみ・36px、upload = アイコン+ラベル。mobile collapse のCSSカスケードも正しい。実装 `Header.tsx`（`sm:hidden`/`max-sm:hidden`）と論理一致。§7.2「密度差: primary=アイコン+ラベル / secondary=テキストのみ」とも合致。
- [SPEC-W002] 007.md の 36px・ヘッダー局所表現を確認。ADR-004 / index.md / モック実体と三者整合。

---

## Design Decisions
新規の設計判断なし。

## 完了判定
Blocker 0・Warning 0（コード）。round 1 の全 Warning を修正済み、round 2 で再確認しクリーン。**APPROVED**。round 1 修正のコミット・push 後に PR を Ready for review へ切替。
