# ブラウザ検証レポート — Issue #779: 公開検索(P32)の結果タイトルにもキーワードハイライト

**実行日**: 2026-06-27
**テストソース**: .issue/779/testing.md
**サーバー**: http://localhost:8787（`pnpm build && pnpm start` / wrangler dev, ローカル D1）

## 結果

全 6 テストケース PASS（FAIL: 0）。詳細は `results/summary.md` および `results/TC-001.md`〜`TC-006.md`。

| 受け入れ基準 | 検証 TC | 結果 |
|---|---|---|
| AC-1 タイトルの検索語が `<mark>` 要素で描画 | TC-001 | PASS |
| AC-2 XSS 安全（マーカーのみ要素化） | TC-001 / TC-003 | PASS |
| AC-3 本文のみ一致時タイトルプレーン | TC-002 | PASS |
| AC-4 LIKE フォールバックでプレーン | TC-004 | PASS |
| AC-5 他サーフェス（P30 自ノート）にマーカー漏れなし | TC-006 | PASS |
| 回帰: スニペット既存ハイライト維持 | TC-005 | PASS |

## シードデータ
`results/seed-data.md` 参照。public ノート4件（owner `test-author`）＋ dev-admin private ノート1件をローカル D1 に SQL 投入、FTS5 同期を確認済み。

## 起票した Issue
なし（全 PASS）。

## クリーンアップ
サーバー停止・agent-browser セッション close 済み。投入したシードはローカル D1 のみ（テスト用 INSERT、本番影響なし）。
