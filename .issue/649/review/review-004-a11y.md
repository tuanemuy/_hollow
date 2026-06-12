# Review 004 — アクセシビリティ（PR #659 / Issue #649, Round 4 フルレビュー）

対象: `gh pr diff 659`（15dd94b8 時点）。WAI-ARIA APG / WCAG 2.2 観点。
前提: 後回し・記録済み事項（tablist APG=#660、タイプアヘッド、AAA 当たり判定、
ローディング中 h1、h1 アクセシブルネーム合成）は再指摘しない。

## 前回指摘（R3）の修正確認

- **R3 W-001（listbox パネルの max-height）— 修正済み・概ね正しい。**
  `ViewSwitcher.tsx` の `PANEL` に `max-h-[min(60vh,400px)] overflow-y-auto` が追加され、
  保存ビュー多数・400% ズーム・低 viewport でもパネル内容にスクロールで到達できる
  （WCAG 1.4.10 / 1.4.4 充足）。roving フォーカスの `focus()` はスクロールコンテナ内で
  自動的に項目を可視域へスクロールするためキーボード到達性も保たれる。
  ただし R3 で「確認のこと」とした preventDefault との両立に未対応の点が残る（下記 W-001）。
- **R3 FE-W-001（エラーフォールバック h1 の折り返し）— 修正済み。**
  `HomePage.tsx` の `fallbackHeading` の `<h1>` に `[overflow-wrap:anywhere]` が追加され、
  長い検索語でのエラーフォールバック時もモバイル幅で横はみ出ししない（1.4.10）。

## 確認済みの主要契約（変更なし・問題なし）

- ViewSwitcher トリガー: `aria-haspopup="listbox"` / `aria-expanded` / 可視テキスト先頭の
  `aria-label` 合成（2.5.3）/ `title` / focus-visible リング / モバイル min-h 44px。
- listbox パネル: `role="listbox"` + `aria-label`、`role="option"` + `aria-selected`、
  選択項目起点の roving tabindex、矢印/Home/End、Escape + フォーカス返却、
  選択時はナビゲーション前にフォーカス返却。オプションの focus-visible は
  accent 2px インセットアウトラインで知覚可能（2.4.7 / 1.4.11）。
- DisplayModeSwitch: 各 tab に `aria-label` + `title`、SVG `aria-hidden`、
  非アクティブ ink-tertiary は 3:1 以上（1.4.11）。
- フィルタクリア ×: `aria-label` + `title`、モバイル擬似要素で 44px 相当、
  デスクトップ 28px（2.5.8 AA 充足）。
- 「ビューとして保存」の `aria-disabled` + `aria-describedby` → sr-only 理由。
- エラーフォールバックの静的 `<h1>`（DOM 順序 h1 → alert、テスト固定済み）。

## Blockers

なし。

## Warnings

### W-001: listbox パネルのスクロールバーが Firefox でドラッグ不能（onMouseDown preventDefault と同一要素）

- 場所: `app/components/common/Popover.tsx`（listbox 分岐の
  `onMouseDown={(event) => event.preventDefault()}`）+
  `app/components/note/list/ViewSwitcher.tsx` の `PANEL`（同じ要素に `overflow-y-auto`）
- 理由: R3 W-001 の提案に「パネル `onMouseDown` の preventDefault はスクロールバー操作と
  両立することを確認のこと。問題があればスクロールコンテナを内側 div に分離」と明記したが、
  修正はスクロールを `role="listbox"` の同一要素に付けたまま。Firefox は要素上の
  `mousedown` の `preventDefault()` をネイティブスクロールバーの操作にも適用するため、
  パネルがオーバーフローした状態でスクロールバーのつまみをマウスでドラッグできない。
  ホイール・トラックパッド・キーボード（roving の focus 追従）・タッチでは到達できるので
  完全な閉塞ではないが、マウス単独ユーザーの操作手段を一部奪う（保存ビューが多い場合のみ顕在化）。
  Chrome / Safari はスクロールバー操作がこの preventDefault の影響を受けないため再現しない。
- 提案: スクロールコンテナを `preventDefault` を持たない内側 div に分離する
  （`PANEL` から `max-h` / `overflow-y-auto` を内側 div へ移し、`role="listbox"` と
  roving の `panelRef` の対象は維持。あるいは listbox 分岐の `onMouseDown` を
  `event.target` がオプションボタン内のときだけ preventDefault するよう絞る）。
  menu 分岐は固定少数項目でオーバーフローしないため現状維持で可。

## Notes

### N-001: `max-h-[min(60vh,400px)]` は menuPanel 既定と独立しており影響範囲は ViewSwitcher のみ

- 共通 `menuPanel` 側は変更されておらず、既存の `<Menu>` / VisibilityPopover の挙動に
  リグレッションなし。妥当なスコープ。

### N-002: 60vh は超低高 viewport（横向きスマホ等）でも数項目分の高さを確保できる

- 例: 高さ 320px なら 192px ≒ 4〜5 項目。スクロールで全項目に到達でき 1.4.10 上の問題なし。
  記録のみ。
