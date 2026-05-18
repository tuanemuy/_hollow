# Manual Test Report — Issue #31

**Issue:** #31 SavedView に visibility フィルタを永続化
**実行日時:** 2026-05-19
**テストソース:** `.issue/31/testing.md`
**サーバー:** http://localhost:3000
**シードデータ:** Issue #8 の seed.sql を流用（10 ノート / public 1 / unlisted 1 / private 8）

---

## サマリー

| TC | 名前 | 結果 |
|----|------|------|
| TC-1 | `?visibility=public` を SavedView 経由でラウンドトリップ | PASS |
| TC-2 | visibility 未指定の SavedView は無フィルタとして復元 | PASS（軽微な UI 制約あり） |
| TC-3 | `?referencingNoteId=...` は壊れていない（回帰チェック） | PASS |

**合計**: 3 / 3 PASS

---

## TC-1: `?visibility=public` ラウンドトリップ — PASS

- `/?visibility=public` で 1 件（N9 公開デザインガイド）が表示
- 「ビューとして保存」ダイアログで `Public only #31` として保存
- D1 上の `query_json.visibilityFilter` に `["public"]` が格納されたことを確認
- `?viewId=<id>` で SavedView を選択 → 同じ 1 件が表示
- ページ再読み込み後も 1 件のまま（永続化が機能）

**スクリーンショット:**
- `screenshots/tc-1/step-02-public-filter-dialog.png`
- `screenshots/tc-1/step-03-viewId-navigated.png`
- `screenshots/tc-1/step-04-after-reload.png`

---

## TC-2: visibility 未指定の SavedView — PASS（caveat あり）

- 「ビューとして保存」ボタンは無フィルタ状態では disabled。これは Issue #31 の対象外の UX 仕様
- 軽い date フィルタ（`from=2020-01-01`）を付けて visibility = すべて の状態で保存
- `query_json.visibilityFilter` に `[]`（空配列）が格納されたことを確認
- SavedView を選択 → 10 件すべて表示（visibility フィルタは適用されない）

**スクリーンショット:**
- `screenshots/tc-2/step-01-no-filter.png`
- `screenshots/tc-2/step-02-allnotes-view.png`

**caveat:** 完全に「フィルタなし」状態で SaveViewDialog を開けない既存 UX があるが、Issue #31 のスコープ外。本 Issue が解決したい「visibility が SavedView で消える」問題そのものは検証できている。

---

## TC-3: referencingNoteId 回帰チェック — PASS

- `/?referencingNoteId=01938f00-0000-7000-8000-00000000b079` → N1 のみ表示（N1 は N9 を参照）
- Issue #8 で対応した referencingNoteId フィルタが壊れていないことを確認

**スクリーンショット:**
- `screenshots/tc-3/step-01-referencing.png`

---

## クリーンアップ

- 作成した SavedView（`Public only #31` / `All notes #31`）は D1 から削除済み
- ブラウザセッション `verify-issue31` は close 済み
- dev サーバーは停止済み

## 起票 Issue

なし（全テスト PASS）。
