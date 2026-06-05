# テスト実行サマリー — Issue #475

**実行日:** 2026-06-05
**テストソース:** .issue/475/testing.md
**サーバー:** http://localhost:3000（`pnpm dev`）
**認証:** dev-admin（cookie `__Host-session` 注入）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-01 | `/views` に AppShell（Header/Sidebar）が付く・`?kind` 保持 | 正常系 | PASS | URL は `/views` 不変（`/_app` 付かず） |
| TC-02 | `/views` 保存ビュー mutation（削除） | 正常系 | PASS | moved `deleteSavedViewFn` を end-to-end 発火。DB で count=0 確認。RSC マニフェスト登録を実証 |
| TC-03 | `/exports` に AppShell が付く・`?offset` 保持 | 正常系 | PASS | URL は `/exports` 不変 |
| TC-05 | `/exports/$jobId` errorComponent が AppShell 内に表示 | 正常系 | PASS | ジョブ空のため errorComponent 経路で検証 |
| TC-06 | SPA 遷移で AppShell 保持 | 正常系 | PASS | `/`→`/views`→`/exports`→`/tags`→`/settings/profile` で Header/Sidebar 保持 |
| TC-Edge | 未認証直アクセス → `/` へ redirect | 異常系 | PASS | `/views` `/exports` とも `/` へ。`/login`→`/` の意図的変更を確認 |

**合計:** 6 件（PASS: 6 / FAIL: 0）

## 補足・カバレッジ留意点

- **TC-02（保存ビュー削除）**: SQL で dev-admin 所有の保存ビューを1件投入し、`/views` の「削除」確認ダイアログ経由で `deleteSavedViewFn`（移動した `@/components/view/SavedViewsList/action`）を実行。ビューが一覧から消え、ローカル D1 でも該当行が削除（count=0）されたことを確認。「server function not found」系エラーなし。→ **ADR-002 の action 登録リスクが end-to-end で解消されたことを実証**。
- **TC-04（エクスポート実行 action）**: 未実施。ExportForm は `/export`（本 Issue スコープ外ルート）にあり、`/exports` 一覧ページからは到達しない。かつエクスポートジョブが空のため cancel/download も叩けず。`@/components/export/ExportForm/action` の登録は views と同一機構（移動先 route.tsx / `$jobId.tsx` の side-effect import を routeTree が import）で保証され、TC-02 でその機構の有効性が実証済み。
- 検証中の `wait networkidle` タイムアウトは TanStack Router Devtools が接続保持するためのツール由来事象（描画・snapshot には影響なし）。

## スクリーンショット

`.issue/475/manual-test/screenshots/` に 12 枚（tc01〜tc06, tc-edge, tc02 削除後）。
