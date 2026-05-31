# Seed Data — Issue #365 manual-test

Issue #365（タグ利用件数を read-time 集計に変更）のブラウザ検証用に、ローカル D1
（`hollow-local-d1`）へ投入したテストデータの記録。

シードファイル: `.issue/365/manual-test/seed.sql`（冪等。対象ユーザーを DELETE→INSERT。他データ非破壊）

## 投入コマンド

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/365/manual-test/seed.sql
```

注意: `pnpm db:execute:local --file <path>` は package.json スクリプトが末尾 `--file` で終わるため
pnpm が `<path>` を転送できず単体では失敗する。`pnpm db:execute:local -- --file <path>`（`--` 区切り）
か、上記の `pnpm wrangler ...` 直叩きを使う。

## テストアカウント

| 項目 | 値 |
|---|---|
| email | `tag365@example.com` |
| password | `TestPassword123!`（`.issue/1/manual-test/seed.sql` のハッシュ流用 / PBKDF2-SHA256 600000 iter） |
| user id | `01938f99-0365-7000-8000-000000000001` |
| 状態 | email_verified=1 / banned=0 / deleted_at=NULL、credential アカウント1件 |

## 投入件数（このユーザー所有分）

users 1 / accounts(credential) 1 / directories 1（root）/ tags 4 / notes 4（うち trashed 1）/
note_tags 4 / publication_states 4 / instance_settings（INSERT OR IGNORE singleton）

## タグごとの期待 active 件数（DB レベルで検証済み）

| tag | note_count 列 | active 集計（期待表示） |
|---|---|---|
| work | 0 | **2** |
| idea | 0 | **1** |
| archived-only | 0 | **0**（trashed ノート1件のみ） |
| unused | 0 | **0**（note_tags 行なし） |

`work` は `note_count` 列を 0 のままにしてあるため、画面に **2** と表示されれば
「列値ではなく read-time の active 集計が真実源」であることを確認できる（本バグの本質回帰）。
