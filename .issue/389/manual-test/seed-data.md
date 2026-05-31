# Issue #389 ブラウザ検証用シードデータ

ノート一覧ビュー（/ ホーム）の UI 改善（罫線の二重表示・サムネイル廃止・更新日時重複・
リスト/タイルの情報量統一）の検証に必要な、ログイン済み状態 + 多様なノートを
local D1 に直接投入した記録。

## 実行した準備作業

1. スキーマ / loader 実装の調査
   - `app/core/adapters/d1/schema.ts`: `users` / `sessions` / `directories` / `notes` /
     `tags` / `note_tags` / `publication_states` のカラム・NOT NULL・CHECK を確認。
     - `notes.status` は `('active','trashed')` のみ。一覧に出すには `active`。
     - `publication_states.visibility` は `('private','unlisted','public')`。
     - `tags.name_normalized` は NOT NULL。`D1TagRepository.normalizeName` =
       NFKC 正規化 + 小文字化（ASCII タグ名なら単に lowercase）。
   - `app/components/note/loaders.ts` → `listNotesByOwner` 経由（`q` 空のフィルタ経路）。
     home の各表示フィールドの由来を確定:
     - `excerpt` … `notes.content_html` をプレーンテキスト化して先頭 200 文字
       （`listNotesByOwner.ts` の `htmlSanitizer.toPlainText(...).slice(0,200)`）。
     - `tagNames` … `note_tags` → `tags.name`。
     - `visibility` … `publication_states.visibility`（行が無いノートは表示上 `private` 既定）。
     - `updatedAt` … `notes.updated_at`。
   - 表示モード: URL 検索パラメータ `display`（`app/components/note/schema.ts` =
     `z.enum(["list","tile","calendar"])`）。home ルートは `app/routes/_app/index.tsx`（パス `/`）。
   - 全 id は UUIDv7（`idGenerator.validate` の正規表現）。`uuid` の `v7()` で生成。
     `tags.id` も UUIDv7 必須（#354 で malformed id の実績）。
   - 各ユーザーに「暗黙のルートディレクトリ」（`parent_id IS NULL`, `name=''`,
     `slug=''`, `depth=0`）が必要。ノートは `directory_id` を持つ（NOT NULL）。

2. 認証方式の確定（#387 と同一手法）
   - agent-browser からの signup/login UI 経由は 403 FORBIDDEN_CROSS_ORIGIN になるため使わない。
   - **DB 直接投入 + セッショントークン直挿し**でログイン状態を作る。
   - `sessions.token` は平文保存（better-auth 慣習）。既知トークンを INSERT すれば
     そのまま cookie 値として使える。`accounts` 行は作らない（パスワードログインしないため）。
   - cookie 名は `app/lib/server/currentUser.ts` / `app/core/presentation/authMiddleware.ts`
     の `SESSION_COOKIE`（= `"__Host-session"`）で確定。

3. シード SQL を作成・適用
   - ファイル: `.issue/389/manual-test/seed.sql`（冪等。先頭で既存 test-389 ユーザーを
     DELETE → cascade で sessions/directories/notes/tags/note_tags/publication_states も
     消える → 再 INSERT。再実行安全）。
   - 適用: `pnpm db:execute:local .issue/389/manual-test/seed.sql`
   - SELECT で全件投入を確認済み（下記）。
   - マイグレーションは適用済み（既存 22 ユーザー / 36 ノートが存在。test-389 は本シードで追加）。

## 投入したシードデータ

### users（1 件）

| id | email | username | role | status |
|----|-------|----------|------|--------|
| `019e7ec9-02e5-700e-b569-9cf9220b82fb` | `test-389@example.com` | `test389` | member | active |

### sessions（1 件）

| token（= cookie 値） | user_id | expires_at |
|----|----|----|
| `seed389-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb` | `019e7ec9-02e5-700e-b569-9cf9220b82fb` | `2030-01-01T00:00:00.000Z` |

### directories（2 件、ルート含む）

| id | name | slug | parent | depth |
|----|------|------|--------|-------|
| `019e7ec9-02e6-70a1-ae3e-f77a28cbd06f` | (root, 空) | (空) | NULL | 0 |
| `019e7ec9-02e6-70a1-ae3e-faeadecb8765` | Notes | notes | root | 1 |

全ノートは `Notes` ディレクトリ直下に配置（ディレクトリ階層は本 Issue の検証対象外）。

### tags（6 件）

| id | name | 用途 |
|----|------|------|
| `019e7ec9-02e7-7779-9097-fb900ba4859e` | `work` | 一般タグ |
| `019e7ec9-02e7-7779-9097-fd0f35f27ee9` | `idea` | 一般タグ |
| `019e7ec9-02e7-7779-9098-01a9235aa900` | `archived` | 一般タグ |
| `019e7ec9-02e7-7779-9098-05a9567404e2` | `this-is-an-intentionally-very-long-tag-name-for-wrap-test` | **長いタグ名**（タイルの折り返し確認用） |
| `019e7ec9-02e7-7779-9098-0a435a0df8ba` | `personal` | 一般タグ |
| `019e7ec9-02e7-7779-9098-0eb95fc395bd` | `draft` | 一般タグ |

