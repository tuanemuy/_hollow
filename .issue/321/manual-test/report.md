# ブラウザ検証レポート — Issue #321 内部リンクの後追い再解決

**実行日時**: 2026-05-29
**テストソース**: `.issue/321/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`、dev では InlineRelayTrigger がドメインイベントを同一 isolate で同期 dispatch）
**アカウント**: `test321@example.com`（ローカル D1 投入、verified/active）

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | 作成時バックフィル＋バックリンク出現 | ✅ PASS |
| TC-002 | 改名時の解除＋再解決（content_updated 経由） | ✅ PASS |
| TC-003 | trashで解除 / restoreで再解決 | ✅ PASS |

**合計 3 件 / PASS 3 / FAIL 0**。起票した Issue: なし。

## 検証で確認できたこと

本Issueの中核「リンク先ノートのライフサイクルイベントに応じて既存 `note_internal_links` 行を後追い再解決する」機構が、実際の running app（dev サーバー）で end-to-end に機能することを確認した。

1. **作成時バックフィル（TC-001）**: リンク先が存在しない状態で `[[タイトル]]` を保存（resolved_note_id=null）→ 後からそのタイトルのノートを作成 → `note.created` 駆動でリンクが解決され、バックリンクにも出現。
2. **改名時の双方向再解決（TC-002）**: エディタ保存でタイトルを変更（`note.content_updated`）→ 旧タイトルで解決していたリンクが null 解除、新タイトル一致の未解決リンクが解決。**round-1 レビューで発見された「content_updated もタイトル変更経路」が正しく扱われている。**
3. **trash/restore（TC-003）**: trash で当該ノートを指すリンクが明示解除（FK set null は物理削除のみ作動）、restore で再解決。

イベント→consumer dispatch→reaction handler→`resolved_note_id` 更新の配線が、created / content_updated / renamed(=content_updated) / trashed / restored の各経路で動作する。

## エッジケース（統合テストで担保、ブラウザ省略）

`internalLinkBackfill.integration.test.ts`（D1, 7ケース全PASS）+ `service.chooseResolutionForTitle.test.ts` + `handleLinkTargetResolution.test.ts` でカバー:
- 同名タイトル複数時の決定規則（#127 ADR-003 整合）/ 自己参照除外（#127 ADR-005）
- 本文のみ編集の no-op / purge の FK 対応（handler 不要）/ 冪等 / バックフィル usecase

## 成果物
- サマリー: `.issue/321/manual-test/results/summary.md`
- スクリーンショット: `.issue/321/manual-test/screenshots/tc-001..003/`
- シードデータ: `.issue/321/manual-test/seed-data.md`
