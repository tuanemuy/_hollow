# Issue #540 ブラウザ検証用シードデータ

ローカル D1（miniflare、`pnpm dev` が読む DB）に投入した決定論的テストデータの記録。

## 実行した準備作業

1. `CLAUDE.md` / `scripts/seed-dev-admin.mjs` / `.issue/540/testing.md` を確認。
2. 対象テーブルのスキーマを sqlite3 で確認（`users` / `accounts` / `sessions` / `notes` / `directories` / `tags` / `note_tags` / `publication_states` / `note_internal_links` / `saved_views`）。
3. 既存行サンプルを確認し JSON 形状を特定:
   - `saved_views.query_json`: `{directoryId, tagIds, dateRange, keyword, referencingNoteId, visibilityFilter}`
   - `saved_views.sort_json`: `{by, direction}`
   - `saved_views.broken_conditions_json`: `[{kind, id, lastSeenName, lastSeenAt}]`（`savedViewRepository.ts` の encode/decode に厳密一致）
   - `dateRange` は `{from, to}` の ISO8601 文字列 or `null`。
4. UUIDv7 バリデータ確認（`app/core/application/ports/idGenerator.ts`）: `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`。採用した固定 id（version nibble `7` / variant nibble `8`）はすべて通過。
5. セッション cookie 名を確認（`app/core/presentation/authMiddleware.ts`）: **`__Host-session`**（raw token をそのまま値に入れる。`D1SessionService` は raw 比較）。
6. シードスクリプト `seed.mjs` を作成（`seed-dev-admin.mjs` の手法に倣う）。レンダリング後の SQL を `seed.sql` に保存し、`pnpm db:execute:local` で投入。
7. 件数検証＋再実行で冪等性を確認。

## 再実行方法

```
node .issue/540/manual-test/seed.mjs
```

冪等。mt540-* の全行を子テーブルから順に削除→再投入する。既存の本番相当データには触れない。

## 投入したシードデータ（テーブル別レコード数）

| テーブル | 件数 | 備考 |
| --- | --- | --- |
| users | 1 | mt540-user（member, active） |
| sessions | 1 | token=mt540-session-token, expires_at=2999 |
| directories | 4 | ルート + 階層3（Research / Research>論文メモ / プロジェクト） |
| tags | 5 | research / paper / ai / draft / design |
| notes | 7 | 複数ディレクトリに分散・タグ付き |
| note_tags | 10 | 複数タグのノートあり |
| publication_states | 7 | private 3 / public 2 / unlisted 2（混在） |
| note_internal_links | 1 | NOTE_A → NOTE_B（解決済み） |
| saved_views | 4 | personal。うち1件 broken |

## ログイン情報（ブラウザ検証用）

- ユーザー: `mt540-user` / `mt540@example.com`（role=member, active）
- セッション cookie 名: **`__Host-session`**
- cookie 値（= raw token）: **`mt540-session-token`**

`__Host-` 接頭辞のため Secure 属性必須・`document.cookie` では設定不可。CDP 経由で注入する:

```
agent-browser cookies set "__Host-session" "mt540-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

注入後 `http://localhost:<port>/` を開くと mt540-user としてログイン済みになる。

## ディレクトリ階層

```
(root, id ...010)
├── Research (slug=research, depth=1, id ...011)
│   └── 論文メモ (slug=papers, depth=2, id ...012)
└── プロジェクト (slug=projects, depth=1, id ...013)
```

## ノート一覧

| ノート | id 末尾 | ディレクトリ | タグ | visibility |
| --- | --- | --- | --- | --- |
| Transformer Survey | ...030 | 論文メモ | research, paper, ai | public |
| Attention Is All You Need | ...031 | 論文メモ | paper, ai | unlisted |
| Research Index | ...032 | Research | research | private |
| Project Roadmap | ...033 | プロジェクト | draft | private |
| Design Spec | ...034 | プロジェクト | design, draft | unlisted |
| Scratchpad | ...035 | root | （なし） | private |
| Public Announcement | ...036 | root | research | public |

## バックリンク関係

- **Transformer Survey (...030)** が **Attention Is All You Need (...031)** を参照（`note_internal_links`: ref_kind=`title`, ref_target=`Attention Is All You Need`, resolved_note_id=...031）。
- → **Attention Is All You Need の詳細画面（P11）でバックリンクとして Transformer Survey が出る**はず。

## 保存ビュー（P20 chip 検証）

| ビュー名 | id 末尾 | 条件 | 期待 chip |
| --- | --- | --- | --- |
| AI論文 | ...050 | tagIds=[ai, paper], display=list, sort=updatedAt desc | タグ `#ai` `#paper` + 表示モード |
| 公開ノート | ...051 | visibilityFilter=[public, unlisted], display=tile | 公開状態（公開 / 限定公開）+ 表示モード |
| 最近の更新 | ...052 | dateRange=2026-05-08〜2026-06-07, display=list | 期間 chip（「過去30日」プリセット一致は描画時の現在日基準なのでベストエフォート）+ 表示モード |
| プロジェクト(壊れ) | ...053 | directoryId=プロジェクト, tagIds=[ghost], sort=title asc, broken_conditions=[{tag, ghost}] | ディレクトリ + ソート chip + **broken chip + 警告バナー**（削除済みタグ参照） |

broken ビューは `broken_conditions_json` に存在しないタグ id（`...0ff`, lastSeenName=`deleted-tag`）を入れてあり、P20 の broken chip / バナー / 修復ボタンを検証できる。

## 問題と対処

- `db:execute:local` での検証クエリは UNION の項数上限（compound SELECT too many terms）に当たるため、検証は文を分割して実行した。シード本体には影響なし。
- 公開状態が public/unlisted のノートには `published_at` を設定済み（public は `published_at` 必須、`publicationStateRepository` の整合条件に合わせた）。
