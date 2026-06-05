# ブラウザ検証レポート — Issue #467: WAI-ARIA Menu パターンを共通プリミティブに抽出

**実行日**: 2026-06-06
**テストソース**: `.issue/467/testing.md`
**サーバー**: http://localhost:5175（`pnpm dev`）
**結果**: 7 / 7 PASS（FAIL 0、起票 Issue 0）

## 概要

共通プリミティブ（`usePopover` / `Popover` / `useRovingMenu` / `Menu`/`MenuItem`）への載せ替え後、4箇所のメニュー/ポップオーバー（UserMenu / DirectoryActionsMenu / NoteActionsMenu / FilterBar の公開状態・期間）がすべて従来どおり動作し、ハイライトの `focus-visible:` 統一と DirectoryActionsMenu の開時グレー化バグ解消が確認できた。

## ハイライトされる成果

1. **focus-visible 統一の確認（本Issueの核）** — 4メニューすべての menuitem className が `focus-visible:bg-surface` を持ち、素の `focus:bg-surface`（開時グレー化バグの原因）を持たないことを実 DOM で確認。NoteActionsMenu はスクリーンショットでも「マウス開時=先頭無ハイライト」「↓キー移動=フォーカス項目にグレー＋リング」を目視確認（`screenshots/tc03-noteactions-open-mouse.png` / `tc03-noteactions-arrowdown.png`）。
2. **DirectoryActionsMenu の残存バグ解消** — 旧 `focus:bg-surface` → 共通 `menuItem` の `focus-visible:bg-surface` に置換され、`bareFocus=false` を確認。
3. **roving / focus 復帰の不変条件** — 全メニューで roving tabindex（0/-1）、open 時の先頭（公開状態は選択中項目）着地、Esc クローズ＋トリガーへのフォーカス復帰を確認。
4. **dual-mode** — FilterBar の公開状態が menu（menuitemradio + initialIndex + data-active 選択表示維持）、期間が dialog（aria-haspopup=dialog + フォーム）として正しく動作。
5. **混在ノード** — UserMenu の info ヘッダ（Dev Admin/email/管理者）が menuitem ロールを持たず roving から除外（menuitem=2）。
6. **ツリー非干渉 / 外側クリック** — DirectoryActionsMenu 操作で URL 不変（treeitem 遷移なし）、外側 mousedown でクローズ。

## 成果物

- サマリー: `.issue/467/manual-test/results/summary.md`
- スクリーンショット: `.issue/467/manual-test/screenshots/`
  - `tc01-usermenu-open.png` / `tc01-usermenu-clean.png`（UserMenu）
  - `tc02-diractions-open-mouse.png`（DirectoryActionsMenu）
  - `tc03-noteactions-open-mouse.png` / `tc03-noteactions-arrowdown.png`（NoteActionsMenu ハイライト）
  - `tc04-visibility-open.png`（公開状態 menu）/ `tc04-date-dialog-open.png`（期間 dialog）
- シードデータ: `.issue/467/manual-test/seed-data.md`

## 起票した Issue

なし（全 PASS）。
