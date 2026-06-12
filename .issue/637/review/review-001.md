# PR Review #001 — feat(ui): 高度なローディングUX（#634 Phase 3）

**PR:** #651
**Date:** 2026-06-12
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7（重複含む。実質: doc 1 / SubmitButton堅牢化 1 / テスト 3 / 見送り 2）
- Notes: 17
- Verdict: **BLOCKED**（Warning を修正するため再レビューへ）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2）
- Accessibility・デザイン整合: review-001-a11y-design.md（B: 0 / W: 2）
- Test・計画/DoD整合: review-001-test.md（B: 0 / W: 3）

## 指摘一覧と仕分け

### 直す
- [Frontend W-001] indeterminate アニメの doc 表記が「スライド」のまま実装（animate-pulse / ADR-004）と不一致 — `docs/frontend_implementation_example.md:854,861` / `ProgressBar.tsx:11`
- [a11y W-001] SubmitButton が className 上書き時も `data-primary=""` を常時出力（footgun） — `SubmitButton.tsx:42`
- [Test W-001] SubmitButton の pending===true 経路（useFormStatus 本質挙動・DoD-3 核心）が未テスト — `__tests__/SubmitButton.test.tsx`
- [Test W-002] アップロード件数進捗の中間 done/percent（determinate value）が未検証 — `__tests__/UploadDialog.test.tsx`
- [Test W-003] IngestionJobRow の RetryableError 経路に専用 assert なし — `__tests__/IngestionJobRow.test.tsx`

### 見送り（ADR で合意済み・設計通り）
- [Frontend W-002] ShareLinkGate の prop drilling 解消が「ボタンのみ」で `isLocked` は残存 — ADR-003 で「複合条件のため isLocked は prop 残し」と明記済み。設計通りのため変更なし。
- [a11y W-002] 非 decorative な `role="progressbar"`/aria-busy 経路が実コード未使用（テストのみ） — ADR-001 で「将来実数進捗が来た場合に備え value? を受ける」と明記した将来拡張用 public API。テストで契約を担保しており YAGNI 許容範囲。変更なし。
</content>
