# ブラウザ検証レポート — Issue #737: 取り込み系 POST server function に CSRF 保護を追加

**実行日時**: 2026-06-30
**テストソース**: `.issue/737/testing.md`
**サーバー**: `http://localhost:3000`（`pnpm dev` / vite dev）
**結果**: 全 3 件 PASS（PASS: 3 / FAIL: 0）

## 概要

`app/components/ingestion/actions.ts` の POST server function 5 本に `csrfMiddleware` を追加した変更を、実ブラウザ（agent-browser）で検証した。`csrfMiddleware` は `Origin`/`Referer` を `config.appUrl` と照合するため、vite dev のポート（3000）と `APP_URL`（wrangler.toml 既定 8787）の差を使い、cross-origin 状態と same-origin 状態を作り分けて確認した。

## テスト結果

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | same-origin 取り込み POST が成功する | 正常系 | PASS |
| TC-002 | GET 系は CSRF の影響を受けない | 正常系 | PASS |
| EDGE-001 | cross-origin 取り込み POST が 403 で拒否される | 異常系 | PASS |

### TC-001（same-origin POST 成功）
`.dev.vars` に `APP_URL=http://localhost:3000` を設定（same-origin 一致）して再起動。`/upload` で `csrf-test-note.md` をアップロードすると、サイドバーの未処理バッジが「1」に変化し、キューに当該ジョブが追加され「プレビュー可能」まで到達。403 表示は一切なし。`uploadFileFn` が csrfMiddleware を通過して受理された。

### TC-002（GET 系は影響なし）
cross-origin 状態でも `/upload` ページが正常表示（ノート件数バッジ、ディレクトリツリー、ジョブ一覧 4 件）。GET 由来データがすべて描画され、リダイレクト・alert なし。`csrfMiddleware` は `SAFE_METHODS`（GET/HEAD/OPTIONS）をスキップするため GET 系は無影響。コード上も GET 4 本の middleware は `[errorResponseMiddleware]` のまま。

### EDGE-001（cross-origin POST 拒否）
デフォルト状態（`APP_URL`=8787 ≠ Origin 3000）で同じアップロードを実行すると、`role=alert` 「権限がありません」（ForbiddenError=403）が表示。アップロード前後でジョブ一覧（4 件）・件数バッジは不変で、ハンドラ実行前にミドルウェアが拒否したことを確認。`csrfMiddleware` が `uploadFileFn` で機能している。

## 備考

- 補強で試みた `eval` 直接 fetch は server function のエンドポイント URL が不確実で 500 を返したため参考扱い。主判定は UI 観察（alert 文言・ジョブ件数の増減）で確定した。
- 検証で一時的に変更した `.dev.vars`（`APP_URL` 追記）は検証後に元へ戻した（git diff なし）。
- 起票した Issue: なし（全 PASS）。
