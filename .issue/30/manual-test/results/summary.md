# テスト実行サマリー — Issue #30

**実行日**: 2026-05-18
**テストソース**: `.issue/30/testing.md`
**サーバー**: http://localhost:3000

| TC | テスト名 | URL | 期待 | 実測 | 結果 |
|----|---------|-----|------|------|------|
| TC-001 | フィルタなしで count = owner 総件数 | `/` | 10 | 10 | PASS |
| TC-002 ★ | `?visibility=public` で count = 1 | `?visibility=public` | 1 (公開デザインガイド) | 1 | PASS |
| TC-003 | `?visibility=unlisted` で count = 1 | `?visibility=unlisted` | 1 (Project A デザインメモ) | 1 | PASS |
| TC-004 | `?visibility=private` で count = 8 | `?visibility=private` | 8 | 8 | PASS |
| TC-005 | tag フィルタで count = タグ件数 | `?tagNames=["work"]` | 4 | 4 | PASS |

**合計**: 5 件（PASS: 5 / FAIL: 0）

★ TC-002 が Issue #30 の症状（修正前: `?visibility=public` で表示 1 件・count 10 件）を直接再現するケース。修正後は count=1 で表示と一致することを確認した。
