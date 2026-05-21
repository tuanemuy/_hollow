# Manual Test Report — Issue #94

**Issue:** #94
**ブランチ:** `issue/94/saved-view-tag-resolver`
**実行日時:** 2026-05-22
**サーバー:** http://localhost:3000

---

## 結論

**修正は機能した。**

`app/routes/index.tsx` の home loader で `viewQueryToSearch(view, resolveTagNames)` に `loadAllTags().byId` から作った resolver を渡すように変更した結果:

- SavedView「作業中のタスク」(`viewId=01938f00-0000-7000-8000-00000000d071`) を選択するとノート一覧が tag フィルタ (`#work` / `#todo`) で絞り込まれ、対象の 1 件（`Weekly planning ノート`）のみ表示される
- 修正前は SavedView を選択しても全 10 件表示のままだった（Issue 本文の再現手順）

## テスト結果

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | SavedView 適用でノート一覧が tag フィルタで絞り込まれる | PASS |
| TC-002 | URL から viewId を外すと全件表示に戻る | PASS |
| TC-003 | URL の `q` が SavedView より優先される（回帰確認） | PASS |
| TC-004 | SavedView が存在しない viewId でも 500 にならない | PASS |

詳細: `results/summary.md`, `results/TC-001.md` … `results/TC-004.md`

## 起票した Issue

なし（全 PASS）。

## 成果物

- `seed-data.md` — シード投入ログ
- `server-info.md` — サーバー起動情報
- `results/summary.md` — サマリー
- `results/TC-001.md` 〜 `results/TC-004.md` — 各 TC 実行ログ
- `screenshots/tc-001/` 〜 `screenshots/tc-004/` — 各ステップのスクリーンショット
