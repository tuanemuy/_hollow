# PR Review #002 — fix(dev): seed:dev-admin を upsert で冪等化

**PR:** #515
**Date:** 2026-06-06
**Round:** 2回目（確認ラウンド）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**（クリーン）

---

## General Review (Round 2)

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** W-001 修正は正しく適用済み。`(email OR username) AND id <> USER_ID` の括弧グルーピングが正しく、自所有データ（固定 USER_ID）は除外され upsert で温存される。
- **[N-002]** foreign 行削除が RESTRICT を踏み得るのは imposter がネストデータを所有する場合のみで、旧 delete 方式でも未対応の既存縁ケース。本修正による新規退行ではない（ADR-002 で明示済み）。
- **[N-003]** W-002 修正（温存カラムの意図コメント）は正確で ADR-003 と整合。先頭の根本原因コメントも実 FK 定義と一致。
- **[N-004]** SET 句の網羅性に漏れなし。再宣言11カラム / 意図的除外5カラム（PK・created_at・profile系4つ）。
- **[N-005]** sessions の `id` 条件追加も妥当（leaf テーブル、退行なし）。
- **[N-006]** スコープはクリーン。コード変更は `scripts/seed-dev-admin.mjs` のみ。

---

## 完了判定

1回目の Warning 2件は計画どおり修正済み、本ラウンドで新規 Blocker/Warning なし。**1ラウンドクリーンで完了**（review-guide Step 7）。
