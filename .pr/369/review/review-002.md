# PR Review #002 — feat(security): SECRET_BOX_MASTER_KEY の production fail-fast 化と placeholder ガード

**PR:** #369
**Date:** 2026-05-31
**Round:** 2回目（review-001 の Warning 修正後）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**（1回目のクリーン。完了には2回連続が必要 → Round 3 へ）

---

## Security + Infra / CI

### Blockers
なし

### Warnings
なし

### Notes
- W-002（trim 正規化の非対称）解消: `assertNoShippedPlaceholders` が `typeof actual === "string" && actual.trim() === placeholder` となり runtime（`selectSecretBox`）と判定基準が一致。前後空白付き placeholder が CI 素通り → boot 500 の穴を塞いだ。
- W-001/W-003（ドリフト検知）解消: infra テストが `.dev.vars.example`（`../../../`、`import.meta.url` 起点）を共通アンカーに同期検証。app 側テストも同じファイルに anchor。3 箇所複製のいずれがズレても両 workspace から CI 検出。
- wrangler 両テンプレートの `[vars]`/`[env.consumer.vars]` 両方に `REQUIRE_SECRET_BOX_KEY="true"`、dev には無し。deploy workflow `Validate secrets` で `wrangler secret bulk` 前に placeholder を弾くチェーン確認済み。

---

## Test + Adapter / DI

### Blockers
なし

### Warnings
なし

### Notes
- W-004 完全解消: 鍵状態 × requireKey マトリクスを網羅（unset / empty / whitespace-only / valid / non-base64 / not-32-bytes / placeholder(+前後空白) × requireKey true/false）。全ケースが実装分岐と対応。
- アサーション品質良好: `isSecretBoxError` + `code` 確認、`expect.unreachable()`、実 crypto で round-trip、過剰 mock なし。
- Adapter/DI に退行なし。今回の追加は adapter/test のみで DI 配線は不変（`createConsumerContainer` 経由で web/consumer 両経路をカバー）。
- （参考）consumer 経路の名前付きテストは無いが内部で同経路を通るため実質カバー済み（追加は任意・スコープ外）。

---

## Design Decisions

新規の設計判断なし。
