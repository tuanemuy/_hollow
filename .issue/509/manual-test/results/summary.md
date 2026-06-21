# テスト実行サマリー — Issue #509

**実行日時**: 2026-06-21
**テストソース**: `.issue/509/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | P15 エクスポートフォーム `/export` の意匠・操作 | 正常系 | PASS | - |
| TC-002 | P16 ジョブ一覧 `/exports`（6 status・card・進捗バー） | 正常系 | PASS | - |
| TC-003 | P16 ジョブ詳細（failed/completed の meta・fail summary） | 正常系 | PASS | - |
| TC-004 | ジョブ詳細 not-found | 異常系 | PASS | - |
| TC-005 | モバイルモック追従（3ページ・横スクロール無） | 正常系 | PASS | - |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 総評

実装前は className 0 の素の HTML でブロックフローが崩れていた export 3 画面（P15 フォーム / P16 一覧 / P16 詳細）が、デスクトップ・モバイル両モックの意匠（segmented control・job-card・status チップ・進捗バー・meta グリッド・empty-state）どおりに描画されることを実 DOM の computed style で裏取り確認した。status 6 値の色分けは plan の status→Tone 対応表どおり。a11y（radio/checkbox の sr-only 化・ラベル経由操作）非破壊、横スクロール無し。ロジック・データフローへの回帰なし。

## 補足（実装外・テスト環境メモ）

シード SQL（`/tmp/seed-export-jobs.sql`）の `options_json` キー名等に不備があり初回ロードでドメイン不変条件エラーが出たが、これはシードデータの問題であり #509 のスタイリング実装の欠陥ではない。検証中に D1 の該当行を正値（`embedMedia`/`pdfPaperSize`、`A4`、failed/cancelled の `completed_at` 補完）へ UPDATE して解消し、全 TC を完走した。Issue 起票対象なし。
