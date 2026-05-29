# PR Review #002 — perf(#258): UploadDialog ポーリング effect の view 依存による re-mount を解消

**PR:** #322
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 2
- Verdict: **APPROVED**

---

## General Review (Round 2)

### Blockers
- なし

### Warnings
- なし

W-001（review-001）は解消された。確認結果:

1. テスト名の誇張除去: `keeps one poll per interval ...` → `resumes polling at the regular interval through transient failures, then reaches editing`。旧コードでも成立する性質を guard と呼ぶ含意が消えた。
2. コメントの主張が実態と一致: 旧コメントの "a regression that re-introduces per-tick rescheduling bursts is caught"（誤り）を削除し、"the externally observable cadence ... is unchanged either way, so this is a behavioral guard ... not a detector of the internal re-mount itself" に格下げ。
3. plan.md も整合: ステップ6 を「振る舞いテストの追加」に改題し、誤った検知主張を削除、注意書きを追記（review-001 W-001 反映）。
4. 新たな問題なし: テスト本体不変、plan とコメントに矛盾なし、本番コード不変、21（全 2739）ケース緑。
5. 本番コード `UploadDialog.tsx` は不変。1回目の正当性評価（ref カウンタのリセット 2 箇所、cancelled フラグと再帰 setTimeout の整合、mount-once 前提）を維持。

### Notes
- **[N-001]** 修正は W-001 提案(a)（主張を実態に合わせる）を採用。提案(b)（mount/clearTimeout 回数の直接観測による真の re-mount 検知テスト）は不採用だが、テスト名・コメント・plan いずれも「re-mount 検知ではない」と明記しており誤解を招かないため問題なし。
- **[N-002]** 関連: `app/components/ingestion/__tests__/UploadDialog.test.tsx`（修正テスト）、`app/components/ingestion/UploadDialog.tsx:199-275`（不変）、`.issue/258/plan.md` ステップ6。

---

## Design Decisions

特になし。
