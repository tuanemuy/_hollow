# PR Review #001 — refactor(common): 可変単位バイト整形ヘルパ（formatBytes）の重複を共有 util に集約

**PR:** #829
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 6
- Verdict: **BLOCKED**（Warning 1件を修正のため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 0 / N: 4）
- Test: review-001-test.md（B: 0 / W: 1 / N: 2）

## 指摘一覧

- [W-001] 「丸め」ケースが toFixed 丸めを exercise していない（1.5 は正確値） — `app/components/common/__tests__/byteSize.test.ts:61-63`（Test）
- [N-001] 実閾値ケースが合成値（実 UI 値 256 MB の 0 桁を未ロック） — `app/components/common/__tests__/byteSize.test.ts:65-70`（Test）
- [N-002] `scaled>=100` 境界直下（99.0 KB）を未ブラケット — `app/components/common/__tests__/byteSize.test.ts:52-55`（Test）
- [N-001〜004]（Frontend）はすべて良い点（1文字一致・ADR-001 据え置き・verbatim テスト・型緩和の意図補完）

## 対応

- [W-001] 修正: `applies toFixed rounding within a unit` に `1280 → "1.3 KB"`（1.25→"1.3"）を追加し実丸めをロック。
- [N-001] 修正: 実閾値ケースを実 UI 値へ差し替え（export 256 MB の 0 桁 / ingestion 32 MB / 削除影響 2 GB）。
- [N-002] 修正: `drops the decimal exactly at the scaled-value 100 boundary` に `99*1024 → "99.0 KB"` を追加し境界をブラケット。
- Frontend Notes は良い点のため対応不要。

修正後 `npx vitest run .../byteSize.test.ts`（10 passed）・`pnpm typecheck`・`pnpm lint` すべてクリーン。
