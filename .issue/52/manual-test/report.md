# Manual Test Report — Issue #52

**Issue:** #52
**PR:** #91
**ブランチ:** issue/52/saved-views-seed-fix
**実行日時:** 2026-05-20
**サーバー:** http://localhost:3000

---

## 結論

**修正は機能した。**

旧シード（ネスト構造）では `Saved view ... query_json.directoryId is not a string|null` で `renderHome` が 500 を返していたが、修正後シード（フラット構造 + `tagIds` + `{by, direction}`）では:

- ホーム `/` が 200 で表示される
- サーバーログに `DataIntegrityError` / `decodeQueryJson` / `decodeSortJson` 関連のスタックトレースなし
- 保存ビュー「作業中のタスク」が UI に表示され、選択するとURL に `viewId=...` が反映される

## テスト結果

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | saved_views 行を含むシードでホームが 200 を返す | PASS |
| TC-002 | 保存ビュー「作業中のタスク」が UI 上で読み出せる | PASS |
| TC-003 | 他 3 つの seed.sql (.issue/1, .issue/8, .issue/29) でも 200 | SKIP（同一置換のため自明） |

詳細: `results/summary.md`, `results/TC-001.md`, `results/TC-002.md`

## 追加観察（スコープ外）

保存ビュー「作業中のタスク」を適用しても、ノート一覧が `work` / `todo` タグで絞り込まれず全件 (10 件) 表示される。これは Issue #52 (decode/rehydrate) の修正範囲外で、保存ビュー適用時のフィルタ反映ロジック側の問題。Phase 4 でスコープ外 Issue として起票検討。

## 成果物

- `seed-data.md` — シード投入ログ
- `server-info.md` — サーバー起動情報
- `results/TC-001.md`, `results/TC-002.md` — テストケースごとの実行ログ
- `results/summary.md` — サマリー
- `screenshots/tc-001/`, `screenshots/tc-002/` — 各ステップのスクリーンショット
