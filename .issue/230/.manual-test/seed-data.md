# Issue #230 マニュアルテスト シードデータ

**作成日:** 2026-05-27
**対象 Issue:** #230 (Front Matter エディタ: 固定プロパティ前提 → 「あれば表示」モデル)
**Seed SQL:** `.issue/230/.manual-test/seed.sql`

## 前提

- 既存 Issue #1 のシード (`.issue/1/manual-test/seed.sql`) が投入済みであること。
- 利用ユーザー: `test-user-001@example.com` / `TestPassword123!` (id `01938f00-0000-7000-8000-000000000001`)
- 配置先ディレクトリ: `Inbox` (`01938f00-0000-7000-8000-0000000000d1`)
- すべて `publication_states.visibility = 'private'`
- 既存ユーザー・既存ノートは破壊せず加算。冪等のため `INSERT OR REPLACE`。
- `search_documents` は登録せず（このテストでは検索操作なし）

## 実行コマンド

```bash
# 既存ユーザー存在確認
pnpm wrangler d1 execute hollow-local-d1 --local \
  --command "SELECT id FROM users WHERE id = '01938f00-0000-7000-8000-000000000001'"

# Issue #230 シード投入
pnpm wrangler d1 execute hollow-local-d1 --local \
  --file .issue/230/.manual-test/seed.sql

# 検証
pnpm wrangler d1 execute hollow-local-d1 --local \
  --command "SELECT id, title, front_matter_json FROM notes \
             WHERE id LIKE '%2301' OR id LIKE '%2302' OR id LIKE '%2303' \
                OR id LIKE '%2304' OR id LIKE '%2305' ORDER BY id"
```

## 投入ノート一覧

| # | Note ID | slug | title | frontMatter (JSON) | 対応確認項目 |
|---|---------|------|-------|--------------------|--------------|
| 1 | `01938f00-0000-7000-8000-000000002301` | `issue-230-custom-keys` | Issue 230 - custom keys (mood/project) | `{"mood":"tired","project":"alpha"}` | 確認項目 1 (任意キーの後方互換) |
| 2 | `01938f00-0000-7000-8000-000000002302` | `issue-230-legacy-tags` | Issue 230 - legacy tags | `{"tags":["legacy","old"]}` | 確認項目 2 (legacy frontMatter.tags 残置)、エッジケース 4 (配列値の削除ボタン) |
| 3 | `01938f00-0000-7000-8000-000000002303` | `issue-230-rename-ordering` | Issue 230 - rename / ordering (a/b/c) | `{"a":"1","b":"2","c":"3"}` | 確認項目 6 (rename + 順序保持)、エッジケース 1 (rename 重複) |
| 4 | `01938f00-0000-7000-8000-000000002304` | `issue-230-mode-toggle-complex` | Issue 230 - mode toggle / complex values | `{"a":"1","arr":["x","y"],"nested":{"k":1}}` | 確認項目 7 (モードトグルと複雑値) |
| 5 | `01938f00-0000-7000-8000-000000002305` | `issue-230-detail-display` | Issue 230 - detail panel display | `{"mood":"tired","title":"T","tags":["legacy"]}` | 確認項目 8 (詳細画面 known/others 分割撤去) |

## 共通属性

- `owner_id`: `01938f00-0000-7000-8000-000000000001` (test-user-001)
- `directory_id`: `01938f00-0000-7000-8000-0000000000d1` (Inbox)
- `status`: `active`
- `version`: `0`
- `publication_states.visibility`: `private`
- `created_at` / `updated_at`: `2026-05-20T09:00..09:20Z` (5 分刻み)

## 確認項目と未カバー項目

シードでカバー: 1, 2, 6, 7, 8, エッジケース 1, 4

シード不要 (UI 操作のみで完結):

- 確認項目 3 (タグサジェスト) — 新規ノート作成 + キー追加操作で確認
- 確認項目 4 (ハッシュタグからのタグ反映) — 新規ノートで本文 `#design #review` を入力
- 確認項目 5 (新規キー追加) — 既存任意のノートで操作可
- エッジケース 2 (新規キー追加重複) — `frontMatter: {foo:"x"}` を持つノートが必要だが、ノート4 (`a`/`arr`/`nested`) の `a` を使えば同等確認可
- エッジケース 3 (不正 JSON) — どのノートでも raw モードに切り替えれば再現可

## 検証結果

- `notes` への INSERT OR REPLACE 成功 (5 件)
- `publication_states` への INSERT OR REPLACE 成功 (5 件)
- test-user-001 所有ノート総数: **15 件** (Issue #1 の 10 件 + Issue #230 の 5 件) — 既存ノートは破壊されていない
- frontMatter は SQL 取得時に文字列としても期待通りキー順序が保たれている (Drizzle/D1 は JSON 文字列を素直に保持)
