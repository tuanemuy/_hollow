# PR Review #002 — feat(admin): #748 LLM 呼び出しの永続記録源を新設し P40 ダッシュボードに LLM 時系列を追従

**PR:** #760
**Date:** 2026-06-18
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 3（実体2テーマ）
- Notes: 16
- Verdict: **BLOCKED**（Warning 2テーマ修正対象）

## レイヤー別ファイル

- Application: review-002-application.md（B: 0 / W: 1）
- Adapter: review-002-adapter.md（B: 0 / W: 1）
- Frontend: review-002-frontend.md（B: 0 / W: 0）★APPROVE
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧と対応

- [App W-001] collect() 内で clock.now() を複数回読み hour 境界 TOCTOU で scalar=系列合計が崩れうる — `usageMetricsProvider.ts:44-58,100-105,141-152` → **修正**: collect() で now を1度確定し全集計メソッドへ注入（ADR-011）
- [Adapter W-001 / Test W-001] `llm_call_log` が共有 setup の CLEAN_STATEMENTS 未登録、per-file beforeEach は対症療法 — `__tests__/setup.ts` → **修正**: setup.ts に登録し per-file beforeEach 撤去（ADR-012）

## 見送った Note

- Frontend N-1/N-2/N-3、App N-001（ownerId as string の型穴・非対称だが provider 側で実害なし）、Adapter/Test の各 Note は許容範囲のため見送り。

## 検証

- typecheck / lint クリーン。unit 全パス。integration 全体 64 ファイル 786 テストパス。
