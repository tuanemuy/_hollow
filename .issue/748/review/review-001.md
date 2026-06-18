# PR Review #001 — feat(admin): #748 LLM 呼び出しの永続記録源を新設し P40 ダッシュボードに LLM 時系列を追従

**PR:** #760
**Date:** 2026-06-18
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7（重複含む。実体5テーマ）
- Notes: 25
- Verdict: **BLOCKED**（Warning 全件修正対象）

## レイヤー別ファイル

- Application: review-001-application.md（B: 0 / W: 2）
- Adapter: review-001-adapter.md（B: 0 / W: 1）
- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧と対応

- [App W-001 / Adapter W-001] scalar と hourly series の集計窓不一致 — `usageMetricsProvider.ts:137-152` → **修正**: scalar を `windowStartIso()` に揃え scalar=系列合計を保証。ADR-004 確定追記
- [App W-002 / Adapter N-001] recordCall の createdAt が occurredAt 流用 — `llmCallLogRecorder.ts:31-32` → **対応**: clock 依存追加は過剰と判断、why コメント明記
- [Frontend W-001] 2カラム breakpoint がモック(lg/1024px)と不一致(md) — `Dashboard/index.tsx:297` → **修正**: `md:grid-cols-2`→`lg:grid-cols-2`。N-001(高さ)/N-002(キャプション対称)も同時修正
- [Test W-001] runPruneTick failure isolation 未テスト → **修正**: handlers.integration に独立 try/catch テスト2本追加
- [Test W-002] getUsageMetrics hourly DTO map 非null分岐空振り → **修正**: 非null系列の ISO8601 map テスト追加
- [Test W-003] provider 名真実源 (llmProviderName) 未検証 → **修正**: serverCloudflare.test に4本追加

## 追加修正（修正検証中に検出）

- usageMetricsProvider / llmCallLogRecorder の integration テストが共有 D1（env.DB）で `llm_call_log` 行リークによりファイル合同実行で失敗 → 各テストファイルに `beforeEach` で `llm_call_log` クリーンを追加し分離。integration 全体64ファイル786テスト全パスを確認。
