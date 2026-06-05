# テスト実行サマリー — Issue #476

**実行日**: 2026-06-05
**テストソース**: .issue/476/testing.md
**サーバー**: http://localhost:3100（pnpm dev --port 3100）
**シード**: dev-admin@example.com（`__Host-session` Cookie 注入でログイン）/ ノート6・タグ14・公開状態3種混在

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | 期間 チップ＋ポップオーバー（プリセット/手動/×解除） | 正常系 | PASS | 「今月」で 6→2件、URL `?from=2026-06-01&to=2026-06-30`、チップ `期間: 6/1–6/30`、× で解除 |
| TC-2 | 公開状態 チップ＋ポップオーバー（単一選択/状態色/解除） | 正常系 | PASS | menuitemradio×4・スウォッチ(success/warning/ink-tertiary)・「公開」即時反映&クローズ `?visibility=public`・「すべて」で解除 |
| TC-3 | チップ語彙の一貫性 + すべてクリア | 正常系 | PASS | タグ+公開状態併存、すべてクリアで全解除（q/display保持）・ボタン消失 |
| TC-4 | キーボード操作・a11y | 正常系 | PASS | Escape でクローズ＆トリガーへフォーカス復帰、ArrowDown で roving、外側 mousedown で dismiss |
| TC-5 | モバイル幅(390px) | 正常系 | PASS（修正後） | チップ折返し、期間/公開状態ポップオーバーとも画面内に収まる（溢れなし） |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 検証中に発見・修正したバグ（変更箇所起因・即時修正）

- **ポップオーバーのモバイル左溢れ**: `max-sm:right-0` が左寄りトリガー（期間）で左にはみ出していた。トリガー位置に依存しないよう、開いた後に measure して水平クランプ（`shiftX`）する方式へ変更。
- **デスクトップでのポップオーバー全幅膨張**: `w-max`（max-content）がネイティブ `<input type="date">` の巨大な固有幅を拾い、パネルが `max-w` 上限（≒コンテンツ全幅 1248px）まで膨張していた。パネルを固定幅 `w-[280px]` にして両ポップオーバーを一定サイズに統一。
- いずれも `FilterPopover.tsx` / `FilterBar.tsx` で修正し、typecheck/lint/format/test:unit 再通過・ブラウザ再確認済み。

## agent-browser 偽陽性メモ（実装バグではない）

- agent-browser の `click @ref`（CDPマウス）でポップオーバー内のプリセットボタンを押すと、React の合成 onClick が発火せずポップオーバーだけ閉じる事象が再現。タグトグル（常設ボタン）の click は正常。
- 切り分け: 実DOMの `button.click()`（実click→React onClick発火）で「今月」を押すと URL が `?from=...&to=...` に正しく更新。**機能は正常**で、agent-browser のマウスイベント列がポップオーバーの dismiss(mousedown) と競合する偽陽性と判断（スキルの Known Issue に一致）。コード側 Issue は起票しない。
