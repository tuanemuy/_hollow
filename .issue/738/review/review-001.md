# PR Review #001 — feat(speech): #738 Deepgram Nova-3 を文字起こし registry に対応

**PR:** #765
**Date:** 2026-06-21
**Round:** 1回目

## Summary
- Blockers: 0
- Warnings: 1
- Notes: 15
- Verdict: **BLOCKED**（Warning 1件を修正対象とするため）

## レイヤー別ファイル
- Adapter: review-001-adapter.md（B: 0 / W: 1）
- Frontend: review-001-frontend.md（B: 0 / W: 0）
- Test: review-001-test.md（B: 0 / W: 0）
- Domain + Docs: review-001-domain-docs.md（B: 0 / W: 0）

## 指摘一覧
- [W-001] Deepgram ping が err_code を reason 接頭辞に使わず捨てている（OpenAI は type: 接頭辞）— `app/core/adapters/deepgram/speechConnectionPing.ts:34-39,90-106`（Adapter）→ このPRで修正
- [N-001/test] サイズ上限ガード非対称（意図的）に実装側 WHY コメントが無く誤読しうる — `app/core/adapters/deepgram/speechRecognitionProvider.ts`（Test）→ WHY コメント追加で対応

## 仕分け
- W-001: 同一ファイル内・軽微・OpenAI 対称性の改善 → 修正する
- test N-001: 誤読防止の WHY コメント追加（安価）→ 対応する
- その他 Notes: 良い点・確認事項のため対応不要
