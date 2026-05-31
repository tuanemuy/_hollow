# Seed Data — Issue #372 manual-test

Issue #372（タグ note_count 死蔵列の撤去）のブラウザ検証用に、ローカル D1
（`hollow-local-d1`）へ投入したテストデータの記録。

シードファイル: `.issue/372/manual-test/seed.sql`（冪等。対象ユーザーを DELETE→INSERT。他データ非破壊）

`#372` で `tags.note_count` 列が migration 0013 で撤去されたため、本シードは
`tags` への INSERT に `note_count` を一切含めない（含めると `no column named note_count` で失敗する）。
件数は read-time に `COUNT(active notes)` で算出される。

## 投入コマンド

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/372/manual-test/seed.sql
```

注意: `pnpm db:execute:local --file <path>` は package.json スクリプト末尾が `--file` のため
pnpm が `<path>` を転送できず単体では失敗する。`pnpm db:execute:local -- --file <path>`
（`--` 区切り）か、上記の `pnpm wrangler ...` 直叩きを使う。

## ログイン手順 / テストアカウント

| 項目 | 値 |
|---|---|
| ログイン URL | `/login`（dev: http://localhost:3000/login） |
| email | `tag365@example.com` |
| password | `TestPassword123!` |
| user id | `01938f99-0365-7000-8000-000000000001` |
| 認証方式 | better-auth の email + password（credential プロバイダ） |
| 状態 | email_verified=1 / banned=0 / deleted_at=NULL、credential アカウント1件 |

認証はメール／パスワード。OAuth・マジックリンク・開発バイパスは使わない。
パスワードハッシュは旧シード流用の **PBKDF2-SHA256 / 600,000 iter** 形式
（`pbkdf2-sha256-v1$...`）。現行コードは scrypt が標準だが、`D1CredentialStore` が
`legacyVerifyPbkdf2Hash`（`app/core/adapters/d1/repositories/credentialStore.ts`）で
旧 PBKDF2 ハッシュの検証を引き続きサポートするため、このハッシュでログインできる。
ログイン成功時に scrypt への lazy rehash が走る点に留意（次回以降は scrypt 行になる）。

## 投入件数（このユーザー所有分）

users 1 / accounts(credential) 1 / directories 1（root）/ tags 5 /
notes 7（active 6 / trashed 1）/ note_tags 7 / publication_states 7 /
instance_settings（INSERT OR IGNORE singleton）

## タグごとの期待 active 件数（DB レベルで検証済み）

| tag | active 集計（期待表示） | 備考 |
|---|---|---|
| work | **3** | active ノート3件 |
| idea | **2** | active ノート2件 |
| memo | **1** | active ノート1件 |
| archived-only | **0** | trashed ノート1件のみ（active 除外を確認） |
| unused | **0** | note_tags 行なし |

## 検証ポイント

- 件数表示: `/tags`（タグ管理画面）で各タグ行に `#name` と `N 件のノート` が表示される。
  期待値は上表の active 集計（work=3, idea=2, memo=1, archived-only=0, unused=0）。
  `archived-only` が **0** になることで「active のみ集計（trashed 除外）」を確認できる。
  該当コンポーネント: `app/components/tag/TagManager.tsx`、ルート `app/routes/_app/tags/index.tsx`。
- 人気順ソート: 件数は usecase `app/core/application/tag/listTags.ts` の `sort: "noteCount"` で
  降順ソート可能（リポジトリ `tagRepository.ts` が read-time の `COUNT(notes.id)` で並べる）。
  ただし現行 UI ローダー（`TagManager` / FilterBar）は既定で name asc。
  人気順の DB 動作は `work(3) > idea(2) > memo(1) > {archived-only, unused}(0)` の順で確認済み。
- ノート絞り込みのタグチップ（`app/components/note/list/FilterBar.tsx`）にも同じ noteCount が出る。

## 既存データへの影響

このユーザー（id 末尾 …001）のみ DELETE→INSERT。他のテストユーザー
（bob@example.com / tester354 / test-298 等）や production には触れていない。
staging/production への適用は行っていない（local のみ）。
