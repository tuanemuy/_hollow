# 実装計画 — Issue #512: seed:dev-admin が既存ローカルD1で FK 制約により失敗する（冪等性の取りこぼし）

**Issue:** #512
**作成日:** 2026-06-06
**複雑度:** 小規模

---

## 目的

`pnpm seed:dev-admin`（`scripts/seed-dev-admin.mjs`）を、`dev-admin` が既にノート/ディレクトリ等の子レコードを所有した状態でも冪等に再実行できるようにする。現状は先頭の `DELETE FROM users` が FK の RESTRICT 制約に阻まれて `SQLITE_CONSTRAINT_TRIGGER` で失敗する。

## 根本原因（調査で確定）

`users` を `DELETE` すると以下へ `ON DELETE CASCADE` が伝播する:

- `directories` (owner_id → users CASCADE)
- `notes` (owner_id → users CASCADE)
- `media_assets` (owner_id → users CASCADE)

ところが子テーブル間には RESTRICT の後方参照がある:

- `notes.directory_id → directories(id) ON DELETE RESTRICT`
- `directories.parent_id → directories(id) ON DELETE RESTRICT`（自己参照・ネスト構造）

CASCADE で directory を消そうとした時点でそれを参照する note / 子 directory が残っていると RESTRICT が発火し、user の削除全体が中断される。再現条件はネストした directory（または directory を参照する note）を `dev-admin` が所有していること。

**再現確認済み:** ローカル D1 で `dev-admin` 配下にルート＋子の2階層 directory を作って `pnpm seed:dev-admin` を実行 → `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)` で exit 1。Issue 記載のエラーと一致。

さらに、子データが浅い（ルート directory 1件＋note 1件）場合は CASCADE が成功してしまうが、その際 **`dev-admin` の所有データ（note / directory）が消える**という副作用も確認した。冪等な再 seed が所有データを破壊するのは望ましくない。

## スコープ

### 含まれるもの
- `scripts/seed-dev-admin.mjs` の SQL を「user を物理削除せず UPSERT で冪等化」する方式に変更する。
- `sessions` は leaf（子レコードを持たない）なので従来どおり delete→insert で冪等化する。
- 変更意図を説明するコメントの更新。

### 含まれないもの
- スキーマ（マイグレーション）の変更。FK の RESTRICT 設定はアプリの正しい不変条件であり本 Issue の対象外。
- `dev-admin` 以外の seed スクリプト新設。
- 本番/ステージング向けの seed 整備。

## 実装ステップ

### 1. user の削除をやめ UPSERT 化する

- **対象ファイル:** `scripts/seed-dev-admin.mjs`
- **変更内容:**
  - `DELETE FROM users WHERE id = ... OR email = ... OR username = ...;` を削除する。
  - `INSERT INTO users (...) VALUES (...)` に `ON CONFLICT(id) DO UPDATE SET ...` を付け、canonical な admin 状態（`role='admin'`, `banned=0`, `email_verified=1`, `deleted_at=NULL`, name/email/username 等）を再宣言する。`created_at` は不変なので SET 対象に含めない。
  - 所有データ（notes/directories/media）は触らず残す。
- **理由:** user を消さなければ CASCADE が発生せず RESTRICT 違反も起きない。所有データも保持される。Issue が推奨する「物理削除せず UPDATE（upsert）で冪等化」方針そのもの。

### 2. sessions は delete→insert を維持しつつ堅牢化

- **対象ファイル:** `scripts/seed-dev-admin.mjs`
- **変更内容:** `DELETE FROM sessions WHERE token = ... OR user_id = ... OR id = ...;` の後に固定 SESSION_ID/TOKEN を INSERT。sessions は他テーブルから参照されない leaf なので削除は安全。`id` も削除条件に加えて SESSION_ID の取りこぼしを防ぐ。
- **理由:** session は使い捨ての認証状態であり、毎回新鮮なものを張り直すのが正しい。FK 子を持たないため delete が安全。

### 3. コメントの更新

- **対象ファイル:** `scripts/seed-dev-admin.mjs`
- **変更内容:** 旧「Deleting the user cascades ...」コメントを、なぜ user を upsert にするのか（RESTRICT による CASCADE 中断と所有データ保持）に差し替える。

## 設計判断

- **UPSERT（user 保持）を選択し、子レコードの順序削除は採らない。** 子データを正しい依存順で全削除する案は、directory 自己参照 RESTRICT の葉から順に消す必要があり脆く危険。UPSERT は所有データを保持しつつ canonical 状態を再宣言でき、Issue の推奨方針にも合致する。詳細は adr.md 参照。
- **email/username が別 user id に握られている異常系は対象外。** seed は常に固定 USER_ID を使うため、ON CONFLICT(id) で同一行が更新され衝突しない。別 id が固定 email/username を保持する状況は現実のローカル開発では発生せず、発生時は D1 が明確な一意制約エラーを返す。順序削除の脆さを持ち込むより、この縁ケースは扱わない。

## リスクと注意点

- D1（SQLite 3.x）は UPSERT（`ON CONFLICT ... DO UPDATE`）をサポートする。`wrangler d1 execute` 経由でも動作する。
- 既存のクロージングメッセージ「Re-run anytime; it is idempotent.」は変更後も正しい（むしろ初めて真に冪等になる）。
- 文字列補間で SQL を組む構造は変えない（固定の定数のみを埋め込むローカル専用スクリプトで、外部入力は無い）。

## テスト方針

- ローカル D1 にネストした directory を持つ `dev-admin` を用意し、`pnpm seed:dev-admin` が exit 0 で成功し、所有データ（notes/directories）が保持されることを確認する（詳細は testing.md）。
- 連続2回実行しても成功する（冪等性）ことを確認する。
- `dev-admin` が存在しない初期状態でも正しく作成されることを確認する。

## レビュー履歴

小規模 Issue のため Step 4 のレビューループはスキップ（issue-planner の小規模パスに従う）。
