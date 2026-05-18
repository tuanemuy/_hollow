# Issue #29 — manual-test 用シードデータ

Issue #29（search 経路 (`searchOwnNotes`) への `visibility` 入力伝達 + projection 実値化）の
ブラウザ動作確認用に、ローカル D1 に投入したテストデータをまとめる。

---

## ソース

Issue #8 (`.issue/8/manual-test/seed.sql`) のシードを **そのまま流用** している。
Issue #29 は Issue #8 の search 経路フォロー（同じ `?visibility=...` を `?q=` 経路でも有効化）
が主眼で、ノート/タグ/visibility 分布の要求は Issue #8 と同一のため、新規 seed を作る必要が
無かった。`.issue/29/.manual-test/seed.sql` は `.issue/8/manual-test/seed.sql` のコピー。

```bash
cp .issue/8/manual-test/seed.sql .issue/29/.manual-test/seed.sql
```

`note_internal_links` も含まれるが、Issue #29 の検証範囲では使わない（あっても害は無い）。

---

## テストアカウント

| 項目         | 値                                       |
|--------------|------------------------------------------|
| email        | `test-user-001@example.com`              |
| password     | `TestPassword123!`                       |
| username     | `test-user-001`                          |
| displayName  | `テストユーザー001`                       |
| user id      | `01938f00-0000-7000-8000-000000000001`   |
| role         | `member`                                 |
| status       | active (`email_verified=1`, `banned=0`, `deleted_at=NULL`) |

`accounts.password` は `D1CredentialStore.hashPassword` と同じ
PBKDF2-HMAC-SHA256 / 600,000 iter / 16B salt / 32B key で計算した
`pbkdf2-sha256-v1$600000$<salt-b64>$<hash-b64>` を直接書き込んでいる。

---

## 投入結果（件数）

| テーブル                | 件数 | 備考                                                         |
|-------------------------|------|--------------------------------------------------------------|
| `users`                 | 1    | テストユーザー本体                                           |
| `accounts`              | 1    | provider_id=`credential` の password 行                      |
| `directories`           | 6    | root(1) + Inbox / Projects / Archive(3) + Project A/B(2)     |
| `tags`                  | 7    | work, personal, project-a, ideas, todo, review, design       |
| `notes`                 | 10   | private 8 / unlisted 1 / public 1                            |
| `note_tags`             | 18   | ノート⇄タグ M:N                                              |
| `publication_states`    | 10   | 全ノートに対応行あり (private 8 / unlisted 1 / public 1)     |
| `search_documents`      | 10   | FTS5 トリガーで `search_documents_fts` も同期される          |
| `saved_views`           | 1    | personal kind の SavedView 「作業中のタスク」                |
| `note_internal_links`   | 4    | Issue #8 由来。Issue #29 では未使用だがそのまま残してある    |
| `instance_settings`     | 1    | singleton 行                                                 |

### visibility 分布（test-user-001 配下）

`publication_states` / `search_documents` ともに同一分布：

| visibility | 件数 |
|------------|------|
| private    | 8    |
| public     | 1    |
| unlisted   | 1    |

---

## ノート一覧（visibility / title / 検索キーワード）

| #   | id 末尾 | title                        | visibility | 本文中の主要キーワード（検索クエリ候補）                  |
|-----|---------|------------------------------|------------|-----------------------------------------------------------|
| N1  | …b071   | Weekly planning ノート       | private    | `planning` / `今週` / `レビュー` / `仕様策定` / `P10` / `P11` / `リファクタ` / `メタ情報` |
| N2  | …b072   | ブレインストーミング         | private    | `新機能` / `アイデア` / `カレンダー` / `frontMatter` / `モード`         |
| N3  | …b073   | Project A キックオフ         | private    | `Project A` / `キックオフ` / `スコープ` / `マイルストーン` / `リスク` / `進捗` |
| N4  | …b074   | Project A デザインメモ       | **unlisted** | `Project A` / `デザイン` / `スケッチ` / `Sidebar` / `ツリー` / `検索` / `MD` / `レンダリング` |
| N5  | …b075   | Project B レビュー記録       | private    | `Project B` / `Review` / `レビュー` / `仕様` / `修正点`               |
| N6  | …b076   | 5 月定例ミーティング         | private    | `定例` / `ミーティング` / `プロダクト方針` / `Q2` / `OKR` / `共有`     |
| N7  | …b077   | Reading list                 | private    | `Reading` / `読みたい` / `Domain` / `DDD` / `Design`                  |
| N8  | …b078   | Q1 ふりかえり                | private    | `Q1` / `ふりかえり` / `達成` / `課題` / `改善` / `来期`               |
| N9  | …b079   | 公開デザインガイド           | **public**   | `公開` / `デザイン` / `原則` / `シンプル` / `一貫性` / `フィードバック` |
| N10 | …b07a   | 今日のタスク                 | private    | `今日` / `タスク` / `テスト` / `データ` / `動作確認` / `レビュー`     |

> `search_documents.body_plain` には HTML タグ除去済みの本文が入っているため、
> 上記キーワードは FTS5 (`?q=`) 経路で素直にヒットする。

---

## Issue #29 manual-test で使う URL サンプル

ベース: `http://localhost:5173`（`pnpm dev` の URL）

### 1) 旧 (filter) 経路の回帰確認 — Issue #8 と同じ結果になること

| URL                              | 期待結果                            |
|----------------------------------|-------------------------------------|
| `/`                              | 全 10 件                            |
| `/?visibility=public`            | N9 のみ 1 件                        |
| `/?visibility=unlisted`          | N4 のみ 1 件                        |
| `/?visibility=private`           | N1, N2, N3, N5, N6, N7, N8, N10 の 8 件 |

