# PR #774 レビュー — アクセシビリティ観点 (review-002)

対象: a11y: 表示モード segmented を APG Radio Group へ置き換え（Issue #660 / 元指摘 #649 W-002）
参照: `.issue/660/plan.md`（AC-1〜9）、`.issue/660/adr.md`（ADR-001〜005）、`.issue/660/review/review-001-a11y.md`（N-001〜006）

## 検証サマリ

2回目のフルレビュー。前回 review-001 で唯一の改善余地として挙げた **N-001（`aria-orientation` 未指定）/ N-002（上下キー消費の意外性）が両方とも反映済み**。`DisplayModeSwitch.tsx:81` と `PublicTopControls.tsx:380` の両 radiogroup に `aria-orientation="horizontal"` が追加され、`PublicTopControls.test.tsx:162` で SSR マークアップに固定されている。`useRovingTablist` は orientation を受け取りつつ両軸（ArrowLeft/Right + ArrowUp/Down）を等価に処理する設計なので、orientation 明示と矢印挙動の整合も取れている。

APG Radio Group パターンへの忠実性（role/aria-checked/roving/両軸矢印/Home/End/即選択/両端ラップ/未処理キー素通し）、focus-visible accent outline の全対象統一（ADR-003）、アクセシブルネーム維持、`biome-ignore`（ADR-005）まで前回どおり仕様準拠。`pnpm test:unit` 全 267 ファイル / 4174 件グリーン（aria-orientation アサーション追加分 +3）。

**ゼロベースで再監査した結果、A11y の問題点は実質ゼロ。** Blocker / Warning なし。残るのは spec モック側の `aria-orientation` 注記欠落という極めて軽微な Note 1 件のみで、実装・テストには影響しない。

### A11y

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]**（軽微・任意）spec モック（`spec/design/pages/P10-home.html:1133`, `P30-user-public-top.html:581`）の表示モード segmented は `role="radiogroup"` / `role="radio"` / `aria-checked` まで radiogroup 化されているが、実装に追加された `aria-orientation="horizontal"` が静的マークアップ側には反映されていない。モックは静的 HTML で roving 挙動を持たないため実害はなく、A11y 上の問題ではない（モックの主目的は ARIA 契約と active 表現の提示で、orientation はキーボード操作のヒント属性）。ただし「モックは正」の規約に厳密に従うなら、両モックの `<div class="segmented" role="radiogroup" aria-label="表示形式">` に `aria-orientation="horizontal"` を1属性足すと実装と完全一致する。前回 N-001 の解消が実装・テスト側に集中し、モック側に追従していない取りこぼし。優先度は低い。

- **[N-002]** 前回指摘の追跡（解消確認）:
  - **review-001 N-001（`aria-orientation` 未指定）→ 解消。** `DisplayModeSwitch.tsx:81` / `PublicTopControls.tsx:380` に `aria-orientation="horizontal"` を付与。横並び実体と SR への orientation ヒントが一致し、「左右で移動」系の告知が正確になった。`PublicTopControls.test.tsx:162` で回帰固定。
  - **review-001 N-002（上下キー消費の意外性）→ 緩和。** N-001 解消により「この radiogroup は左右操作」という期待をユーザーへ伝えられるようになり、ArrowUp/Down も両軸等価に動く（`useRovingTablist.ts:67-70` で `nextKey`/`prevKey` に加え `ArrowDown`/`ArrowUp` を常時受理）ため、上下キーを押しても選択が移動し操作不能感は生じない。N-002 で想定した「意外性」は実用上消えている。

- **[N-003]** 良好な点（APG Radio Group 忠実性・再確認）:
  - `role="radiogroup"` + `aria-label="表示形式"` + `aria-orientation="horizontal"`、各ボタン `role="radio"` + `aria-checked`（boolean → `"true"`/`"false"` シリアライズを `DisplayModeSwitch.test.tsx:123-127` / `PublicTopControls.test.tsx:149` で固定）。AC-1 充足。
  - roving tabindex：選択中のみ `tabIndex=0`・他は `-1`（`getTabIndex` は `selectedIndex` から純粋導出、内部 state なし）。`DisplayModeSwitch.test.tsx:129,417-425` で固定。Tab は segmented 全体に1停止。AC-2 充足。
  - 矢印ナビ：ArrowRight/Down→次・ArrowLeft/Up→前（`% count` 両端ラップ）・Home→先頭・End→末尾、移動先 `[role="radio"]` へ `.focus()` してから `onSelect(next)`（即選択 ADR-004）。`DisplayModeSwitch.test.tsx:294-389` が両軸/ラップ/Home/End と「移動先へ activeElement が移る」ことまで網羅。AC-3 充足。
  - `aria-required` を付けない（常に1つ選択済み）・`aria-activedescendant` を使わず roving DOM focus（ADR-002）— 固定3要素・宣言順=DOM順の前提に適合し妥当。

