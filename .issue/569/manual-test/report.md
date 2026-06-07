# ブラウザ検証レポート — Issue #569 P18 タグ管理（検索・ソート・最終使用列）

**実行日時**: 2026-06-08
**テストソース**: .issue/569/testing.md
**サーバー**: http://localhost:3002/tags（local D1, dev-admin）
**agent-browser**: 0.27.1

## 結果: 全8テストケース PASS（FAIL 0 / 起票Issue なし）

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | タグ検索: `?q=re` で research/reading/react の3件に絞込、空submitで全件復帰 | PASS |
| TC-002 | 0件検索: 「『zzzzz』に一致するタグはありません」専用空状態（未作成向け文言は非表示） | PASS |
| TC-003 | ソート: 名前/ノート数/作成日時/最終使用 の4軸＋方向トグル、URL(`sort`/`order`)とsegmented activeが追従 | PASS |
| TC-004 | 最終使用列: 使用済みは`YYYY/MM/DD`（期待値一致）、unused-tagは「未使用」フォールバック | PASS |
| TC-005 | 最終使用ソート: desc=新しい順・NULL末尾 / asc=NULL先頭、リロード・同日タイでも順序安定 | PASS |
| TC-006 | 不正パラメータ`?sort=bogus&order=xxx&q=`: エラーにならず既定（名前昇順・全件）に落ちる | PASS |
| TC-007 | リネーム楽観反映: 即時更新、`?sort=lastUsedAt&order=desc`保持、lastUsedAt/noteCount保持 | PASS |
| TC-008 | 削除楽観反映: 確認ダイアログ→行が即時消失、`?q=re`保持・他ヒットは残存 | PASS |

## 確認できた挙動の要点
- A 検索・B ソート・C 最終使用列がモック整合で動作。trashed ノートは noteCount/最終使用から除外（essay）。
- 二段構え schema の `.catch(undefined)` で不正URLパラメータがルートを壊さない（TC-006）。
- 検索/ソートUI（TagListToolbar）が TagList の `useOptimistic`（リネーム/削除）と干渉せず、URL状態を保持（TC-007/008）。

## 注記
- TC-007/008 で local D1 のテストデータを変更（`reading`→`reading-renamed` リネーム、`react` 削除）。ローカル検証用シードのみで PR・本番に影響なし。再検証時はシード再投入推奨。
- TC-003 で agent-browser daemon の一過性 cookie 消失が1回発生したが再注入で即復旧。アプリ起因ではない。

## 成果物
- サマリー: .issue/569/manual-test/results/summary.md
- スクリーンショット: .issue/569/manual-test/screenshots/{core,edge}/
- サーバー情報: .issue/569/manual-test/server-info.md
- シード: .issue/569/manual-test/seed-data.md
