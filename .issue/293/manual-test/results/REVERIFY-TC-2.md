# REVERIFY-TC-2: 連続遷移 `/tags` → `/trash` → `/notes/new`

- 実行日: 2026-05-29
- セッション: `reverify-tc-2`
- 対象: PR #297 loader-redirect 統合リファクタ

## 結果: PASS

## 手順と観察

| Step | 操作 | 期待 | 実測 | スクリーンショット |
|------|------|------|------|--------------------|
| 1 | `/login` でログイン → `/` 到達 | AppShell 描画 | OK | `step-01-home.png` |
| 2 | Sidebar の「タグ」をクリック | `/tags` に SPA 遷移、AppShell 維持 | OK: URL = `http://localhost:3000/tags`、`heading "タグ管理"`、banner + complementary 健在 | `step-02-tags.png` |
| 3 | Sidebar の「ゴミ箱」をクリック | `/trash?page=1&limit=20` に SPA 遷移、AppShell 維持 | OK: URL = `http://localhost:3000/trash?page=1&limit=20`、`heading "ゴミ箱"` + 「ゴミ箱は空です」、AppShell 健在 | `step-03-trash.png` |
| 4 | Header の「新規作成」をクリック | `/notes/new` に遷移、AppShell 維持 | OK: URL = `http://localhost:3000/notes/new`、`heading "新規ノート"`、banner + complementary + main 健在 | `step-04-notes-new.png` |

全遷移でエラーなし、エラー画面表示なし。

## loader-redirect 観察ポイント

- 連続 SPA 遷移 4 回 (`/` → `/tags` → `/trash` → `/notes/new`) の全てで AppShell (Header / Sidebar) のレイアウトが維持された。
- 各遷移で banner ノード (Hollow ロゴ + 検索 + 新規作成 + アップロード + user menu) の構成が変化なし。
- 各遷移で complementary ノード (ライブラリ / ディレクトリツリー / 管理) の構成が変化なし。
- 認証コンテキストの再評価による画面チラつきや空白フレームは観測されず。
- リファクタの狙い (SPA 遷移時の `_app.loader` 再評価ゼロ化 = AppShell 永続化) は機能している。

## スクリーンショット数

4 枚 (`step-01` ～ `step-04`)
