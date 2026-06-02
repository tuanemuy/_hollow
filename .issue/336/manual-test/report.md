# ブラウザ検証レポート — Issue #336

**実行日**: 2026-06-02
**テストソース**: .issue/336/testing.md（section 3 = nav-item 非退行）
**サーバー**: http://localhost:3003/（pnpm dev / 検証後停止）

## 結果サマリー

| TC | 確認対象 | 結果 |
|----|---------|------|
| TC-nav-item | サイドバー NAV_ITEM / ツリー TREE_ITEM_LINK の非退行 | PASS |

**合計**: 1 件（PASS: 1 / FAIL: 0）

## 確認できたこと（視覚回帰ゼロ）

- NAV_ITEM: computed rounded-md=8px / padding 7px 12px / text 13px / height 33px。DOM class = `navItem` base + `relative hover:bg-surface aria-[current=page]:bg-surface data-[active]:bg-surface`。hover で bg→bg-surface 変化、現在ページで `aria-current=page` + `data-active` + font-medium + bg-surface。
- TREE_ITEM_LINK: DOM class = `navItem` base + `flex-1 min-w-0 truncate`。truncate（overflow:hidden + ellipsis + nowrap）適用。選択中は font-medium、背景は TREE_ITEM_ROW 側が行全体に描画（設計どおり）。
- 共通部分（角丸・パディング・文字サイズ・選択中の見た目）が NAV_ITEM / TREE_ITEM_LINK で一致 = `navItem` base が両方に効いていることを DOM で確認。
- 死蔵 `ROW_ACTIONS_SMALL_PILL` 削除をコードで確認（consumer 0）。

## 成果物

- 詳細: results/TC-nav-item.md
- スクショ: screenshots/{sidebar-full,nav-item-hover,tree-link-active}.png

## 起票した Issue

なし（全 PASS）。

## 後始末

seed した session 行（id `019e336a-...336`）は削除済み。dev サーバー停止済み。
