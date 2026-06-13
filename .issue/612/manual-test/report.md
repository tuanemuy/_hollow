# ブラウザ検証レポート — Issue #612: publicNoteCount が trashed-but-public を過大カウント

**実行日時**: 2026-06-13
**テストソース**: .issue/612/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）
**検証対象URL**: http://localhost:3000/u/noteowner612

## 結果サマリー

- テストケース: 2 件（PASS: 2 / FAIL: 0）
- 起票した Issue: なし（全 PASS）

## シードデータ

ユーザー `noteowner612` に以下を投入（`.issue/612/manual-test/seed.sql`）:

- active + public + published_at 非NULL: 4 件（カウント対象）
- trashed + public + published_at 非NULL（relay-lag ゴースト）: 1 件（除外対象）
- active + public + published_at NULL: 1 件（除外対象）

修正前のバグでは status を無視して 5 件（naive_count）と過大カウントしていた状態を再現。

## 検証結果

### TC-001: ヒーロー件数が trashed-but-public を除外（AC-1）— PASS

- ヒーローヘッダーの公開ノート件数 = **4**（snapshot で `strong "4"` + `公開ノート` を確認）。
- 修正前の 5 ではなく、active 母集合での live 件数 4 を返した。trashed-but-public と published_at NULL は除外。

### TC-002: ヒーロー件数と一覧件数が一致（AC-2）— PASS

- 一覧（公開ノート一覧 region）に Note One〜Four の 4 カードが表示。
- ヒーロー件数（4）== 一覧件数（4）。デフォルト経路（フィルタ無し）で整合を確認。

## 結論

Issue #612 の修正（`countPublicByOwner` による active 母集合での件数算出）がブラウザ上で期待どおり動作することを確認した。relay-lag 中の trashed-but-public 行がヒーロー件数から除外され、同一ページの listing 件数と整合する。
