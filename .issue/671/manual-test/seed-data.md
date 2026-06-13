# Issue #671 シードデータ — P32 公開検索フィルターUI検証

投入日: 2026-06-13
対象: ローカル D1（`hollow-local-d1 --local`）のみ。staging/production には未投入。

## 実行した準備作業

1. `pnpm db:migrate` — 適用待ちマイグレーションなし（`✅ No migrations to apply!`）。
2. 既存シード手段・過去のP32 manual-test（#617 / #618 / #642）を調査。
   `#642/.manual-test/gen-seed.mjs` が同じ P32 検索画面用で、`search_documents` への
   明示 INSERT パターンを採用していたため再利用。`scripts/seed-public-user.mjs` の
   ユーザー＋公開ノート構成も参考にした。
3. 検索インデックス反映方法を実コードで確認（下記）。
4. `#642` シードは古い日付（2024-04）で期間フィルターが全件「1年より前」に
   なるため、#671（期間フィルターUI）用に**期間スプレッドを持つ専用シード**を新規作成。
5. シード生成: `.issue/671/manual-test/gen-seed.mjs` → `seed.sql`。
   投入: `pnpm db:execute:local .issue/671/manual-test/seed.sql`（冪等）。
6. `pnpm db:execute:local` で件数・FTS ヒット・ファセット・期間バンドを検証。

## search_documents への反映方法（実コードで確認）

- スキーマ: `app/core/adapters/d1/migrations/0001_hollow_schema.sql`
  - ホストテーブル `search_documents`（note_id / owner_id / visibility / title /
    body_plain / tag_names_json / directory_path / date_for_calendar / updated_at /
    indexed_at）。
- FTS5: `app/core/adapters/d1/migrations/0008_search_documents_fts_trigram.sql`
  - 外部コンテンツ FTS5 仮想表 `search_documents_fts`（tokenizer=`trigram`）。
  - **`search_documents` への INSERT は AFTER INSERT トリガー `search_documents_ai`
    で FTS5 へ自動同期される**。よってシードは `search_documents` に明示 INSERT
    するだけでよく、FTS への手動 INSERT は不要。
- 公開検索の経路: `app/core/application/search/searchPublicNotes.ts` →
  `app/core/adapters/d1/searchIndex.ts`。
  - 期間フィルターは `dateBasis='published_at'`、すなわち
    `publication_states.published_at` に対して評価される（`date_for_calendar`
    ではない）。`now` はサーバー実時計（≒今日 2026-06-13）。
  - 短い CJK キーワード（trigram の 3 codepoint 未満）は adapter 内の LIKE
    フォールバックで処理される。

### 確認結果

- `search_documents`（#671分）: 10 行投入。
- FTS5 MATCH `hollow671`: **10 件ヒット**（トリガー同期が効いていることを確認）。
- FTS5 MATCH `p671unique`: 1 件。
- `蜻蛉`（2 codepoint）: FTS5 MATCH では 0 件だが、`title/body_plain LIKE '%蜻蛉%'`
  で 1 件 → adapter の LIKE フォールバック経路でヒットする。

## 投入したシードデータ

固定 ID prefix `01967100-*`。冪等（再投入で重複・失敗しない）。既存データ
（seeduser / searchtest618 / dev-admin の既存ノート等）は一切変更していない。

| テーブル | レコード数（#671分） |
| --- | --- |
| users（新規） | 2（p671-alice / p671-bob） |
| directories（新規） | 2（新規ユーザーのルート。dev-admin は既存ルートを再利用） |
| tags | 3 |
| notes（public / active） | 10 |
| publication_states（public） | 10 |
| search_documents（public） | 10 |
| note_tags | 各ノートのタグ付与分 |

### ユーザー（著者）

| username | id | 公開ノート数 |
| --- | --- | --- |
| `p671-alice` | `01967100-0000-7000-8000-0000000000a1` | 4 |
| `p671-bob` | `01967100-0000-7000-8000-0000000000b1` | 3 |
| `dev-admin`（既存・再利用） | `01950000-0000-7000-8000-000000000001` | 3 |

