# ブラウザ検証レポート — Issue #658

**実行日**: 2026-06-13 / **テストソース**: `.issue/658/testing.md` / **サーバー**: http://localhost:3001（vite dev）

## 結果

12 テストケース中 11 PASS。詳細は `results/summary.md` と各 `results/TC-*.md`。

検証中に発見・修正した実装バグ（いずれも修正後に実機で再検証済み）:

1. **ピッカーがナビゲーション後に閉じる**（TC-4）— `usePopover.onFocusOut` が RSC 再レンダー時の relatedTarget=null focusout をフォーカス移動と誤判定。ガード追加（ADR-005）
2. **トグル後にフォーカスが body へ落ち矢印キー不能**（TC-5）— `useRovingMenu` にコミット後フォーカス復元＋closed→open 遷移ガードを追加（ADR-006）
3. **モバイルでボトムシート化されない**（TC-6）— 共有定数 `popoverSheetPanel` が `max-sm:fixed`/`bottom-0` を欠く潜在バグ（既存の期間/公開状態ポップオーバーも崩れていた）。定数を修正し、option に TOUCH_TARGET 追加

残 FAIL 1 件（TC-E1: 連続トグル lost update）は main でも再現する既存バグのため #664 として起票（本 PR では修正しない）。

## 起票した Issue

- #664 P10 FilterBar: タグフィルタの連続トグルで lost update（last-write-wins）

## 成果物

- `results/TC-*.md`（12 件）/ `results/summary.md` / `seed-data.md` / `server-info.md`