### notes（7 件、全 active、全て Notes ディレクトリ直下）

更新日時降順で一覧表示される。

| # | title | visibility | タグ | 抜粋（本文） | updated_at |
|---|-------|-----------|------|--------------|------------|
| 1 | 公開ノート（タグ複数・長い抜粋） | **public** | work, idea | あり（約 200 文字、切り詰め確認用） | 2026-05-30T18:30 |
| 2 | 限定公開ノート（長いタグ名・短い抜粋） | **unlisted** | 長いタグ名 ×1 | 短い | 2026-05-28T08:15 |
| 3 | 非公開ノート（タグ複数・抜粋あり） | **private** | work, idea, 長いタグ名（計 3） | あり（中程度） | 2026-05-25T14:45 |
| 4 | タグなしノート（公開・中程度の抜粋） | **public** | （なし） | あり（中程度） | 2026-05-20T11:00 |
| 5 | 抜粋なしノート（本文空・private） | **private** | draft | **なし**（本文空） | 2026-05-10T09:30 |
| 6 | 短い抜粋ノート（限定公開） | **unlisted** | personal | 短い | 2026-04-15T16:20 |
| 7 | アーカイブ参考（非公開・タグ2件） | **private** | archived, work | あり（中程度・最古） | 2025-12-31T23:59 |

visibility カバレッジ: public ×2（#1,#4）/ unlisted ×2（#2,#6）/ private ×3（#3,#5,#7）。

検証要件への対応:
- 公開状態チップの色分け … public / unlisted / private を最低 1 件ずつ網羅。
- タグ折り返し … #2,#3 に長いタグ名。複数タグは #1,#3,#7。タグ無しは #4。
- 抜粋の有無 … あり（#1,#3,#4,#7）/ 短い（#2,#6）/ 無し（#5、本文空）。
- 更新日時のバラけ … 数日〜数ヶ月（2025-12 〜 2026-05）にわたり分散。

### 投入件数（SELECT 検証済み）

| table | 件数 |
|-------|------|
| users | 1 |
| sessions | 1 |
| directories | 2 |
| notes | 7 |
| tags | 6 |
| note_tags | 10 |
| publication_states | 7 |

## テスト用ログイン手段

パスワードログインは不要。**セッション cookie を直接ブラウザに設定**する。

- cookie 名: `__Host-session`
- cookie 値（token）: `seed389-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb`
- username（URL 用）: `test389`
- domain: `localhost`
- path: `/`
- secure: true（`__Host-` プレフィックス要件。ブラウザは `localhost` を secure context
  として扱うため http://localhost でも受理される）
- sameSite: lax

### agent-browser での設定方法

CDP の `Network.setCookie` で投入する（`__Host-` プレフィックスは `name` をそのまま指定し、
`secure: true` / `path: '/'` / `domain` 無指定が要件）:

```
Network.setCookie({
  name: "__Host-session",
  value: "seed389-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb",
  url: "http://localhost:<port>/",
  path: "/",
  secure: true,
  sameSite: "Lax"
})
```

設定後に `http://localhost:<port>/` を開けばログイン済み状態になる
（`<port>` は実際に起動した dev/preview サーバーのポート。#387 では 3100 を使用）。

## 検証で使う想定 URL

- `/` … リスト表示（既定）。
- `/?display=list` … リスト表示を明示。
- `/?display=tile` … タイル表示。

両表示で確認するポイント（Issue #389 本体）:
- 罫線が二重に表示されていないこと。
- サムネイル（画像枠）が廃止されていること。
- 更新日時が重複表示されていないこと。
- リスト表示とタイル表示で情報量（タイトル / 抜粋 / タグ / 公開状態チップ / 更新日時）が統一されていること。
- 公開状態チップが public / unlisted / private で色分けされること（#1,#4 / #2,#6 / #3,#5,#7）。
- タグ無し（#4）・本文空（#5、抜粋なし）の行でレイアウトが崩れないこと。
- 長いタグ名（#2,#3）がタイル表示で適切に折り返されること。

## 問題と対処

- `db:execute:local` のヒアドキュメント直渡し（`/dev/stdin`）は wrangler が SQL を壊すため、
  検証クエリは一時ファイル経由 + `--json` で実行した。本シード適用自体は
  `pnpm db:execute:local .issue/389/manual-test/seed.sql`（ファイル）で正常完了。
- D1 ローカルの SQLite は compound SELECT（`UNION ALL`）の項数上限が低いため、
  件数検証は個別 SELECT に分割して実行した。
- 既存データ（22 ユーザー / 36 ノート）は破壊していない。操作対象は test-389 系
  （`test-389@example.com` / `test389`、固定 UUID）のみ。冪等 DELETE 対象も
  本シードの固定ユーザー id のみ。
