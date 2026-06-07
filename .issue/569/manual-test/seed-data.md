# Seed Data — Issue #569 manual-test

## 認証
- cookie 名: `__Host-session`、値: `dev-admin-session-token`、path `/`、Secure 必須
- 注入: `agent-browser --session <s> cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:3002 --path / --secure --sameSite Lax`
- ユーザー: dev-admin (USER_ID 01950000-0000-7000-8000-000000000001)

## タグ（id prefix 01950569-）
| タグ名 | createdAt | active ノート数 | 最終使用(MAX updatedAt) |
|---|---|---|---|
| research | 2026-05-10 | 5 | 2026-06-05 |
| reading  | 2026-05-15 | 3 | 2026-06-01 |
| react    | 2026-05-20 | 1 | 2026-05-20 |
| 日記     | 2026-05-25 | 2 | 2026-05-28 |
| essay    | 2026-06-01 | 1 | 2026-05-22 |
| unused-tag | 2026-06-03 | 0 | NULL（未使用） |

## 検証ポイント
- 検索 "re" → react/reading/research の3件のみ
- ノート数ソート: 5/3/2/1/1/0
- 未使用タグ unused-tag: noteCount=0, lastUsedAt=NULL
- trashed 除外: essay は active 1件 + trashed 1件(06-06) → noteCount=1, lastUsed=2026-05-22（trashed除外）
