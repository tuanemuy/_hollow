# ADR — Issue #512: seed:dev-admin の冪等化

## ADR-001: user を物理削除せず UPSERT で冪等化する

### Status
Accepted

### Context
`scripts/seed-dev-admin.mjs` は先頭で `DELETE FROM users` してから `INSERT` する delete-then-insert 方式だった。`dev-admin` が子レコード（特にネストした directory や directory を参照する note）を所有していると、user 削除の CASCADE が子テーブル間の RESTRICT 後方参照（`notes.directory_id`, `directories.parent_id`）に阻まれ `SQLITE_CONSTRAINT_TRIGGER` で失敗する。

選択肢:

1. **子レコードを正しい依存順で全削除してから user を消す** — directory 自己参照 RESTRICT のため葉から順に削除する必要があり、再帰的で脆い。所有データも失われる。
2. **user を物理削除せず UPSERT（ON CONFLICT(id) DO UPDATE）で canonical 状態を再宣言する** — CASCADE が発生しないため RESTRICT 違反が起きず、所有データも保持される。

### Decision
選択肢 2 を採用。`INSERT INTO users ... ON CONFLICT(id) DO UPDATE SET ...` で role/banned/email_verified/deleted_at 等の admin アクティブ条件を毎回再宣言する。`created_at` は不変なので更新対象に含めない。`sessions` は leaf テーブルで FK 子を持たないため従来どおり delete→insert で張り直す。

### Consequences
- 良い点: 真に冪等になり、所有データ（notes/directories/media）を破壊しない。Issue 記載の推奨方針に合致。スキーマ変更不要。
- トレードオフ: 固定 email/username を別 user id が握っている異常系は扱わない（seed は常に固定 USER_ID を使うため現実には発生せず、発生時は D1 が一意制約エラーを返す）。
