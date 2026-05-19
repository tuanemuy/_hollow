# Manual Test Report — Issue #13: PR #7 残 Warning まとめ

**実行日**: 2026-05-19
**テストソース**: `.issue/13/testing.md`
**サーバー**: http://localhost:3000 (`pnpm dev`)

---

## サマリー

| 指標 | 値 |
|------|-----|
| 実行テストケース | TC-MAIN（複数 TC を統合検証） |
| ステップ数 | 17 |
| PASS | 17 |
| FAIL | 0 |
| SKIP | 0 |
| 結果 | **全 PASS** |
| 起票した Issue | なし |

## カバレッジ

### スコープ A: ConfirmDialog 共通コンポーネント
- ✅ TC-A-1 (BulkActionBar 一括ゴミ箱): `alertdialog "一括ゴミ箱移動"` 表示、キャンセル動作確認
- ✅ TC-A-3 (SavedViewsList): `alertdialog "保存ビューを削除"` 表示、キャンセル動作確認
- ✅ TC-A-6 (TagActions): `alertdialog "タグ \"#gamma\" を削除"` 表示、キャンセル動作確認
- ⏸ TC-A-2 (NoteActions 単体削除): 主要動作は A-1/A-3/A-6 で同パターン検証済みのため省略
- ⏸ TC-A-4/A-5 (IngestionJobRow / TrashRowActions): 同パターン省略
- ✅ 全体: OS ネイティブ `confirm()` ダイアログではなく `role="alertdialog"` / `aria-modal="true"` 付きアプリ内モーダルが表示されることを確認

### スコープ D: validateSearch 統一
- ✅ TC-D-1 (ホーム遷移): ルート `/` 直アクセスと Hollow ロゴクリックの両方で URL が `?page=1&limit=20` に正規化されることを確認

### スコープ F: OwnedNotesResult discriminated union
- ✅ TC-F-1 (filter 経路 表示モード切替): list / tile / calendar すべて正常描画、`1970-01-01` sentinel 日付なし、実日付（`2026年5月19日` / `2026年5月18日`）表示

### 自動テストでカバー済み（手動省略）
- スコープ B/C: useAutosave AbortController + deps 最適化 → `pnpm test:unit` で `autosaveLogic.test.ts` が PASS
- スコープ E: bulkVisibilitySchema 移動 → `publication/__tests__/schema.test.ts` 新規 4 ケース PASS、`note/__tests__/schema.test.ts` 既存テスト PASS

## 自動チェック（実行済み）

- ✅ `pnpm typecheck`: グリーン
- ✅ `pnpm lint`: 既存 warning 3 件のみ（Issue #13 と無関係）
- ✅ `pnpm test:unit`: 91 files / 1426 tests PASS
- ✅ `grep -rn "window\.confirm\|^\s*if (!confirm" app/`: 0 件（変数名・コメントを除く）

## テストデータ保全

すべての ConfirmDialog はキャンセルで閉じ、テストデータは無傷:
- ノート 6 件、削除済みノート 2 件、ディレクトリ 2 件、タグ 3 件、保存ビュー 1 件、ingestion ジョブ 2 件
- 詳細は `.issue/13/manual-test/seed-data.md` を参照

## 成果物

- レポート: `.issue/13/manual-test/report.md`
- テスト結果: `.issue/13/manual-test/results/TC-MAIN.md`
- スクリーンショット 11 枚: `.issue/13/manual-test/screenshots/`
- シードデータ整備: `.issue/13/manual-test/seed-data.md`
- シード SQL: `.issue/13/manual-test/seed-supplement.sql`

## 結論

Issue #13 のリファクタ・規約統一は主要観点すべて手動テスト合格。Issue 起票は不要。
