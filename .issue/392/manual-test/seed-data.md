# Issue #392 ブラウザ検証用シードデータ

サブツリー一致（親ディレクトリ選択時に子孫ノートも表示される）の検証に必要な
ログイン済み状態 + ディレクトリ階層 + ノートを local D1 に直接投入した記録。
手法は #387 の seed-data.md に倣う（DB 直接投入 + `__Host-session` cookie）。

## 適用手順

```bash
pnpm db:migrate                                  # ローカル D1 スキーマ適用
pnpm db:execute:local .issue/392/manual-test/seed.sql
```

冪等。先頭で `test-392` ユーザーを DELETE → cascade で sessions/directories/notes も消える → 再 INSERT。

## 投入したシードデータ（owner: test-392）

### users（1 件）

| id | email | username | status |
|----|-------|----------|--------|
| `019e7ee2-040c-720c-8eb8-9bb8be0b4f8d` | `test-392@example.com` | `test392` | active |

### sessions（1 件）

| token（= cookie 値） | expires_at |
|----|----|
| `seed392-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb` | `2030-01-01T00:00:00.000Z` |

### directories（5 件、ルート含む）— サブツリー検証用の3階層 + 兄弟

| name | id | parent | depth |
|------|----|--------|-------|
| (root, 空) | `019e7ee2-040d-7188-af2f-f77cbca422ff` | NULL | 0 |
| Parent | `019e7ee2-040d-7188-af2f-fb3cc1366f1c` | root | 1 |
| Child | `019e7ee2-040d-7188-af2f-fe082db90054` | Parent | 2 |
| Grandchild | `019e7ee2-040d-7188-af30-0396adf538af` | Child | 3 |
| Sibling | `019e7ee2-040d-7188-af30-0569d8cfcdf1` | root | 1 |

### notes（4 件、全 active）— 各ディレクトリ直下に1件

| title | directory |
|-------|-----------|
| NoteParent | Parent |
| NoteChild | Child |
| NoteGrandchild | Grandchild |
| NoteSibling | Sibling |

## ログイン手段

セッション cookie を CDP `Network.setCookie`（agent-browser `cookies set`）で直接投入:

- cookie 名: `__Host-session`
- cookie 値: `seed392-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb`
- url: `http://localhost:3100/` / path: `/` / secure: true / sameSite: Lax

`__Host-` プレフィックスは Secure 必須だが、ブラウザは localhost を secure context 扱いするため http でも受理される。

## 期待マッピング（サブツリー一致）

| 選択ディレクトリ | 表示されるべきノート | 件数 |
|------------------|----------------------|------|
| Parent | NoteParent, NoteChild, NoteGrandchild | 3 |
| Child | NoteChild, NoteGrandchild | 2 |
| Grandchild | NoteGrandchild | 1 |
| Sibling | NoteSibling | 1 |
| 未選択（全件） | NoteParent, NoteChild, NoteGrandchild, NoteSibling | 4 |

修正前（#387・直下のみ）は Parent 選択で NoteParent の1件のみだった。本 Issue で子孫含む3件になる。

## 既存データへの影響

既存ユーザーは破壊していない。テスト用は `test-392@example.com` / `test392` と判別可能な値のみ。冪等 DELETE 対象は seed の固定ユーザー id のみ。
