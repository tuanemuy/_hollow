# PR Review #002 — impl: 領域1(P10/P11/P12/P20) のモック実装追従

**PR:** #548
**Date:** 2026-06-07
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 良好（全レイヤー）
- Verdict: **APPROVED**

レビューレイヤー: モック追従・デザイン規約 / フロントエンド correctness / テスト（3視点並列）。1 周目（review-001）の Warning 7 件はすべて解消済み（修正コミット `bc3ca11`）。

---

## モック追従・デザイン規約
- Blockers: なし / Warnings: なし
- M-W-001（editor-topbar の ml-auto 移動）は `editorActions` 定数で正しく適用され、モック `[tabs][save-status]…[actions]` 配置に一致。M-W-002 は ADR-003 追補で意図的差分として記録。M-W-003（chip gap）は共有 chip 採用で現状維持が正。
- 新規任意値は `min-w-[184px]`（Menu 幅）/ `[44px]`（タッチターゲット床）のみで既存慣行に倣う。リテラル px 新規持ち込みなし。

## フロントエンド correctness
- Blockers: なし / Warnings: なし
- F-W-002（applyBtn の死に `aria-disabled`/`not-aria-disabled` variant 削除）は hover/通常状態が削除前後で同一、挙動破壊なし。`reduceViews` の export は利用箇所に影響なし。editor-topbar 再配置は `editorReducer` 不変・a11y（sr-only ラベル等）維持。

## テスト
- Blockers: なし / Warnings: なし
- `savedViewChips.test.ts`（chip 4 関数: sort 全 6 組 / visibility 空・単一・複数 / dateRange preset・フォールバック・片側・null・ISO→date-only / directory 解決成功・失敗・null、`baseDate` 注入で決定論化）が実装の出力 SSOT と一致。`reduceViews` は実テスト化（placebo 全除去）。NoteMetaPanel の公開状態 negative テストは公開日との混同を回避し ADR-002 を回帰防止。

---

## Design Decisions

特になし（review-001 で記録した ADR-003 追補で完結）。

---

## 完了

Blocker 0 / Warning 0 を 1 ラウンドで達成。完了条件（Step 7: 1 ラウンドクリーン）を満たすためレビューループ終了。PR を Ready for review に切り替える。
