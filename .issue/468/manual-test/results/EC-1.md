# EC-1: 猶予期間内の pending/source は回収されない（進行中 commit の保護）

**結果**: PASS
**実行時間**: 約90秒（pruner 起動待ち含む。EC-2 と同一 tick で同時検証）
**セッション**: なし（CLI 検証）

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | UUIDv7 形式 id `019f0000-0000-7000-8000-000000468101` / storage_key `.../source/test-468-fresh` / `updated_at=now` の `pending/source` 行を seed | 行が `pending` で作成される | `pending` / `updated_at=2026-07-10T16:14:00.467Z`（現在時刻）で作成 | PASS |
| 2 | pruner（wrangler dev --env pruner --test-scheduled --port 8788）を起動し `curl "http://localhost:8788/__scheduled?cron=0+3+*+*+*"` で tick 発火 | `Ran scheduled event` | `Ran scheduled event`（200 OK） | PASS |
| 3 | tick ログの sweep 件数・エラー有無 | fresh 行は候補に載らず swept 0、error なし | `[prune] swept 0 abandoned source intake(s) (0 failed) { swept: 0, failed: 0 }`、ログに error 0件 | PASS |
| 4 | 行の status / updated_at を SELECT | `pending` のまま変化なし | `status='pending'` / `updated_at=2026-07-10T16:14:00.467Z`（seed 時と同一、再スタンプなし） | PASS |

## 手順からの逸脱

- **seed id**: testing.md の `test-468-fresh` は UUIDv7 形式でないため（TC-002 で判明した `DATA_INTEGRITY_ERROR` 回避）、id を UUIDv7 `019f0000-0000-7000-8000-000000468101` にし、識別は storage_key の `test-468-fresh` で担保した。

## 確認後の後始末

- seed 行は全 EC 完了後に DELETE 済み（`WHERE id LIKE '019f0000-0000-7000-8000-0000004681%'` → 残存 0 件確認）。
