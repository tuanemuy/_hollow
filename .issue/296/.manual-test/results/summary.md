# テスト実行サマリー — Issue #296

**実行日時**: 2026-05-31
**テストソース**: .issue/296/testing.md
**サーバー**: http://localhost:3000 （pnpm dev / DEV モード / vite ライブソース）
**ログイン**: existing@example.com / Password123!

## 結果

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | 修正前ベースライン: 画面遷移で loadAppContext 発火 | 観測 | （FAIL=現象再現） | 各ナビゲーションで loadAppContext 由来 `_serverFn` が 1〜2 回発火。`staleTime` 変更では止まらないことを実証 → 真因は `beforeLoad` |
| TC-002 | 修正後: 画面遷移で loadAppContext が再発火しない | 正常系 | PASS | ビュー切替・フィルタ・SPA遷移・複数巡すべてで loadAppContext 由来 `_serverFn` が 0 回。hydration 警告なし、ページ正常表示 |

**合計**: 2 件（PASS: 1 / 現象再現による方針転換: 1）

## 要点

- TC-001（修正前検証）で「`staleTime` の調整では解決しない／真因は `beforeLoad` のナビゲーションごと再実行」が判明。計画を全面改訂し複雑度を中〜大規模に格上げ（`.issue/296/plan.md` 参照）。
- TC-002（修正後検証）で、SSRガード + クライアントプロミスキャッシュにより per-navigation の発火が完全に消失することを確認。各ページ遷移で残るのはそのルート固有のデータローダ（`renderHome` / `renderTrash` / `renderTags`）のみで、これは正常な挙動。

## スクリーンショット

- 修正前: `screenshots/step-01..05-*.png`
- 修正後: `screenshots/recheck-00..07-*.png`
