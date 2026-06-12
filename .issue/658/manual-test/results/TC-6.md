# TC-6（AC-7）モバイル幅でのボトムシート表示

- 結果: **FAIL**
- セッション: verify-tc-006 / URL: http://localhost:3001/ / viewport: 375x812 / dev-admin

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | `[aria-label="タグで絞り込み"]` をクリック | パネルが開く | `role=listbox` パネルが開いた | PASS |
| 2 | listbox の getBoundingClientRect / computedStyle を確認 | `position: fixed`・画面下部・全幅（≒375px） | `position: absolute`、rect = `{x:159.4, y:101, width:55.5, height:400}`。ボタン直下に幅 55.5px のドロップダウンとして表示。ボトムシートではない | FAIL |
| 3 | パネル内スクロール（scrollTop 0→120） | シートは閉じず option がスクロール | scrollTop 120 に変化、パネルは開いたまま（scrollHeight 3375 / clientHeight 398） | PASS |
| 4 | option の height を確認 | 約 44px のタップ当たり判定 | option height = 238.75px（先頭5件すべて）。幅 55.5px のパネル内でテキストが縦に折り返した結果であり、意図した 44px タップターゲットではない | FAIL |

## 失敗詳細

- パネルの className: `absolute left-0 top-full mt-2 z-40 rounded-lg border border-hairline bg-bg shadow-md p-4 max-sm:left-0 max-sm:right-0 max-sm:w-auto sm:p-3 sm:w-[280px] sm:max-w-[calc(100vw-2rem)] max-h-[min(60vh,400px)] overflow-y-auto`
  - モバイル用は `max-sm:left-0 max-sm:right-0 max-sm:w-auto` のみで、`fixed` / `bottom-0` などのボトムシート指定が存在しない。
  - 包含ブロックが `relative inline-flex` のトリガーラッパー（幅 56px）のため、`left-0 right-0` でも幅 55.5px にしかならない。
- 結果として 375px 幅では幅 56px の縦長ストリップとして描画され、option テキストが 1 文字ずつ折り返す壊れたレイアウトになる（スクリーンショットで目視確認済み）。
- AC-7「モバイル幅でボトムシート表示」は未実装。

## 備考

- `computedStyle`: `top: 44px, bottom: -408px, left: 0, right: 0, maxHeight: 400px`（fixed ではない）。
- option 数 14（test-tag-01〜14）はすべてパネル内に列挙されており、機能自体（選択）は動作する。

## 修正後の再検証（2026-06-13）

原因は共有定数 `popoverSheetPanel` が `max-sm:fixed` / `max-sm:bottom-0` を欠いていた潜在バグ（既存の期間/公開状態ポップオーバーも同様に崩れていた）。定数を修正し、`TAG_OPTION_ITEM` に `TOUCH_TARGET` を追加（ADR 追記あり）。
- モバイル 375×812: パネル fixed・全幅 375px・画面下部密着、option 高さ 44px ✓（期間ポップオーバーもシート化 ✓）
- デスクトップ 1280×800: 従来どおりのドロップダウン ✓

**最終結果: PASS（修正後）**
