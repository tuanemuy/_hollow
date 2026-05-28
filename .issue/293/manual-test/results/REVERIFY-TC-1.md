# REVERIFY-TC-1: ログイン → `/` → `/notes/{noteId}/` 遷移

- 実行日: 2026-05-29
- セッション: `reverify-tc-1`
- 対象: PR #297 loader-redirect 統合リファクタ (`app/routes/_app/route.tsx` の `loadAppShell` 化)

## 結果: PASS

## 手順と観察

| Step | 操作 | 期待 | 実測 | スクリーンショット |
|------|------|------|------|--------------------|
| 1 | `/login` を開く | ログインフォーム表示 | OK (banner + form) | `step-01-login-page.png` |
| 2 | email/password 入力 | 入力反映 | OK | `step-02-login-filled.png` |
| 3 | 「ログイン」クリック | `/` (`?page=1&limit=20`) にリダイレクト + AppShell 表示 | OK: URL = `http://localhost:3000/?page=1&limit=20`、Header (Hollow / 検索 / 新規作成 / アップロード / user menu) と Sidebar (ライブラリ / ディレクトリツリー / 管理) が描画 | `step-03-home-after-login.png` |
| 4 | ノート 1 件 (Foo配下の検証用ノート 1) をクリック | `/notes/{noteId}/` に SPA 遷移、AppShell 維持 | OK: URL = `http://localhost:3000/notes/01938f02-0000-7000-8000-000000000101`、banner + complementary (Sidebar) + main (note article) が描画。エラー画面なし。 | `step-04-note-detail.png` |
| 5 | ブラウザバック | `/` に戻る、AppShell 維持 | OK: URL = `http://localhost:3000/?page=1&limit=20`、Header + Sidebar 健在 | `step-05-back-to-home.png` |

## loader-redirect 観察ポイント

- 認証済み SPA 遷移 (`/` → `/notes/{id}`) で AppShell (Header / Sidebar) が再マウントされない: snapshot で取得した accessibility tree の `banner` / `complementary` ノードが両ページで同一構造のまま維持されている。
- バック遷移でもエラーやチラつきは観測されず。
- `_app.loader` の `staleTime: Infinity` (本番) / `0` (DEV) 設定下で、`loadAppShell` の再評価が遷移時に走らないことを目視確認。レンダリングがスムーズ。

## スクリーンショット数

5 枚 (`step-01` ～ `step-05`)
