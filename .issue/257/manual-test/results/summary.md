# テスト実行サマリー

**実行日時**: 2026-05-28
**テストソース**: .issue/257/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | モバイル幅 login 表示 / viewport-fit=cover 反映確認 | 正常系 | PASS | viewport meta に `viewport-fit=cover` が含まれることを HTML レベルで確認 |
| TC-002 | editing view 到達による Resp-H1 / Resp-H2 実画面検証 | 正常系 | SKIP | 認証突破不可。代替として構造 regression test + PR 目視レビューに委ねる |

**合計**: 2 件（PASS: 1 / FAIL: 0 / SKIP: 1）

## 補足

- 構造 regression test（`IngestionPreviewForm.test.tsx`）は緑で sticky/max-h 復活を CI で防ぐ
- `pnpm typecheck` / `pnpm lint:fix` / `pnpm format` / `pnpm test:unit` 全 PASS
- editing view の実画面確認は PR レビュアーが DevTools レスポンシブモードで実施
