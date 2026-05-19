# Issue #48 マニュアルテスト サマリ

**実行日:** 2026-05-20
**対象ブランチ:** `issue/42/spec-sync-followup`
**Webサーバー:** http://localhost:3000/ (pnpm dev)
**実行ユーザー:** `mt48-eve@example.com`

## 結果一覧

| TC | 内容 | 結果 |
|---|---|---|
| TC-1 | search 結果リストで実 `updatedAt` が出る | **PASS** |
| TC-2 | search 結果リストで visibility chip が出る（3 種類） | **PASS** |
| TC-3 | search 結果でカレンダー表示が機能する（ADR-014 解消） | **PASS** |
| TC-4 | search 結果でタイル表示でバッジが出る | **PASS** |
| TC-5 | search 結果の行 link から detail ページへ遷移できる | **PASS** |
| TC-6 | filter 経路（クエリなし）のリグレッションなし | **PASS** |
| TC-E1 | search 結果 0 件で空状態 UI | **PASS** |
| TC-E2 | search index drop ケース（ADR-002） | **SKIP** |
| TC-E3 | cursor pagination 順序の安定 | **PASS** |

**集計:** PASS = 7 / FAIL = 0 / SKIP = 1

## ハイライト

- search 経路で `updatedAt = new Date(0)` 起因の `1970年1月1日` 表示が完全消滅（TC-1, TC-3）
- visibility chip が search 経路（list / tile / calendar）で正しく描画される（TC-2, TC-4）
- ADR-014（search × calendar 非対応）の制約が解消され、12 個の日付ヘッダで grouping 表示される（TC-3）
- `directoryId` / `slug` の実値化により detail link が機能する（TC-5）
- filter 経路に意図しない影響なし（TC-6）
- 空結果での `findByIds([])` 呼び出しが安全（TC-E1 console エラーなし）
- cursor pagination 順序がリロードで安定（TC-E3）

## SKIP の根拠

- **TC-E2**: testing.md でも「再現難易度: 高」とされる drop 動作。
  unit test (`searchOwnNotes.test.ts` の drop ケース) で挙動を pin 済み。
  手動再現には purge と index relay の競合タイミングを精密に制御する必要があり非現実的。

## 失敗 TC

なし。

## 成果物

- 結果ファイル: `.issue/48/.manual-test/results/TC-{1,2,3,4,5,6,E1,E2,E3}.md`
- スクリーンショット: `.issue/48/.manual-test/screenshots/tc-{1,2,3,4,5,6,e1,e3}/*.png`
- シードデータ: `.issue/48/.manual-test/seed-data.md`
- このサマリ: `.issue/48/.manual-test/results/summary.md`
