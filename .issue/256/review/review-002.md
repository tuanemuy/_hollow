# PR Review #002 — feat(issue/256): upload dialog a11y (aria-labelledby / focus / SR announce)

**PR:** #274
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

---

## Frontend / Component Design

### Blockers
なし

### Warnings
なし

### Notes
- 1周目の W-FE-001 (statusId 削除) / W-FE-002 (ADR Status `Accepted`) / W-FE-003 (initialFocusRefRef ミラー削除) すべて解消確認
- `<PreviewMissing>` サブコンポーネントの追加は責務分離として妥当。`UploadDialog` の view machine effect と React の effect 順序保証（子 → 親）により focus 競合なし
- `viewStatusText` の `default` で `throw new Error("unreachable: ...")` 化はランタイム穴を埋めており CLAUDE.md の「illegal states unrepresentable」志向と整合

---

## Accessibility

### Blockers
なし

### Warnings
なし

### Notes
- W-A11Y-001 (statusId 未参照) / W-A11Y-003 (preview === null の focus 不達) はいずれも完全解消
- `<PreviewMissing>` の `role="alert"` + `tabIndex={-1}` + 自動 focus の組み合わせは WAI-ARIA Authoring Practices に整合
- W-A11Y-002 (`select` 戻り時の SR 空文字遷移) は据え置き判断・記録済み（実機 SR 検証は人手フォローアップ）

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- W-TEST-001 (effect ordering 暗黙前提のコメント) / W-TEST-002 (`MAX_FLUSH=50` 反復上限) / W-TEST-003 (`.toContain` → `.toBe`) すべて解消確認
- 2周目で指摘された Notes (`<PreviewMissing>` 経路のテスト未追加) を本ラウンドで対応。`IngestionPreviewForm.test.tsx` に「focuses the alert paragraph when job.preview is null」テストを追加し、render + tabIndex + auto-focus を pin
- 全テスト 2557/2557 PASS

---

## Architecture / Consistency

### Blockers
なし

### Warnings
なし

### Notes
- W-ARCH-001 (statusId 削除) / W-ARCH-002 (`viewStatusText` default 句の `throw`) いずれも解消
- ADR-001〜004 すべて Status `Accepted` に更新
- `<PreviewMissing>` の追加はレビュー由来の defensive a11y フォールバックで、スコープ外には該当しない
- 全体としてスコープ外作業の混入なし、plan.md / adr.md の意図に沿った実装

---

## Design Decisions

このラウンドで新たな ADR 相当の判断はなし。
