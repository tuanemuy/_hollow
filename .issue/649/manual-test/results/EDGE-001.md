# EDGE-001: 保存ビュー 0 件時の見出しトリガー

**結果: PASS**

## 実行ログ

| # | 手順 | 結果 |
| --- | --- | --- |
| 1 | `DELETE FROM saved_views WHERE owner_id='01950000-0000-7000-8000-000000000001'` を wrangler d1 で実行（seed-data.md 記載の手順） | OK |
| 2 | ホーム `/` を開く | 見出し「すべてのノート」表示 |
| 3 | 見出しトリガー検査 | トリガー存在、`aria-haspopup="listbox"`、`aria-label="ビューを切り替え: 現在 すべてのノート"`、`aria-expanded="false"` |
| 4 | 見出しをクリック | `aria-expanded="true"`、listbox が開き `role="option"` は「すべてのノート」1 項目のみ（`aria-selected="true"`） |
| 5 | 唯一の項目を選択 | エラーなし。URL `/`、見出し「すべてのノート」のまま |
| 6 | `pnpm db:execute:local .issue/649/manual-test/seed.sql` でビュー 3 件を復元し、count=3 を確認 | OK（データ復元済み） |

## 注記（R2 レビュー Test-W-001 対応）

本ケースの aria-label 証跡は R1 修正前のコードに対する実行記録。R1 修正（B-001 / ADR-005 改訂）で aria-label は「{可視見出し} — ビューを切り替え」の合成形式へ変更済み。新形式はユニットテスト（`listSelectors.test.ts` / `ViewSwitcher.test.tsx`）で契約固定済みのため再実行はしていない。