### 2) 新 (search) 経路で `?visibility` が効くか — Issue #29 主眼

複数ノートにヒットする広いクエリと visibility を組み合わせる。

| URL                                                  | 期待結果                                                |
|------------------------------------------------------|---------------------------------------------------------|
| `/?q=レビュー`                                       | N1, N5, N8, N10 の 4 件（visibility 不問の現状確認用） |
| `/?q=レビュー&visibility=private`                    | N1, N5, N8, N10 の 4 件（全て private）                |
| `/?q=レビュー&visibility=public`                     | 0 件                                                    |
| `/?q=レビュー&visibility=unlisted`                   | 0 件                                                    |
| `/?q=デザイン`                                       | N4, N9 の 2 件                                          |
| `/?q=デザイン&visibility=public`                     | N9 のみ 1 件                                            |
| `/?q=デザイン&visibility=unlisted`                   | N4 のみ 1 件                                            |
| `/?q=デザイン&visibility=private`                    | 0 件                                                    |
| `/?q=Project`                                        | N3, N4, N5 の 3 件                                      |
| `/?q=Project&visibility=private`                     | N3, N5 の 2 件                                          |
| `/?q=Project&visibility=unlisted`                    | N4 のみ 1 件                                            |
| `/?q=タスク`                                         | N10 のみ 1 件（"今日のタスク"）                         |

### 3) `visibility` 投影の実値化確認（ADR-012 の残置プレースホルダ撤廃）

search 経路でカードに表示される visibility バッジが、
プレースホルダ `private` 固定ではなく **search_documents.visibility の実値** を反映すること。

| URL                          | 期待される visibility バッジ           |
|------------------------------|----------------------------------------|
| `/?q=デザイン`               | N4=unlisted, N9=public                 |
| `/?q=Project`                | N3=private, N4=unlisted, N5=private    |
| `/?q=レビュー`               | 全件 private バッジ                    |

> Issue #29 のスコープ外: バッジを `mode === "filter"` でガードしている
> `NoteList.showVisibilityBadge` (ADR-013) は本 Issue では撤廃しないため、
> search 経路でバッジが描画されない場合は `NoteList` 側の表示制御の問題で
> あって本 Issue の修正対象ではない。DOM レベルで `data-visibility` 属性等が
> 実値化されているかを開発者ツールで直接確認する手もある。

---

## 投入手順 / 再実行

`notes` の `ON DELETE CASCADE` により、テストユーザーを消すと
関連データ（`publication_states` / `search_documents` / `note_tags` /
`note_internal_links` / `saved_views` 等）も自動で消えるため冪等。

```bash
# 1) .dev.vars 準備（未作成なら）
cp .dev.vars.example .dev.vars

# 2) マイグレーション適用（初回のみ / 差分があれば毎回）
pnpm db:apply:local

# 3) シード投入（何度でも再実行可）
pnpm wrangler d1 execute tanstack-start-template-d1 --local --file=.issue/29/.manual-test/seed.sql

# 4) visibility 分布の確認
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT visibility, COUNT(*) FROM publication_states \
   WHERE owner_id = '01938f00-0000-7000-8000-000000000001' GROUP BY visibility;"

pnpm wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT visibility, COUNT(*) FROM search_documents \
   WHERE owner_id = '01938f00-0000-7000-8000-000000000001' GROUP BY visibility;"
```

シード SQL: [`./seed.sql`](./seed.sql)

---

## 既知の問題・補足

### 投入時のトラブルと対処（本セットアップで実際に発生）

- 初回 seed 実行時に
  `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)`
  でアボートし、`publication_states` が 9 件（N10=b07a が欠落）、
  `notes` / `search_documents` 等は完走していた。原因は seed.sql 自体ではなく、
  他テスト由来の **残骸ノート** (`019e3486-…` / `019e3492-…`) と
  **残骸 SavedView** (3 件) が同 `owner_id` に存在しており、`DELETE FROM users`
  → カスケード再投入の途中で FTS5 トリガーと衝突したと推測。
- 対処として:
  1. 残骸ノート 2 件を `DELETE FROM notes WHERE id IN (...)` で削除
  2. 不足していた `publication_states` の N10 行を単発 INSERT
  3. 残骸 SavedView 3 件を `DELETE FROM saved_views WHERE id IN (...)` で削除
- 最終的に上記「投入結果」表の通り、期待値ぴったりに整った。

### 完全クリーンな状態から再開したい場合

`.wrangler/state/v3/d1/` 配下の SQLite ファイルを丸ごと削除すれば次回
`pnpm db:apply:local` で完全な空 DB から再構築できる（本作業では権限制約で
未実施）。シード再投入のみで状態を整えたい場合は、上記「投入時のトラブルと対処」
と同じ手順で個別整理する。

### Issue #29 検証範囲外の補足

- `publication_states` 行を持たない private ノート（Issue #8 testing.md の項目 2）は
  本 seed では生成しない。検証したい場合は
  `DELETE FROM publication_states WHERE note_id='01938f00-0000-7000-8000-00000000b078';`
  で N8 を「private で行なし」にする。
- `note_internal_links` 4 件は Issue #8 由来で残しているが、Issue #29 では
  `?referencingNoteId=...` は検証対象外。
- パスワードハッシュは `D1CredentialStore.hashPassword` の現行パラメータ
  (PBKDF2-SHA256, 600k iter) に合わせている。パラメータ変更時は再ハッシュ要。
