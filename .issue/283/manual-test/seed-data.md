# シードデータ — Issue #283

**作成日:** 2026-05-29

Issue #298 の manual-test seed（`seed-283.sql`、`INSERT OR IGNORE` で冪等）を再利用。ローカル D1 に既に投入済みであることを確認した。

## 投入コマンド（未投入の場合）

```bash
pnpm db:execute:local .issue/283/manual-test/seed-283.sql
```

## テストアカウント

| 項目 | 値 |
|---|---|
| email | `test-298@example.com` |
| password | `TestPass298!` |
| role | member |

## 検証対象ノート

| 項目 | 値 |
|---|---|
| note id | `019e7368-a581-743f-b10f-fc366c8e1f9e` |
| title | Issue 298 — パネル背景の見た目確認 |
| visibility | private |
| 詳細 URL | `http://localhost:5273/notes/019e7368-a581-743f-b10f-fc366c8e1f9e` |

`UrlCopyButton` はノート詳細ページの `NoteActions` 内に表示される。visibility=private のため、コピー対象は内部 URL `/notes/<id>`。

## サーバー

- URL: `http://localhost:5273`（`pnpm dev --port 5273`、検証後に停止）
