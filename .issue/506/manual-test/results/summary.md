# テスト実行サマリー — Issue #506

**実行日時**: 2026-07-01
**テストソース**: .issue/506/testing.md
**サーバー**: http://localhost:3001

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | FilterBar DatePopover を開くと先頭プリセットへ初期フォーカス（AC-1/3/5） | 正常系 | PASS | - |
| TC-002 | FilterBar Escape クローズ＋トリガーへフォーカス復帰（AC-6） | 正常系 | PASS | - |
| TC-003 | FilterBar マウス click で開いても誤クローズしない（Edge 1） | 異常系 | PASS | - |
| TC-004 | menu/listbox モードの roving が不変（回帰、AC-7） | 回帰 | PASS | - |
| TC-005 | 公開 PublicTopControls DatePopover 初期フォーカス（AC-4/5） | 正常系 | PASS | - |
| TC-006 | 公開 DatePopover Escape クローズ＋フォーカス復帰（AC-6） | 正常系 | PASS | - |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 主要な観測（eval 生値）

- TC-001/005: `activeElement = {tag: BUTTON, type: button, text: "今日", inDialog: true}` — 先頭プリセットボタン「今日」へ初期フォーカス。date input ではない。`role="dialog"` 保持、開いた直後に閉じない。
- TC-002/006: Escape 後 `[role=dialog]` 消失、activeElement がトリガー（`aria-haspopup="dialog"` の「期間」ボタン）へ復帰。
- TC-003: 再 click で `[role=dialog]` = true 維持（onFocusOut 誤発火なし）。
- TC-004: 公開状態(menu)は選択済み `menuitemradio`「すべて」、タグ(listbox)は先頭 `option` に roving フォーカス（`tabindex=0`, `inDialog: false`）。dialog 初期フォーカスの二重化なし。

## 未自動化（unit / 目視でカバー）

- AC-9（dialog を開いたまま navigation してもフォーカスを奪い戻さない）: `prevOpenRef` 立ち上がりエッジガード。happy-dom の `rerender()` では effect 再発火を再現できないため unit ではスモーク、ブラウザでも RSC 再発火の決定的再現が難しく自動化を見送り。実装は据え置き（plan.md L149 の位置づけどおり）。
- Edge 2（モバイルシートでのソフトキーボード暴発回避）: 先頭 focusable がプリセットボタン（TC-001/005 で type=button を確認済み）のため date input へは飛ばず、ソフトキーボード暴発は構造的に発生しない。ヘッドレスでソフトキーボードは観測不能のため目視/構造で担保。
