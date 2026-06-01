# シードデータ — Issue #388 動作検証

**作成日:** 2026-06-01
**ローカル D1:** `hollow-local-d1`（`.wrangler/state/v3/d1`、`vite dev` が参照）

## スキーマ補足（タスク指示との差分）

タスク指示は `users.status` カラムや `verify-email?token=` のサーバーログ出力を前提としていたが、
実際の本リポジトリは **better-auth スキーマ** を採用していた。

- `users` テーブルに `status` カラムは存在しない。検証状態は `email_verified (0/1)` で表現。
- パスワードは `accounts` テーブル（`provider_id='credential'`）に `$scrypt$...` ハッシュで格納。
- `/tmp/manual-test-388-server.log` に `verify-email` リンクや ConsoleEmailSender 出力は現れなかった。

このため新規サインアップ＋メール検証フローは使わず、**既存のシード済み検証済みユーザー** を流用した。

## 使用ユーザー（既存シード）

| 項目 | 値 |
|------|-----|
| email | `existing@example.com` |
| password | `Password123!` |
| username | `existing-user` |
| user.id | `01938f00-0000-7000-8000-0000000000a1` |
| email_verified | 1 |
| root directory id | `01938f00-0000-7000-8000-0000000000a3`（name=""、depth=0） |

ログインは `/login` から email+password で成功（better-auth 経由、server-fn 境界ではないため cross-origin の影響なし）。

## 追加投入したディレクトリ（INSERT）

owner_id = `01938f00-...a1`、root(`...a3`) 配下に3階層＋兄弟を作成:

| id | name | parent | depth | path |
|----|------|--------|-------|------|
| `019e8000-...0001` | Documents | root | 1 | /Documents |
| `019e8000-...0002` | Work | Documents | 2 | /Documents/Work |
| `019e8000-...0003` | 2024 | Work | 3 | /Documents/Work/2024 |
| `019e8000-...0004` | Personal | root | 1 | /Personal |

加えて既存シードのディレクトリ（existing-dir-1779991904395 / dup-dir-290 / valid-dir-290-ok）も
同ユーザー配下に存在し、ピッカーの候補件数（合計8件）に含まれた。

INSERT 例:

```sql
INSERT INTO directories (id,owner_id,parent_id,name,slug,depth,version,created_at,updated_at) VALUES
('019e8000-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000a1','01938f00-0000-7000-8000-0000000000a3','Documents','documents',1,0,datetime('now'),datetime('now')),
...;
```

## 後始末メモ

検証用に追加した4ディレクトリ（`019e8000-...0001`〜`0004`）はローカル D1 に残存。
必要なら以下で削除可能:

```sql
DELETE FROM directories WHERE id IN ('019e8000-0000-7000-8000-000000000001','019e8000-0000-7000-8000-000000000002','019e8000-0000-7000-8000-000000000003','019e8000-0000-7000-8000-000000000004');
```
