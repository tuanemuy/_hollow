# TC-1: /admin (AdminDashboard) が 200 で描画される

**結果**: PASS
**セッション**: verify-tc-1

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | ログインページを開く (`/auth/log-in`) | フォーム表示 | 404 / NotFound（手順書のパスは古い。`/login` が実パス） | NOTE |
| 2 | `/login` を開き直す | ログインフォーム表示 | メール `[ref=e5]` / パスワード `[ref=e7]` / ログインボタン `[ref=e9]` 取得 | PASS |
| 3 | admin@example.com / Password123! でログイン | 認証成功 | `/?page=1&limit=20` にリダイレクト（ログイン済み） | PASS |
| 4 | `/admin` を開く | 200 描画 / URL が `/admin` のまま | URL = `http://localhost:3000/admin`（リダイレクトなし） | PASS |
| 5 | `wait --load networkidle` | アイドル到達 | ✓ Done | PASS |
| 6 | snapshot で要素確認 | 見出し・カード・バナー描画 | 「ダッシュボード」見出し / 「Hollow インスタンス全体の状態」サブテキスト / メトリクスカード4種 / 「All systems operational」バナー全て確認 | PASS |
| 7 | screenshot 保存 | ファイル保存成功 | `.issue/59/manual-test/screenshots/tc-1/admin.png` に保存 | PASS |
| 8 | エラー検査 (`Cannot read properties` / `TypeError` / `500`) | 検出されない | `false`（いずれの文字列も本文に存在しない） | PASS |
| 9 | console ログ確認 | エラーなし | vite connect debug と React DevTools 案内のみ。エラー・警告なし | PASS |
| 10 | セッションクローズ | 成功 | ✓ Browser closed | PASS |

### snapshot 要点

- `heading "ダッシュボード" [level=1]` 表示
- `StaticText "Hollow インスタンス全体の状態"` 表示
- `region "主要メトリクス"` 内に4カード:
  - 「ユーザー数」 → 値 `—` / 「取得失敗」ラベル
  - 「ストレージ消費」 → 値 `—` / `R2 — · DO—`
  - 「当日アップロード」 → 値 `—` / 「取得失敗」ラベル
  - 「LLM 呼び出し (24h)」 → 値 `—` / 「取得失敗」ラベル
- 「All systems operational」/「重大アラートはありません」バナー表示
- 管理ナビゲーション（ダッシュボード/LLM 設定/プロンプト/デザイントークン/登録制御/ユーザー/利用状況/ジョブ監視）表示

## スクリーンショット

- `.issue/59/manual-test/screenshots/tc-1/admin.png`

## 失敗詳細

なし。

## 補足

- 手順書記載のログイン URL `/auth/log-in` は現状のルーティングと一致しない（404）。実装の `app/routes/login.tsx` に従い `/login` を使用した。テスト本体（`/admin` の正常描画）には影響なし。