- **[N-004]** 良好な点（アクセシブルネーム維持）: DisplayModeSwitch はアイコンのみのため各 radio に `aria-label`（リスト/タイル/カレンダー）+ `title`、アイコンは `aria-hidden`（`DisplayModeSwitch.tsx:95-96,105`）。PublicTopControls は可視テキスト `{label}` がアクセシブルネームを供給し WCAG 2.5.3（Label in Name）も満たす。両者ともネーミング欠落なし。

- **[N-005]** 良好な点（focus-visible 知覚性・ADR-003 統一・再確認）:
  - segmented ボタン：`DISPLAY_SEGMENTED_BTN`（`note/list/styles.ts:24`）/ `SEGMENTED_BTN`（`public/styles.ts:113`）とも `focus-visible:outline-2 outline-accent`、offset 無しの外側 outline（`p-[2px]` の隙間に乗る前提）。public 側は本 PR で追加。
  - メニュー系：`menuItem`（`common/styles.ts:442`）/ `SORT_MENU_ITEM`（`public/styles.ts:120`）/ `TAG_ADD_OPTION_ITEM`（`PublicTopControls.tsx:669`）に `focus-visible:outline-2 outline-accent -outline-offset-2`（inset）+ `focus-visible:bg-surface` 併存。ViewSwitcher 確立方針の横展開で表現統一。
  - danger 項目（`menuItem` の `data-[danger]`、NoteActions 削除等）も accent outline で統一し、error 色は `text-error` + `focus-visible:bg-error-surface` が担う（ADR-003 案B）。focus リングへのセマンティクス二重持ちを避けた判断は妥当で WCAG 2.4.7 を満たす。AC-4/6 充足。

- **[N-006]** 良好な点（キーボード相互作用の健全性・再確認）: 未処理キー（Tab/Space/Enter 等）は `preventDefault` を掛けず素通し（`useRovingTablist.ts:73-74` で `next===null` なら return）。ネイティブ `<button>` の Space/Enter 活性化は caller の `onClick` が担い、矢印・click 双方が同じ `select`/`selectDisplayMode` ハンドラへ収束。`DisplayModeSwitch.test.tsx:428-442` が Tab で `defaultPrevented===false` かつ navigate 不発を固定。フォーカス移動は keydown 内のみで render/SSR 経路に載らず hydration 非干渉。`count===0` ガードもあり。キーボードトラップ・フォーカス喪失なし。

#### 観点別チェック結果

| 観点 | 結果 |
|---|---|
| Radio Group パターン忠実性（role/aria-checked/roving/両軸矢印/Home/End/即選択/ラップ） | OK（N-003） |
| `aria-orientation` 明示（前回 N-001） | OK — 実装・テスト反映済み（N-002）。spec モックのみ未追従（軽微 N-001） |
| 旧 tablist/tab/aria-selected の完全除去 | OK（表示モード segmented から除去。EditorModeSwitch/TagListToolbar はスコープ外で残置・意図どおり、`DisplayModeSwitch.test.tsx:103-105` で負固定） |
| アクセシブルネーム（アイコンのみ / Label in Name） | OK（N-004） |
| focus-visible 知覚性 / danger 含む outline 統一（WCAG 2.4.7・ADR-003） | OK（N-005） |
| キーボードトラップ / フォーカス喪失 / 未処理キー素通し | OK（N-006、両軸矢印が動くため上下キー消費の意外性は解消） |
| SR 読み上げモデル（ラジオボタン n/N・選択/未選択・orientation ヒント） | OK（N-002/N-003） |
| `querySelectorAll('[role="radio"]')` の誤動作リスク | OK — container 配下に他の `[role="radio"]` なし、宣言順=DOM順（JSDoc の index-discipline）。SortPopover/TagAddPopover は別 role で混入しない |
