# テスト実行サマリー — Issue #329

**実行日時**: 2026-06-03
**テストソース**: .issue/329/testing.md
**サーバー**: http://localhost:3010

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | admin で「内部リンクのバックフィル」セクション描画 | 正常系 | PASS | - |
| TC-002 | 未認証で /admin/jobs アクセス拒否 | 異常系 | PASS | - |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## ブラウザ検証対象外（integration テストで担保）
- バックフィル実行（resolvedRows 集計）・冪等性（再実行 no-op）・非 admin 認可拒否は、mutation の server-function POST が cross-origin 403 でブラウザ検証不可（メモリ browser-verify-authed-routes）。
- これらは `app/core/application/note/__tests__/backfillAllOwnersInternalLinkResolution.integration.test.ts`（3件 PASS）で担保:
  1. 非 admin actor → ForbiddenError(FORBIDDEN_ADMIN_ONLY)
  2. 複数 owner 横断で resolvedRows/ownerCount が合算
  3. 2回目実行で resolvedRows === 0（冪等）
