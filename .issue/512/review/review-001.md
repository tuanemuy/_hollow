# PR Review #001 — fix(dev): seed:dev-admin を upsert で冪等化

**PR:** #515
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 4
- Verdict: **APPROVED**（Warning 2件は本ラウンドで対応済み）

---

## General Review

### Blockers
- なし

### Warnings

- **[W-001]** UPSERT 化により、固定 email/username を**別 id の user** が握っているケース（例: 手動サインアップで username `dev-admin` を作成済み）で一意制約違反になり seed が失敗する退行。旧 delete 方式（`DELETE ... OR email OR username`）では掃除されていた。
  - 場所: `scripts/seed-dev-admin.mjs`
  - 対応: **修正済み。** INSERT 前に `DELETE FROM users WHERE (email = ... OR username = ...) AND id <> '${USER_ID}';` を追加。固定 USER_ID の行は除外されるため所有データは upsert で保持され、衝突する foreign 行のみ掃除される。

- **[W-002]** ON CONFLICT の SET 句が `image` / `bio` / `avatar_media_id` / `last_username_changed_at` を温存する判断の根拠が未記載で、意図か漏れか判別不能。
  - 場所: `scripts/seed-dev-admin.mjs`
  - 対応: **修正済み（注記追加）。** これらは dev admin が設定し得る profile データであり、notes/directories と同様「所有データ」として再 seed でも温存するのが意図。SET 句の手前にその旨のコメントを追加。`created_at`（不変）の除外理由も併記。

### Notes
- **[N-001]** 根本原因の特定とコメントは正確。FK 定義（`directories.parent_id → directories RESTRICT`、`notes.directory_id → directories RESTRICT`、各 owner_id CASCADE）と一致。
- **[N-002]** sessions の delete→insert は安全。`sessions(id)` を FK 参照するテーブルは存在しない（leaf）。`id` 条件の追加も妥当。
- **[N-003]** SQL 構文は D1 (SQLite 3.x) で有効。`INSERT ... ON CONFLICT(id) DO UPDATE SET col = excluded.col` は正規 UPSERT 構文。カラム数・VALUES 数・スキーマ一致を確認。
- **[N-004]** スコープ適切。変更は `scripts/seed-dev-admin.mjs` のみ。スキーマ変更やスコープ外混入なし。

---

## 再検証結果（修正後）

| シナリオ | 結果 |
|---|---|
| ネスト directory 所有時の再 seed が exit 0・所有データ保持 | PASS |
| (W-001) foreign user が email/username を握る状態で seed 成功・imposter 削除・canonical 作成 | PASS |
| 連続2回実行で冪等 | PASS |
| dev-admin が admin/active 状態 | PASS |
| 固定トークンの session 復元 | PASS |

---

## Design Decisions

ADR-001（user 物理削除を避け UPSERT で冪等化）を維持。W-001 対応として「foreign 行のみ削除（自 id は除外）」を追加し、所有データ保持と衝突回避を両立。adr.md に追記。
