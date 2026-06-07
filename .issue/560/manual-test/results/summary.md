# テスト実行サマリー — Issue #560

**実行日時**: 2026-06-07
**テストソース**: .issue/560/testing.md
**サーバー**: http://localhost:3000（`pnpm dev` / ローカル D1）
**シード**: .issue/544/manual-test/seed.sql（各 ...030 変更系 TC の前に再投入）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | 誤パスワード1回で failed_attempts が 1 に increment | 正常系（回帰の核） | PASS | - |
| TC-002 | 5回目でロックアウト武装、6回目で role="status" 警告 | 正常系（最重要） | PASS | - |
| TC-003 | 正パスワードで成功し failed_attempts が reset | 正常系 | PASS | - |
| TC-004 | revoked リンクで失効エラー（カウンタ不変） | 異常系 | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0）
