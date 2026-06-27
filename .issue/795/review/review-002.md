# PR Review #002 — refactor(note): #795 editor メディアアップロードUI刷新

**PR:** #797
**Date:** 2026-06-27
**Round:** 2回目

## Summary

- Blockers: 2（Test B-004 / B-005）
- Warnings: 5
- Notes: 21
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 2 / W: 4）
- Architecture / Consistency: review-002-arch.md（B: 0 / W: 0 — マージ可）

## 前ラウンド指摘の解消

- [B-001 frontend] data-disabled → 解消（label に付与 + DROPZONE に CSS）
- [B-001/B-002/B-003 test] sizeLabel undefined / コンポーネントテスト / XHR モック → 解消
- [W-001/W-002/W-003 arch] 5GBハードコード / kind_ / formatMegabytes → 解消

## 指摘一覧と仕分け

- [W-001 frontend] `data-disabled` の値が `true`（規約 ADR-003 は `data-x=""`）— `MediaUploader.tsx:232` → **直す**（値を `""` に、テスト assertion も更新）
- [B-004 test] 成功フローが `Promise.resolve()` 連打依存で脆い → **直す**（安定した待機に置換）
- [B-005 test] エラー/retry 経路（presign or XHR 失敗 → error state → RetryableError → onRetry 再実行）が未テスト → **直す**
- [W-006 test] 複数回アップロード（done → idle → uploading）未テスト → **直す**（修正した退行ポイントの確認になる）
- [W-007 test] progress 表示・画像サムネイル描画の確認欠落 → **直す**（MockXHR の upload.onprogress を発火させて確認）
- [W-008 test] unsupported MIME バリエーション不足 → **見送り**（`validateMediaFile` のユニットテスト validation.test.ts で MIME バリエーションは網羅済み。コンポーネント層は1ケースで十分）
- [W-009 test] ingestion `UploadForm.tsx` の formatMegabytes 別コピー → **スコープ外**（別ドメインの重複。Phase 4 でスコープ外改善として検討）

## 修正方針

1つの修正サブエージェントに委譲（すべて MediaUploader.tsx の1行 + MediaUploader.test.tsx に閉じる）。
