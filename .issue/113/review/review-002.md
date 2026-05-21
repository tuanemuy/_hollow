# PR Review #002 — feat(issue-113): real OCR / PDF adapters via Anthropic Messages API

**PR:** #117
**Date:** 2026-05-21
**Round:** 2 回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 11
- Verdict: **APPROVED**

Round 1 で挙げた 9 件の Warning はすべて適切に対応、見送り 2 件は明示的根拠あり、CI 全 pass (3/3 green)、plan.md / ADR / CLAUDE.md ガイドラインとの整合確認済み、新規 regression なし。

---

## General Review (Round 2)

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** A-W-001 / A-W-002 / A-W-003 はすべて「コメント/JSDoc で意図を明示」型の修正で、コード挙動は維持。`extractTextContent` の `.trim()` は既存 `AnthropicLLMProvider` 挙動と揃え、JSDoc に副作用を明記したことで port 契約 (空文字許容) との関係が明瞭になった。WHY 性の高いコメントになっており CLAUDE.md「Default to no comments. Add one only when the WHY is non-obvious」と整合。
- **[N-002]** D-W-002 / D-W-003 の修正は最小限で的確。consumer container の OCR/PDF `toBeDefined()` 追加、`buildOcrProvider`/`buildPdfExtractor` の空文字 3 ケースずつ追加で `&&` falsy semantics を test contract として固定。
- **[N-003]** T-W-001 の WHY コメントは pipeline 順序依存を明示し、リファクタ時の更新箇所を 1 行で示している。
- **[N-004]** T-W-003 で新規追加された `anthropicMessagesClient.test.ts` は 8191 / 8192 / 8193 byte 境界 + 100KB + Latin-1 0x80–0xFF を確実にカバー。`atob` + `charCodeAt` の canonical 逆変換 + 決定論的疑似乱数 `(i * 2654435761) & 0xff` で再現性確保。
- **[N-005]** T-W-004 で `cause: expect.any(TypeError)` 追加によりエラーチェーンが observability 観点で固定。
- **[N-006]** T-W-005 で regex 固定により誤った理由での throw に対する false-positive を防止。
- **[N-007]** 見送られた D-W-001 (`buildLlmProvider` helper 非対称) は plan.md ADR-002 で scope 外、Issue #110 完了後の段階的リファクタとして妥当。T-W-002 (`it.each` 化) も「可読性は保たれている」と判断済み、見送り妥当。
- **[N-008]** CI: 3/3 PASS (Lint / Format / Typecheck / Unit / Integration / Build)。
- **[N-009]** `progress.md` の Step 8 スキップ記述と実装の不整合 → 本ラウンドで `progress.md` を「全 Step 対応済み」に修正。
- **[N-010]** Hexagonal architecture 整合: helper は adapter 層内で完結し、error mapper injection によって port 別エラー型に集約。CLAUDE.md の cross-layer catch policy を遵守。
- **[N-011]** `AnthropicOCRProvider` / `AnthropicPDFExtractor` constructor の guard と `buildOcrProvider`/`buildPdfExtractor` 側の `&&` truthiness check が「helper は Stub にフォールバック / 直接 constructor 呼び出しは throw」と挙動を分けるが、これは正しい設計 (env-driven fallback vs contract 違反の即 throw)。新規 empty-string テストでこの分岐契約が両側から固定。

---

## Design Decisions

このラウンドで新たに見つかった設計判断はなし。
