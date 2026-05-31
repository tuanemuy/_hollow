# Manual Test Result — Issue #305

## サマリー
- 実行日時: 2026-05-31
- 対象: アカウント削除フロー（AccountDeleteForm の `router.invalidate` → `router.clearCache` 化）
- 検証環境: `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`（http://localhost:54321、vite dev = ライブソース配信）
- テストアカウント: bob@example.com / password123（ユーザー名 bob、使い捨て・再 seed で復元可）
- テストケース数: 1
- PASS: 1 / FAIL: 0

## テストケース: アカウント削除 → ホーム遷移

| 手順 | 結果 |
|------|------|
| 1. /login で bob@example.com / password123 ログイン | PASS（認証後画面へ遷移） |
| 2. /settings の「アカウント削除」セクション表示 | PASS |
| 3. 「続けて削除する」→ ダイアログに `bob` 入力 → 「アカウントを完全に削除する」 | PASS |
| 4. 削除後 `/`（ホーム）へ遷移 | PASS（最終 URL = http://localhost:54321/） |
| 5. 遷移後ログアウト状態 | PASS（ヘッダーに「ログイン」「新規登録」表示、認証済みナビ消失） |

### 観察事項
- 最終 URL: `http://localhost:54321/`（search パラメータ付きホーム）
- チラつき: なし（削除実行後ダイアログが閉じ一度で遷移、認証済みレイアウトの残留なし）
- 無限リダイレクト: なし（`/` で安定停止）
- エラー画面: なし
- コンソールエラー: 削除フロー起因なし（favicon 404 のみ、本機能と無関係）
- 補足: 削除後に bob で再ログインを試みると失敗 → アカウントが DB レベルで削除済みであることの傍証

### スクリーンショット
- `screenshots/01-login.png`
- `screenshots/02-settings.png`
- `screenshots/03-after-delete.png`

## 総合判定: PASS

`router.clearCache({ filter: (match) => match.routeId === "/_app" })` 化後も削除フローの happy path が正しく動作し、削除直後の race（過去 cached userDto によるチラつき・誤レンダリング）は観察されなかった。
