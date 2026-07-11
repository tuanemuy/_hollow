# EC-2: pending/image は sweep の対象外（ADR-004）

**結果**: PASS
**実行時間**: 約90秒（EC-1 と同一 tick で同時検証）
**セッション**: なし（CLI 検証）

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | UUIDv7 形式 id `019f0000-0000-7000-8000-000000468102` / `kind='image'` / `mime_type='image/png'` / storage_key `.../image/test-468-image` / 3日前バックデートの `pending` 行を seed | 行が `pending` で作成される | `pending` / `updated_at=2026-07-07T16:14:00.467Z`（3日前）で作成 | PASS |
| 2 | `curl "http://localhost:8788/__scheduled?cron=0+3+*+*+*"` で tick 発火 | `Ran scheduled event` | `Ran scheduled event`（200 OK） | PASS |
| 3 | tick ログの sweep 件数 | 猶予超過でも `kind='image'` は候補に載らず swept 0 | `[prune] swept 0 abandoned source intake(s) (0 failed) { swept: 0, failed: 0 }` | PASS |
| 4 | 行の status を SELECT | `pending` のまま変化なし | `status='pending'` / `updated_at=2026-07-07T16:14:00.467Z`（変化なし） | PASS |

## 手順からの逸脱

- **seed id**: testing.md の `test-468-image` は UUIDv7 形式でないため、id を UUIDv7 `019f0000-0000-7000-8000-000000468102` にし、識別は storage_key の `test-468-image` で担保した。

## 補足観察

- 同一 tick で EC-1（fresh source）と EC-2（stale image）を同時投入したが、sweep はどちらも候補にせず swept 0。`kind='source'` 限定 + 猶予 24h の両条件が効いていることを1回の tick で確認できた。

## 確認後の後始末

- seed 行は全 EC 完了後に DELETE 済み（残存 0 件確認）。
