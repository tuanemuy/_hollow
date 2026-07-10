# テスト実行サマリー

**実行日時**: 2026-07-11
**テストソース**: .issue/468/testing.md
**サーバー**: http://localhost:8787（`pnpm build:local && pnpm start`）/ pruner: http://localhost:8788（`pnpm wrangler dev --env pruner --test-scheduled --port 8788`）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | 取り込み commit 正常系（metadata-first 化後） | 正常系 | PASS | -（初回は環境問題で FAIL → サーバー起動方式を是正して再実行） |
| TC-002 | 放棄された source intake の sweep（orphan 化） | 正常系 | PASS | - |
| TC-003 | orphan 行の purge（回収チェーン完走） | 正常系 | PASS | - |
| TC-004 | pruner tick の既存刈り込み無退行 | 回帰 | PASS | - |
| TC-005 | infra テンプレートの pruner R2 配線 | 構成 | PASS | - |
| TC-006 | 保持ポリシー・運用ノートの明文化（AC-1） | ドキュメント | PASS | - |
| EC-1 | 猶予期間内の pending/source は非回収 | 異常系 | PASS | - |
| EC-2 | pending/image は sweep 対象外（ADR-004） | 異常系 | PASS | - |
| EC-3 | R2 設定欠落時の tick（best-effort 継続） | 異常系 | PASS | - |

**合計**: 9 件（PASS: 9 / FAIL: 0）
