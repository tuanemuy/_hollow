# PR Review #001 — feat(speech): #766 Gemini audio 文字起こしプロバイダを registry に追加

**PR:** #794
**Date:** 2026-06-27
**Round:** 1回目

## Summary
- Blockers: 0
- Warnings: 5
- Notes: 15
- Verdict: **BLOCKED**（Warning 修正のため次ラウンドへ）

## レイヤー別ファイル
- Adapter / Infrastructure: review-001-adapter.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 2）
- Domain / Frontend 配線: review-001-domain-frontend.md（B: 0 / W: 1）

## 指摘一覧
- [W-001/adapter] サイズガードに JSON エンベロープ headroom が無い — `app/core/adapters/gemini/speechRecognitionProvider.ts:43,110-116` → 修正
- [W-002/adapter] speech probe の workerd AbortError reason 非対称 — `gemini/connectionPing.ts:98` → 見送り（共有 LLM probe 由来・合否不変）
- [W-001/test] 401/403/429 が instanceof のみで HTTP ステータス文言未検証 — `speechRecognitionProvider.test.ts` → 修正
- [W-002/test] サイズガード上限直下の境界未 pin — `speechRecognitionProvider.test.ts` → 修正
- [W-001/domain] INVARIANT コメントの default-model 利用箇所記述が実態と乖離 — `valueObject.ts:258-269` → 修正
