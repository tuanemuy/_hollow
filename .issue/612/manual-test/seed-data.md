# Issue #612 マニュアルテスト用シードデータ

公開プロフィールの `publicNoteCount` が relay-lag 中の trashed-but-public 行を
過大カウントするバグ（#612）を再現するためのローカル D1 シード。

- シード SQL: `.issue/612/manual-test/seed.sql`
- 投入: `pnpm db:execute:local --file .issue/612/manual-test/seed.sql`
- 対象 DB: ローカル D1 `hollow-local-d1`（`pnpm dev` の読み先と同一）
- 参照 "now": 2026-06-13

## 準備作業

1. `CLAUDE.md` / `app/core/adapters/d1/schema.ts` を読み、`users` / `notes` /
   `publication_states` / `directories` / `search_documents` の NOT NULL・CHECK・
   FK・id 形式を確認。
2. 既存 seed 手段を確認: `scripts/seed-dev-admin.mjs`（id は UUIDv7 形式必須）、
   `.issue/605/manual-test/seed-605.sql`（同種の trashed-but-public 再現あり）を参考。
3. id 形式は UUIDv7（`UuidV7Generator.validate` を通る形式）。本シードは
   `01970000-...` プレフィックスを専用に予約（605 の `01960000-` とも衝突しない）。
4. `publicationStateRepository.countPublicByOwner` / `listPublicByOwner` は
   `notes`(status='active') JOIN `publication_states`(visibility='public',
   published_at IS NOT NULL) で件数を出すことを確認し、その JOIN 条件を満たす/満たさない
   データを設計。
5. 冪等性のため、シード先頭で `01970000-%` の行のみを children → parents の順で
   DELETE してから INSERT（他ユーザー・既存データは一切触らない）。

## 投入したシードデータ概要

| テーブル | 件数 | 備考 |
| --- | --- | --- |
| users | 1 | テストユーザー（username: `noteowner612`, status=active） |
| directories | 1 | ルートディレクトリ（depth 0） |
| notes | 6 | active 5 + trashed 1 |
| publication_states | 6 | 全行 visibility='public' |
| search_documents | 4 | 有効な active+public 4 件のみ（relay 出力相当） |

### テストユーザー

- username: `noteowner612`
- id: `01970000-0000-7000-8000-000000000001`
- email: `noteowner612@example.com`、status: active（email_verified=1 / banned=0 / deleted_at=NULL）

### ノートの状態

| slug | notes.status | visibility | published_at | 件数対象 |
| --- | --- | --- | --- | --- |
| note-one | active | public | set | カウントされる |
| note-two | active | public | set | カウントされる |
| note-three | active | public | set | カウントされる |
| note-four | active | public | set | カウントされる |
| note-ghost | trashed | public | set | **除外**（trashed-but-public / relay lag） |
| note-nullpub | active | public | NULL | 除外（published_at NULL の異常行） |

## 検証 SELECT 結果

```text
active_public_count        = 4   (status='active' AND visibility='public' AND published_at IS NOT NULL)
trashed_but_public_count   = 1   (status='trashed' AND visibility='public' AND published_at IS NOT NULL)
username                   = noteowner612

naive_count (status無視)   = 5   ← 修正前のバグが出していた過大カウント
```

期待: 公開プロフィールのヒーロー件数・一覧総件数がどちらも **4**（trashed-but-public の 1 件を除外）。
修正前は 5 と過大表示されていた状態を `naive_count=5` が再現している。

## 公開プロフィール URL

- ルート定義: `app/routes/u/$username/index.tsx`（`/u/$username`）
- URL: `http://localhost:3000/u/noteowner612`

## 備考・問題点

- `wrangler` は PATH に直接無いため、検証 SELECT は `pnpm exec wrangler d1 execute hollow-local-d1 --local --command "..."` で実行した（`db:execute:local` は --file 専用）。
- 既存データ（dev-admin・605 シード等）には触れていない。削除は `01970000-%` の行のみ。
- 本 Issue はスキーマ変更なしのため `db:generate` / `db:migrate` 追加は不要（既存マイグレーション適用済み前提）。
