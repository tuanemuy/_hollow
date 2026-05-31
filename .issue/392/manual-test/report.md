# ブラウザ検証レポート — Issue #392

**実行日**: 2026-06-01
**テストソース**: `.issue/392/testing.md`
**サーバー**: http://localhost:3100/（`pnpm dev --port 3100`、ライブソース）
**認証**: `__Host-session` cookie を CDP 投入（seed-data.md 参照）

## サマリー

| TC | 内容 | URL (directoryId) | 期待 | 実際 | 判定 |
|----|------|------|------|------|------|
| TC-1 | 親選択（主目的） | Parent `…1366f1c` | Parent/Child/Grandchild の3件・Sibling なし | NoteParent, NoteChild, NoteGrandchild（3件） | PASS |
| TC-2 | 子選択 | Child `…b90054` | Child/Grandchild の2件 | NoteChild, NoteGrandchild（2件） | PASS |
| TC-3 | 孫選択 | Grandchild `…f538af` | Grandchild の1件のみ | NoteGrandchild（1件） | PASS |
| TC-4 | 兄弟選択 | Sibling `…cfcdf1` | Sibling の1件のみ | NoteSibling（1件） | PASS |
| TC-5 | 未選択（全件） | なし | 4件すべて | 4件すべて | PASS |
| TC-6 | 非存在 directoryId | `0000…0000` | エラーにならず空一覧 | 空一覧（0件・例外なし） | PASS |
| TC-7 | malformed directoryId | `not-a-valid-id` | エラー境界に落ちない | 空一覧（0件・例外なし） | PASS |

**合計**: 7 件（PASS: 7 / FAIL: 0）

スクリーンショット: `.issue/392/manual-test/screenshots/tc{1..7}-*.png`

## 結論

- **サブツリー一致が機能している（TC-1〜TC-5）**。核心の TC-1 で、Parent 選択時に子孫含む3件（修正前は1件のみ）が表示され、Sibling は除外。選択ノードを根とするサブツリーが各階層で一貫して正しく絞り込まれる。
- **エラー境界に落ちていない（TC-6/TC-7）**。非存在・malformed いずれも 500/例外画面にならず graceful な空一覧。セッション全体でページ例外0件。

## 備考

- **TC-7 の実挙動**: malformed `directoryId` は「空一覧」（全件ではない）。`validateSearch` の `z.string().min(1)` を通過した値が `collectSubtreeIds` まで届き、owner のツリーにマッチせず空集合 → match-nothing で空一覧、という実装どおりの挙動。エラーにならない点で testing.md の許容範囲内（ADR-002 の「silent-empty」と整合）。
- **タグ×ディレクトリ併用（testing.md 項目4）はブラウザ未実施**: シードにタグを含めなかったため。`directoryIds × tagIds` の AND 交差は結合テスト `listNotesByOwner.integration.test.ts` の "combines directoryId with tagIds" で担保済み。
- **host-var 境界（testing.md エッジ2）はブラウザ未実施**: 90超ディレクトリの手動準備は非現実的。結合テスト "filters correctly when the subtree exceeds the host-var chunk size"（root 配下 parent + 95 子）で担保済み。
