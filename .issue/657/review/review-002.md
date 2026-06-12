# PR Review #002 — feat(dev): presigned アップロードを same-origin dev プロキシで終端

**PR:** #662
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 21
- Verdict: **BLOCKED**（修正対象 Warning あり）

## レイヤー別ファイル

- Adapter: review-002-adapter.md（B: 0 / W: 0）
- Security: review-002-security.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧（すべて「このPRで直す」）

- [security W-001] dev サーバーを localhost 外公開した場合のリスク注意書きを docs に追加（固定ダミー credential は公開鍵に等しい）
- [test W-001] GET 経路の percent-decode 対称性（store-and-serve ラウンドトリップ）テスト追加

Round 1 の全指摘（6件）は修正済み・妥当と3レビュアーが確認。
