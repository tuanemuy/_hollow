# テスト実行サマリー — Issue #652

**実行日時**: 2026-06-13
**テストソース**: .issue/652/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | 公開ページ Sort メニュー末尾項目のマウス選択（633px） | 正常系（バグ本体） | PASS | translateY(-47.5px) で末尾項目が画面内に収まり `?sort=title` 遷移成功 |
| TC-2 | 通常高さ・キーボード・URL での回帰なし | 回帰 | PASS | 高さ1000px で transform="none"、マウス/キーボード両方で `?sort=title` 成功 |
| TC-3 | auth 側 FilterBar の回帰なし | 回帰 | PASS | Visibility→`?visibility=public`、Date(dialog) 正常開閉、transform="none" |
| TC-4 | ユニットテスト | 自動 | PASS | vitest 3722 件 PASS（Popover.test.tsx 22 件含む） |
| Edge-1 | 狭幅(max-sm)ボトムシート非干渉 | 異常系 | PASS | 幅480px で transform="none"・position=fixed・bottom 固定。クランプ正しくスキップ |
| Edge-2 | 縦長パネル上端優先 | 異常系 | PASS（ユニット） | computeShiftY 上端優先ケースをユニットテストで固定。実機は DatePopover が VP 内に収まり該当せず |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 核心の実測（TC-1, innerHeight=633）

| 項目 | top | bottom | 画面内(≤625) | center で取れる要素 |
|---|---|---|---|---|
| 公開日順 | 482 | 516 | ✓ | 自身 |
| 更新日順 | 516 | 551 | ✓ | 自身 |
| 作成日順 | 551 | 585 | ✓ | 自身 |
| タイトル順 | 585 | 620 | ✓ | **タイトル順（自身）** |

- panelTransform: `matrix(1,0,0,1,0,-47.5)` = translateY(-47.5px)（垂直クランプ作動）
- panelBottom: 625 = innerHeight(633) - margin(8) にぴったり収まる
- 修正前は末尾項目 center y=650 が画面外で elementFromPoint=null → クリック失敗（#619 TC-002）。修正後は自身が取れクリック成功 → **#619 TC-002 解消を確認**

## FAIL

なし。
