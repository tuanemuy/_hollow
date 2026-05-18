# Manual Test Analysis — Issue #3

実行日: 2026-05-18

## 全体所感

Issue #3 `P46 管理者ジョブ監視画面の実装` の主要機能 (`/admin/jobs` ページ、
取り込み/エクスポートジョブ一覧、failed のピン留め、retry ボタンによる再実行、
非 admin アクセス拒否) はすべて期待通りに動作している。

ただし以下 2 点の独立した既存課題が、テスト実行と検証品質に影響した。

---

## A. シードデータ `seed-jobs.sql` の defect (本 Issue 範囲内)

**症状:** seed-jobs.sql そのままでは `/admin/jobs` ページが
`SystemError: Stored {ingestion_job|export_job} violates invariants`
で 500 失敗し、TC-1〜TC-7 のすべてがブロックされた。

### A-1: ingestion_jobs #305 — Saved 不変条件違反

```
status='saved'
preview_json = NULL
saved_as_note_id = NULL
```

しかし `assembleByStatus("saved", ...)` は `preview === null` または
`savedAsNoteId === null` を `BusinessRuleError` で弾く
(`app/core/domain/ingestion/entity.ts:378-389`)。

**対応:** 当該行は削除して検証続行。

### A-2: export_jobs #311 / #312 / #313 — 非 PDF format で pdfPaperSize 設定

`assertPdfOptions` (`app/core/domain/export/entity.ts:186-201`) は
非 PDF format で `pdfPaperSize !== null` を弾く。

**対応:** `pdfPaperSize: null` に更新。

### A-3: export_jobs #314 — PdfPaperSize の大文字小文字

`PdfPaperSize.create` (`app/core/domain/export/valueObject.ts:92-99`) は
`"A4"|"Letter"` のみ受理。小文字 `"a4"` は `InvalidPaperSize` で弾かれる。

**対応:** `pdfPaperSize: "A4"` に更新。

---

## B. /admin・/admin/llm・/admin/metrics の既存不具合 (本 Issue 範囲外)

- `/admin` (Dashboard): `TypeError: Cannot read properties of undefined (reading 'collect')` — `<AdminDashboard>` 内
- `/admin/metrics`: 同じ `'collect'` TypeError — `<MetricsPage>` 内
- `/admin/llm`: `SystemError: Stored instance_settings violates invariants`

`/admin/jobs`・`/admin/users` は正常に動作するので admin layout や
`assertAdmin` 経路は健全。Issue #3 の変更とは独立した既存不具合。

---

## C. UI のエラーメッセージ表示 (Edge-3 関連)

Edge-3 で `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` を発生させた際、UI には
汎用「エラーが発生しました」しか表示されない。
testing.md 期待「可読な日本語に変換されて表示される」を満たしていない可能性。
`displayError` ローカライズ辞書の確認推奨。
