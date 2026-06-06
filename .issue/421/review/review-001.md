# PR Review #001 — fix(a11y): AccountDeleteForm のサーバーエラー時もダイアログを閉じず in-dialog 表示する (#421)

**PR:** #511
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

複雑度「小規模」のため General Review 1 本で実施（review-guide Step 2）。1 ラウンドでクリーンにつき完了（Step 7）。

---

## General Review

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** 実装は plan.md / adr.md と完全に整合。4 つの計画ステップ（in-dialog 切替・catch の close 抑止・closeDialog での error 破棄・import 整理）がすべて反映され、A 群リファレンス `NoteActions.tsx:240` の `error={confirmDeleteOpen ? (error ?? undefined) : undefined}` と同形（`index.tsx:151-155` で `fieldErrors === undefined` ゲートを 1 つ追加して validation 排他化）。
- **[N-002]** 正確性のガードは正しい。`index.tsx:33-34` で `fieldErrors` は validation のときのみ定義 → validation では `confirmOpen && fieldErrors === undefined` が false → `error?` prop は undefined → ConfirmDialog は in-dialog alert を描画しない。validation は入力欄近接のみ、非 validation は in-dialog のみで二重表示は構造的に起きない。stale error も open/close の `setError(null)` と `confirmOpen` ゲートの三重で防止。
- **[N-003]** ライフサイクルは #98 ADR-005 の「ダイアログ境界＝error 破棄」と対称化。open / close 両境界・成功時で error クリア。旧「error は保持」コメントも撤去済み。
- **[N-004]** 型安全。`exactOptionalPropertyTypes: true` 下で `error ?? undefined` を渡し null 混入なし。`pnpm typecheck` 緑。
- **[N-005]** テスト品質良好。Dialog の document.body portal を利用し SUT root 配下に alert が漏れないことを検証（外側 summary 撤去の回帰防止）。3 ケースが plan ステップ 5 (a)(b)(c) を網羅。脆い/偽陽性アサートなし。`pnpm vitest run` 3 passed。
- **[N-006]** 未使用 import 取り残しなし（`displayError` / `FIELD_ERROR` 削除済み）。dead code なし。コメントは why のみで CLAUDE.md 方針に整合。
- **[N-007]** a11y。ConfirmDialog 側 panel の `aria-describedby` と入力欄側は独立系統で、非 validation 時は競合しない。二重読み上げは #98 ADR-005 分析どおり回避。ブラウザ検証 report.md も TC-01/02/03 全 PASS。

---

## Design Decisions

特になし（adr.md ADR-001 で記録済みの設計判断を実装が踏襲。新規の設計判断は本ラウンドで発生せず）。
