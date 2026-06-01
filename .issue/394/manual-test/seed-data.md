# Issue #394 ブラウザ検証用シードデータ

保存ビューの「適用」導線 / 一覧UI の検証に必要な、ログイン済み状態 + 保存ビュー5件 +
それぞれの適用結果が空にならないノート群を local D1 に直接投入した記録。
手法は #392 の seed-data.md に倣う（DB 直接投入 + `__Host-session` cookie）。

owner はすべて新規ユーザー **test-394**（id `019e816a-1193-7e8f-b1a1-861f4f768faa`）。
他ユーザー（test-392 等）には一切触れない。

## 適用手順

```bash
pnpm db:migrate                                  # ローカル D1 スキーマ適用（未適用なら）
pnpm db:execute:local .issue/394/manual-test/seed.sql
```

冪等。2回連続実行してエラーなしを確認済み。

### 冪等性の注意（wrangler local D1 は ON DELETE CASCADE を強制しない）

local D1 では PRAGMA foreign_keys が無効で、かつ一部 FK は SQL マイグレーション側でのみ
宣言されているため、`DELETE FROM users` では子行がカスケード削除されない。さらに FK は
RESTRICT 違反を `SQLITE_CONSTRAINT_TRIGGER` として報告する。そのため seed では子テーブルを
明示的に削除する。特に:

- `notes.directory_id → directories` は ON DELETE RESTRICT。ノートをディレクトリより先に削除する。
- `directories.parent_id`（自己参照）も RESTRICT。子（depth >= 1）を root（depth 0）より先に削除する。

## 投入したシードデータ（owner: test-394）

### users（1件）

| id | email | username | status |
|----|-------|----------|--------|
| `019e816a-1193-7e8f-b1a1-861f4f768faa` | `test-394@example.com` | `test394` | active |

### sessions（1件）

| token（= cookie 値） | expires_at |
|----|----|
| `seed394-tEsTsEsSiOnToKeN-cccccccccccccccccccccccc` | `2030-01-01T00:00:00.000Z` |

### directories（3件、ルート含む）

| name | id | parent | depth |
|------|----|--------|-------|
| (root, 空) | `019e816a-1195-7a16-924b-364a81d56d43` | NULL | 0 |
| Journal | `019e816a-1195-78c5-b3c5-e942fb936d39` | root | 1 |
| Essays | `019e816a-1195-74a5-8d39-e2083faf54fa` | root | 1 |

### tags（1件）

| name | id |
|------|----|
| essay | `019e816a-1195-78db-9438-f3455aa10df7` |

### notes（4件、全 active）

| title | directory | visibility | tag |
|-------|-----------|------------|-----|
| NoteDraft | root | private（pub行なし） | - |
| NoteJournal | Journal | private（pub行なし） | - |
| NoteEssay | Essays | **public**（pub行あり） | essay |
| NotePlain | root | private（pub行なし） | - |

各ノートの `front_matter_json` に `date`（2026-06-01〜04）を入れてあり、カレンダー表示が
frontMatterDate でバケットできる。publication_states 行は NoteEssay のみ（visibility=public）。
他の3件は行なしで、ノート一覧は「非 private 行が存在しない」を private 扱いする。

### saved_views（5件、owner=test-394）

JSON 形状はマッパー（`app/core/adapters/d1/repositories/savedViewRepository.ts`）に準拠:

- `query_json`: `{ directoryId, tagIds[], dateRange|null, keyword|null, referencingNoteId, visibilityFilter[] }`
- `sort_json`: `{ by, direction }`（by ∈ updatedAt|createdAt|title、direction ∈ asc|desc）
- `broken_conditions_json`: `[ { kind, id, lastSeenAt } ]`（kind ∈ tag|directory|note）
- `visibilityFilter` の値 ∈ private|unlisted|public

| # | name | kind | display_mode | is_default | query 要点 | broken |
|---|------|------|--------------|-----------|------------|--------|
| a | 未公開の下書き | personal | list | **1** | visibilityFilter=["private"] | なし |
| b | 日記ビュー | personal | calendar (frontMatterDate) | 0 | directoryId=Journal | なし |
| c | エッセイ | personal | tile | 0 | tagIds=[essay] | なし |
| d | エッセイ（公開） | public | tile | 0 | visibilityFilter=["public"] | なし |
| e | 壊れたビュー | personal | list | 0 | directoryId=存在しないid `019e816a-0000-7000-8000-000000000000` | **1件**（kind=directory） |

## ログイン手段

セッション cookie を CDP `Network.setCookie`（agent-browser `cookies set`）で直接投入:

- cookie 名: `__Host-session`
- cookie 値: `seed394-tEsTsEsSiOnToKeN-cccccccccccccccccccccccc`
- url: `http://localhost:5175/`（dev サーバーの実ポートに合わせる。`pnpm dev` が動的に選ぶ場合はその URL を使う）
- path: `/` / secure: true / sameSite: Lax

`__Host-` プレフィックスは Secure 必須だが、ブラウザは localhost を secure context 扱いするため http でも受理される。

## 各ビューを「適用」したときの期待ノート絞り込み結果

| ビュー | query | 出るべきノート | 件数 |
|--------|-------|----------------|------|
| (a) 未公開の下書き | visibility=private | NoteDraft, NoteJournal, NotePlain | 3 |
| (b) 日記ビュー | directory=Journal | NoteJournal | 1 |
| (c) エッセイ | tag=essay | NoteEssay | 1 |
| (d) エッセイ（公開） | visibility=public | NoteEssay | 1 |
| (e) 壊れたビュー | directory=存在しないid | （なし） | 0 |

- (a) は public な NoteEssay 以外の3件（private 扱い）が出る。
- (e) は壊れた条件マーカー（kind=directory）が表示され、適用しても 0 件になることを確認する。
- public ビュー (d) は公開済みの NoteEssay のみが対象。

## 既存データへの影響

既存ユーザーは破壊していない。冪等 DELETE の対象は test-394 の固定 id のみ。
test-392 等の他ユーザー行は変更なし。
