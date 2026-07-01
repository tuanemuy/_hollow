# テスト実行サマリー — Issue #737

**実行日時**: 2026-06-30
**テストソース**: .issue/737/testing.md
**サーバー**: http://localhost:3000（vite dev）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | same-origin 取り込み POST が成功する | 正常系 | PASS | - |
| TC-002 | GET 系は CSRF の影響を受けない | 正常系 | PASS | - |
| EDGE-001 | cross-origin 取り込み POST が 403 で拒否される | 異常系 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 検証セットアップの要点

CSRF は `Origin`/`Referer` を `config.appUrl`（dev では `APP_URL` env）と照合する。vite dev のポート（3000）と wrangler.toml の `APP_URL`（8787）の差を利用して 2 状態を作り分けて検証した:

- **状態A（`APP_URL`=8787, デフォルト）**: ブラウザ Origin=3000 ≠ appUrl=8787 → cross-origin。POST は 403 で拒否（EDGE-001 / TC-002 を検証）。
- **状態B（`.dev.vars` に `APP_URL`=3000）**: Origin=3000 = appUrl=3000 → same-origin。POST 成功（TC-001 を検証）。検証後 `.dev.vars` は元に戻した。

## 観察結果

- **TC-001**: same-origin で `csrf-test-note.md` をアップロード → ジョブ作成され「プレビュー可能」まで到達。403 表示なし。`uploadFileFn` が csrfMiddleware を通過。
- **TC-002**: cross-origin 状態でも `/upload` の GET 系（キュー件数・ジョブ一覧・ディレクトリツリー等）は正常表示。GET は `SAFE_METHODS` でスキップされる。
- **EDGE-001**: cross-origin で同じアップロードを実行 → `role=alert` 「権限がありません」（ForbiddenError=403）。ジョブ一覧・件数バッジは不変＝ハンドラ実行前に拒否。csrfMiddleware が `uploadFileFn` で機能。
