# PR Review #001 — feat(dev): presigned アップロードを same-origin dev プロキシで終端

**PR:** #662
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7（adapter W-001 と security W-002 は同一問題 → 実質6件）
- Notes: 24
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Adapter: review-001-adapter.md（B: 0 / W: 1）
- Security: review-001-security.md（B: 0 / W: 3）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧（すべて「このPRで直す」）

- [adapter W-001 / security W-002] 不正 percent-encoding で decodeURIComponent が未捕捉 URIError → 500（403/404 に正規化すべき）
- [security W-001] dev GET 配信に `X-Content-Type-Options: nosniff` / Content-Disposition デフォルトがない
- [security W-003] 期限検証の弱さ（NaN 日付素通り・X-Amz-Expires 上限なし）
- [test W-001] server.cloudflare.ts の dev プロキシゲートに自動テストなし
- [test W-002] verify の malformed 分岐のテストが1ケースのみ
- [test W-003] 期限切れ境界値（ちょうど期限時刻）と GET 経路の期限切れが未テスト
