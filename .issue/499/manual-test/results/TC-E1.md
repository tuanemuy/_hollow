# TC-E1 選択モード時の行クリック = 選択トグル

**結果: PASS**

list / calendar で選択モードを ON にし、行本体クリックが詳細遷移ではなく選択トグルになること、チェックボックス直接クリックが一度だけトグル（二重発火しない）こと、選択ハイライトを確認。

選択モード ON にすると各行が `<a>` から `role=button`（aria-label に title+excerpt 等）+ `checkbox "… を選択"` の構成に切り替わる。

## list 操作ログ

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | 「選択」ボタンで選択モード ON | チェックボックス表示 | 各行に checkbox + row button、「0 件選択中」表示 | PASS |
| 2 | ノートB 行本体クリック | 遷移せず選択トグル | URL は `/?display=list` のまま・「1 件選択中」・`data-selected` 付与（bg oklch(0.97 0 0) = accent-surface） | PASS |
| 3 | ノートA チェックボックス直接クリック | 一度だけ ON | 1→2 件（二重発火なら 1 に戻るはず＝単発トグル成立） | PASS |
| 4 | ノートA チェックボックス再クリック | 一度だけ OFF | 2→1 件（単発トグル成立） | PASS |

## calendar 操作ログ

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | 「選択」ボタンで選択モード ON | チェックボックス表示 | 各行に checkbox + row button | PASS |
| 2 | ノートB 行本体クリック | 遷移せず選択トグル | URL は `/?display=calendar` のまま・「1 件選択中」・`data-selected`（bg oklch(0.97 0 0)） | PASS |
| 3 | ノートB チェックボックス直接クリック | 一度だけ OFF | 1→0 件（単発トグル成立） | PASS |
| 4 | ノートB チェックボックス再クリック | 一度だけ ON | 0→1 件（単発トグル成立） | PASS |

行本体クリックで詳細遷移せず選択トグルになり、`data-[selected]:bg-accent-surface` ハイライトが付く。チェックボックス直接クリックは件数が単調に±1し、二重発火していない。

## スクリーンショット
- screenshots/tce1-01-selection-mode.png（list 選択モード ON）
- screenshots/tce1-02-row-toggled.png（list 行本体クリックで選択）
- screenshots/tce1-03-checkbox-toggle.png（list チェックボックストグル）
- screenshots/tce1-04-calendar-row-toggled.png（calendar 行本体クリックで選択）
