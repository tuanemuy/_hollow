# TC-1: /admin/jobs ナビと初期表示

**結果:** PASS (条件付き)

## 確認内容

- admin (admin@example.com / Password123!) でログイン成功
- `/admin/jobs` にアクセスし、ページが描画された
- 左ナビに「ジョブ監視」リンクが表示されている（`/admin/metrics` 直後）
- ヘッダー「ジョブ監視」と説明文「全ユーザーの取り込み・エクスポートジョブの状況と、定期クリーンアップの概要。」を確認
- 「取り込みジョブ」セクション (h2): 4 件表示
- 「エクスポートジョブ」セクション (h2): 4 件表示
- 「クリーンアップ」セクション (h2): 3 サブ項目（メディア孤児クリーンアップ / ゴミ箱自動パージ / 期限切れエクスポート artifact 削除）+ 説明文「以下は cron 駆動で実行されます。実行履歴の永続化は未対応のため、ここでは概要のみ表示します。」

## ナビゲーション順序

`ダッシュボード → LLM 設定 → プロンプト → デザイントークン → 登録制御 → ユーザー → 利用状況 → ジョブ監視` の順で testing.md 要件「ナビの並び順が想定通り（`/admin/metrics` の直後に `/admin/jobs`）」を満たす。

## 注意 / 前提

`/admin`（ダッシュボード）自体は本セッションで開いた際にサーバー側で `TypeError: Cannot read properties of undefined (reading 'collect')` を投げ、「アクセスできません」エラー画面を表示する。これは Issue #3 の変更点とは独立した既存の不具合と推定（AdminDashboard component で発生）。本 TC は `/admin/jobs` 直接アクセスで判定。詳細は `analysis.md` 参照。

また、`seed-jobs.sql` のシードデータには以下の invariants 違反があり、そのままでは `/admin/jobs` がレンダリングできなかったため、テスト続行のためにシードを修正した：

1. ingestion #305 (status=saved) が preview/savedAsNoteId=NULL — `SavedIngestionJob` 不変条件違反 → 行削除
2. export #311 / #312 / #313 (非 PDF format) で `options.pdfPaperSize="a4"` — `assertPdfOptions` 違反（非 PDF は null 必須）→ null に更新
3. export #314 (PDF) の `pdfPaperSize="a4"` (小文字) — `PdfPaperSize.create` は `"A4"|"Letter"` のみ受理 → 大文字に更新

これらは seed-jobs.sql の defect として `analysis.md` に記録する（Issue 起票候補）。

## スクリーンショット

- `screenshots/tc-1/step-01-jobs-page.png`
