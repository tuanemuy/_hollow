# Review 003 — アクセシビリティ（PR #659 / Issue #649, Round 3 フルレビュー）

対象: `gh pr diff 659`（199ad59e 時点）。WAI-ARIA APG / WCAG 2.2 観点でのゼロベース確認。
前提: tablist の APG 不完全（矢印キー操作等）は #660 へ委譲済みのため対象外。

## 前回指摘（R2 W-001）の修正確認

修正は正しい。`ViewSwitcher.tsx` の `OPTION_ITEM` に
`focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`
が追加されており、accent（oklch 37.1% ≒ #3a3a3a、白パネル上で約 10:1）の 2px インセットアウトラインで
roving フォーカス位置が知覚可能（WCAG 2.4.7 / 1.4.11 充足）。負オフセットによりパネル端での
アウトライン切れもない。Tailwind v4 では `outline`（style: solid）+ `outline-2`（width）の併用で有効。
ADR-011 の記載どおり共通 `menuItem` 側は未変更（別課題扱い）— 妥当。

## Blockers

なし。

確認済みの主要契約（問題なし）:

- ViewSwitcher トリガー: `aria-haspopup="listbox"` / `aria-expanded`、`aria-label` は
  「{可視見出し} — ビューを切り替え」合成（`listSelectors.ts: viewSwitcherAriaLabel`）で
  検索時・非検索時とも可視テキストを先頭に含み WCAG 2.5.3 (Label in Name) を充足。
  `title` 常時レンダー（ADR-003）。テストで契約固定済み。
- listbox パネル: `role="listbox"` + `aria-label`、項目は `role="option"` + `aria-selected`、
  roving tabindex は選択項目から開始（`initialIndex`）、矢印/Home/End 移動、Escape で閉じて
  トリガーへフォーカス返却、選択時はナビゲーション前にフォーカス返却 — APG listbox パターンに適合。
  不明 viewId は見出し・aria-selected・初期フォーカスのすべてが index 0 に一致（テスト固定済み）。
- パネルは `<h1>` の外（ADR-006）で HTML content model 違反なし。menu/listbox 分岐は literal role。
- 「ビューとして保存」の `aria-disabled` + onClick ガード + `aria-describedby`→sr-only 理由
  （ADR-010）: フォーカス到達可能・理由が SR に届く。視覚は `pillBtn` の
  `aria-disabled:opacity-disabled` / `cursor-not-allowed` が効くことを確認
  （`common/styles.ts:45`）。hover ガード（`not-aria-disabled:`）も既存どおり。
- エラーフォールバックの静的 `<h1>`（ADR-009、`SectionErrorBoundary.fallbackHeading`）:
  エラー時も見出し構造が残る。テストで DOM 順序（h1 → alert）固定済み。
- DisplayModeSwitch アイコンのみ化: 各 tab に `aria-label` + `title`、SVG は `aria-hidden`。
  segmented の非アクティブ ink-tertiary (#86868b) は白/surface 上で約 3.4:1 — アイコンの
  非テキストコントラスト（1.4.11, 3:1）を充足。アクティブ状態は `aria-selected` で
  プログラマティックに伝達。
- フィルタクリア ×: `aria-label` + `title`、モバイルは擬似要素で当たり判定 44px
  （32 + 6×2）。デスクトップ 28px は WCAG 2.5.8 (AA, 24px) 充足。

## Warnings

### W-001: ViewSwitcher listbox パネルに max-height / スクロールがなく、保存ビューが多いと選択肢が画面外へ伸びる

- 場所: `app/components/note/list/ViewSwitcher.tsx` の `PANEL`（`menuPanel` ベース、
  `min-w-[240px] max-w-[calc(100vw-2rem)]` のみで縦方向の制約なし）
- 理由: 保存ビューはユーザーが無制限に増やせる一覧（既存の VisibilityPopover 等の固定少数項目とは
  性質が異なる）。項目数が多い場合や 400% ズーム / 低い viewport では、パネルが下端を越えて伸びる。
  キーボードでは `focus()` のスクロールで辿れるが、ズーム環境でのコンテンツ到達性
  （WCAG 1.4.10 Reflow / 1.4.4）が劣化し、マウスでは下端の項目に到達しにくい。
- 提案: `PANEL` に `max-h-[min(60vh,400px)] overflow-y-auto` 程度を追加する
  （パネル `onMouseDown` の preventDefault はスクロールバー操作と両立することを確認のこと。
  問題があればスクロールコンテナを内側 div に分離する）。

## Notes

### N-001: ローディング中（スケルトン表示中）はページに `<h1>` が存在しない

- 場所: `app/components/note/HomePage.tsx` / `skeletons.tsx`（ToolbarSkeleton は `aria-hidden`）
- ADR-002 / ADR-007 で明示的に許容済みのトレードオフ（エラー時は ADR-009 で手当済み）。
  一覧側の `role="status"` で読み込み中は伝わるため再指摘ではなく記録のみ。

### N-002: listbox にタイプアヘッド（先頭文字ジャンプ）がない

- 場所: `ViewSwitcher.tsx` + `useRovingMenu.ts`
- APG listbox の推奨機能だが必須ではなく、項目数が少ない想定では矢印/Home/End で十分。
  保存ビューが増えた際の改善候補として記録。

### N-003: segmented ボタンのモバイル横方向当たり判定が約 40px（44px 未満）

- 場所: `app/components/note/list/styles.ts` `DISPLAY_SEGMENTED_BTN`
  （`max-sm:after:-inset-x-0.5` → 36 + 2×2 = 40px。縦は 44px 確保済み）
- 隣接ボタンとの干渉回避としてコード内コメントで意図が明記されており、WCAG 2.5.8 (AA, 24px) は
  充足。2.5.5 (AAA, 44px) のみ部分未達 — 設計判断として許容範囲、記録のみ。

### N-004: SR の見出しナビゲーションで h1 名が「{ビュー名} — ビューを切り替え」と読まれる

- 場所: `ViewSwitcher.tsx`（`<h1>` の唯一の子がトリガーボタンのため、見出しの
  アクセシブルネームがボタンの `aria-label` になる）
- ADR-005 の合成規則（内容が先・操作が後）により実害は小さい。代替（`aria-label` を外し
  可視テキスト + sr-only 補足にする等）はトレードオフがあるため現状維持で妥当。記録のみ。
