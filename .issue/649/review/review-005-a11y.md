# Review 005 — アクセシビリティ（PR #659 / Issue #649, Round 5）

対象: `gh pr diff 659`（head `b7666b08`、R4 head `15dd94b8` との差分は
`Popover.tsx` + `Popover.test.tsx` のみ）。WAI-ARIA APG / WCAG 2.2 観点。
前提: 後回し・記録済み事項（tablist APG=#660、タイプアヘッド、AAA 当たり判定、
ローディング中 h1、h1 アクセシブルネーム合成、menuItem の focus 視認性=ADR-011 ほか
R1〜R4 の Notes）は再指摘しない。

## R4 W-001 の修正確認 — 修正済み・正しい

`Popover.tsx` listbox 分岐の `onMouseDown` が
`if (event.target !== event.currentTarget) { event.preventDefault(); }` に変更された。

- **Firefox スクロールバードラッグ（指摘の本体）**: スクロールバー上の `mousedown` は
  `event.target` がパネル自身（`role="listbox"` の div、`overflow-y-auto` を持つ要素）に
  なるため preventDefault されず、Firefox でもつまみのドラッグが機能する。
  ドキュメントレベルの outside-dismiss はコンテナ内なので発火せず、Firefox は
  スクロールバー操作でフォーカスを移動しないため `onFocusOut` 経由の close も起きない。
  パネルは開いたままスクロールできる。指摘どおりの解消。
- **click-drop ガードの本来目的は維持**: ViewSwitcher のオプションは
  `role="option"` の `<button>`（パネルの子）で、テキスト上の mousedown も
  `event.target` はボタン要素（テキストノードはイベントターゲットにならない）。
  常に `target !== currentTarget` となり preventDefault が効く。macOS Safari/Firefox の
  「button mousedown → body へ blur → onFocusOut close → click が unmount 済み要素に落ちる」
  というドロップは引き続き防止される。オプション選択時の roving フォーカス維持・
  `close()`（トリガーへのフォーカス返却）→ navigate の順序も無変更で保たれる。
- **menu / dialog 分岐は無変更**: menu は無条件 preventDefault のまま
  （固定少数項目でオーバーフローしない、R4 で現状維持可と判断済み）、dialog は
  ガードなしのまま（フォーム入力のフォーカス確保）。スコープが適切。
- **テスト**: `Popover.test.tsx` の `it.each` が 4 ケース
  （menu/child=prevented、listbox/child=prevented、listbox/panel=not prevented、
  dialog/child=not prevented）に拡張され、分岐ごとの契約が固定された。
  さらに「inside mousedown は outside-dismiss にならない」のアサーションも
  各ケースで維持。ローカルで 13 tests pass を確認。

## 新規問題の確認

差分（Popover listbox 分岐の条件化のみ）を起点に、関連する操作経路を確認した。
Blocker / Warning に該当する新規問題はなし。

## Blockers

なし。

## Warnings

なし。

## Notes

### N-001: パネル余白（`menuPanel` の `py-1`）への mousedown が light-dismiss になる（挙動変化・許容範囲）

- 場所: `app/components/common/Popover.tsx`（listbox 分岐）+
  `app/components/common/styles.ts` の `menuPanel`（`py-1`）
- 内容: 修正前はパネル上下の 4px 余白への mousedown も preventDefault されて
  パネルが開いたままだったが、修正後は preventDefault されないため、
  macOS Safari/Firefox ではアクティブ要素が body へ blur →
  `onFocusOut` でパネルが閉じる（フォーカスはトリガーに返らず body へ）。
  デッドスペースのクリックで閉じるのは light-dismiss として自然な挙動であり、
  マウス起点の操作にのみ生じる（キーボード操作には影響なし）ため WCAG 上の
  問題はない。記録のみ・修正不要。

### N-002: Chrome/Safari のスクロールバー mousedown もパネルターゲットだが副作用なし

- Chrome/Safari はスクロールバー操作で focus を移動せず、`target` はパネル自身で
  preventDefault もされないため、修正後も全ブラウザでスクロールバー操作中に
  パネルが閉じない。記録のみ。

## 判定

A11y 観点: **承認**（Blocker 0 / Warning 0 / Notes 2）。