3 著者 = @ユーザーチップ／著者ファセットの検証に十分。すべて active
（email_verified=1 / banned=0 / deleted_at=NULL）でログイン不要。

### タグ

| タグ | 付与ノート数 |
| --- | --- |
| `p671-tech` | 4 |
| `p671-diary` | 4 |
| `p671-design` | 5 |

### 公開ノート（10件、published_at 降順）

| seq | タイトル | 著者 | published_at | タグ |
| --- | --- | --- | --- | --- |
| 01 | 今日のノート hollow671 | p671-alice | 2026-06-12 | p671-tech |
| 02 | 数日前のノート hollow671 | p671-bob | 2026-06-09 | p671-diary |
| 03 | 1週間以内のノート hollow671 | dev-admin | 2026-06-07 | p671-design |
| 04 | 3週間前のノート hollow671 | p671-alice | 2026-05-22 | p671-tech / p671-design |
| 05 | 4週間前のノート 蜻蛉 hollow671 | p671-bob | 2026-05-16 | p671-diary |
| 06 | 3ヶ月前のノート hollow671 | dev-admin | 2026-03-12 | p671-design |
| 07 | 半年前のノート p671unique hollow671 | p671-alice | 2025-12-12 | p671-tech |
| 08 | 10ヶ月前のノート hollow671 | p671-bob | 2025-08-12 | p671-diary / p671-design |
| 09 | 去年より前のノート hollow671 | dev-admin | 2025-01-12 | p671-design |
| 10 | 2年前のノート hollow671 | p671-alice | 2024-06-01 | p671-tech / p671-diary |

全ノートのタイトル・本文に共通キーワード `hollow671` を含む。

## テストで使う検索キーワード・ユーザー・タグ

- **共通キーワード（全件ヒット）: `hollow671`**
  - `/search?q=hollow671` → 10 件（3 著者・3 タグにまたがる）。
- 1件のみヒット: `p671unique`（ノート07）。
- CJK（LIKE フォールバック確認用）: `蜻蛉`（ノート05、1件）。
- 0件（空状態確認）: `zzz999nohit`（シードなし）。
- @ユーザー（チップ確認）: `p671-alice` / `p671-bob` / `dev-admin`。
  - 例: `/search?q=hollow671&user=p671-alice`。
- タグ（チップ確認）: `p671-tech` / `p671-diary` / `p671-design`。
  - 例: `/search?q=hollow671&tags=p671-tech`。
- 複数チップ（横スクロール／レイアウト確認）:
  `/search?q=hollow671&period=30d&tags=p671-tech&user=p671-alice`。

### 期間フィルターの想定件数（published_at 基準・今日 ≒ 2026-06-13）

| period | 件数（実測） |
| --- | --- |
| 7d（過去7日） | 3 |
| 30d（過去30日） | 5 |
| 1y（過去1年） | 8 |
| all（すべて） | 10 |

各バンドで件数が変わるため、期間ラジオの切替・チップ・バッジ・URL 反映
（`period=7d/30d/1y` が載る／`all` で消える）を観察しやすい。

## 問題と対処

- **`directories.owner_id` のルート一意制約**（`uniq_directories_owner_root`、
  parent_id IS NULL は owner ごと1件）に最初の投入で抵触。dev-admin は既に
  ルート dir を持つため、dev-admin 用 dir は新規作成せず**既存ルート
  `019e9546-cb23-73c9-849c-120384e56377` を再利用**するようシードを修正して解決。
- スキーマに `username_normalized` 列は存在しない（#642 の gen-seed は参照して
  いたが、本シードでは使用していない）。

## 再投入手順

```bash
node .issue/671/manual-test/gen-seed.mjs > .issue/671/manual-test/seed.sql
pnpm db:execute:local .issue/671/manual-test/seed.sql
```

冪等なので何度実行しても重複しない。
