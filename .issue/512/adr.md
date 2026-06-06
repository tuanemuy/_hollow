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
- トレードオフ: 固定 email/username を別 user id が握る foreign 行は、INSERT 前に `id <> USER_ID` 条件で限定削除して衝突を回避する（下記 ADR-002）。その foreign 行がさらにネスト directory 等を所有していると削除が RESTRICT で失敗し得るが、これは旧 delete 方式でも未対応の既存縁ケースであり、現実のローカル開発では稀。

## ADR-002: foreign 衝突行のみを限定削除する（レビュー W-001 対応）

### Status
Accepted

### Context
ADR-001 の UPSERT 化で、固定 email/username を**別 id の user**（例: 手動サインアップ）が握っている場合、`ON CONFLICT(id)` は id 衝突しか拾わないため `uniq_users_email`/`uniq_users_username` で seed 全体が失敗する。旧 delete 方式（`DELETE ... OR email OR username`）では掃除されていた挙動の退行。

### Decision
INSERT の直前に `DELETE FROM users WHERE (email = '${EMAIL}' OR username = '${USERNAME}') AND id <> '${USER_ID}';` を加える。固定 USER_ID の行は明示的に除外するため、自分の所有データは upsert 経由で保持され、衝突する foreign 行のみが掃除される。

### Consequences
- 良い点: 旧方式の衝突回避を回復しつつ、ADR-001 の所有データ保持を両立。
- トレードオフ: foreign 行が子レコードを所有していると削除が RESTRICT で失敗し得るが、旧方式でも未対応の既存縁ケース。

## ADR-003: profile カラムを再 seed で温存する（レビュー W-002 対応）

### Status
Accepted

### Context
`ON CONFLICT DO UPDATE` の SET 句で `image` / `bio` / `avatar_media_id` / `last_username_changed_at` を更新対象に含めるかが論点になった（INSERT 側は新規作成時 NULL を入れる）。

### Decision
これらは dev admin が設定し得る profile データであり、notes/directories と同じく「所有データ」として再 seed でも温存する。SET 句に含めず既存値を保持し、その意図をコメントで明示する。`created_at` は不変のため同様に除外。再宣言するのは identity（name/email/username/display_username）と admin-active 条件（role/banned/email_verified/deleted_at）に限る。

### Consequences
- 良い点: 再 seed が profile/owned データを破壊しないという ADR-001 の方針と一貫。
- トレードオフ: 既存行が壊れた `avatar_media_id` を持っていても自動復旧はしない（admin/active 復旧という本 Issue の主目的には無関係）。
