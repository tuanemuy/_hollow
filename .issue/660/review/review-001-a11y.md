# PR #774 レビュー — アクセシビリティ観点 (review-001)

対象: a11y: 表示モード segmented を APG Radio Group へ置き換え（Issue #660 / 元指摘 #649 W-002）
参照: `.issue/660/plan.md`（AC-1〜9）、`.issue/660/adr.md`（ADR-001〜005）、`.issue/649/review/review-001-a11y.md`（W-002）

## 検証サマリ

W-002 で「APG Tabs として不完全なまま規範化された」と指摘された表示モード segmented を、ADR-001 の判断どおり `radiogroup`/`radio`/`aria-checked` + roving tabindex（`useRovingTablist`）へ置き換える変更。AC-1〜9 を実装・テスト・spec モックの 3 面で検証した。**Blocker は無し。** APG Radio Group パターンに忠実で、roving・矢印キー（両軸ラップ）・Home/End・「矢印移動で即選択」・未処理キーの素通し・focus-visible accent outline まで仕様どおり。旧 `tablist`/`tab`/`aria-selected` は表示モード segmented から完全に除去され、スコープ外の EditorModeSwitch / TagListToolbar（plan「含まれないもの」）にのみ残る（意図どおり）。`pnpm test:unit` 全 267 ファイル / 4171 件グリーン。

### A11y

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** `radiogroup` コンテナに `aria-orientation` 未指定（実装・spec モック双方）。場所: `app/components/note/list/DisplayModeSwitch.tsx:79`、`app/components/public/PublicTopControls.tsx:378`。表示は横並びだが radiogroup の暗黙 orientation は `vertical`。実害は小さい（`useRovingTablist` は ArrowLeft/Right と ArrowUp/Down の両軸を等価に処理するため、どちらの矢印でも動作し操作上の不整合は無い）が、一部 SR は orientation に応じて「左右で移動」等のヒント文言を変えるため、横並び実体に合わせて `aria-orientation="horizontal"` を明示すると告知が実体と一致してより正確になる。APG Radio Group は orientation 必須ではないため Warning ではなく Note。`useRovingTablist` が `orientation` オプションを既に持つので、付与は1属性追加で済む（任意改善）。

- **[N-002]** 横並び radiogroup が ArrowUp/Down も `preventDefault` で消費する（`useRovingTablist.ts:67-74`）。これは APG Radio Group が「全方向矢印で項目移動」を要求する仕様準拠であり正しい挙動だが、segmented にフォーカスがある間は上下キーでのページスクロールが効かなくなる。radiogroup は到達後すぐ抜けられる小さなコントロールで、Tab で離脱でき（未処理キー素通しを `DisplayModeSwitch.test.tsx:388` で固定済み）キーボードトラップにはならないため許容。N-001 で `aria-orientation="horizontal"` を明示すれば「この radiogroup は左右操作」という期待をユーザーに与えられ、上下消費の意外性も減る（N-001 と同時に解消可）。

- **[N-003]** 良好な点（APG Radio Group 準拠の確認）:
  - `role="radiogroup"` + `aria-label="表示形式"`、各ボタン `role="radio"` + `aria-checked`（選択 `true` / 非選択 `false`、boolean が `"true"`/`"false"` へシリアライズされることを `DisplayModeSwitch.test.tsx:123-127` / `PublicTopControls.test.tsx:149` で固定）。AC-1 充足。
  - roving tabindex: 選択中のみ `tabIndex=0`・他は `-1`（`getTabIndex` は `selectedIndex` から純粋導出、内部 state 無し）。`DisplayModeSwitch.test.tsx:129,377-386` で固定。Tab は segmented 全体に1停止。AC-2 充足。
  - 矢印ナビ: ArrowRight/Down→次・ArrowLeft/Up→前（`% count` で両端ラップ）・Home→先頭・End→末尾、移動先 `[role="radio"]` へ `.focus()` してから `onSelect(next)`（「矢印移動で即選択」ADR-004）。`DisplayModeSwitch.test.tsx:294-348` が ArrowRight/ArrowLeft ラップ/Home/End を網羅。AC-3 充足。
  - `aria-required` を付けていない（segmented は常に1つ選択済みで必須ラジオではない）— 正しい。`aria-activedescendant` を使わず roving DOM focus を採用（ADR-002）も、常時表示・固定3要素・宣言順=DOM順という前提に適合し妥当。
  - 旧 `tablist`/`tab`/`aria-selected` の完全除去をテストが負で固定（`DisplayModeSwitch.test.tsx:103-105`）。AC-1 の除去要件を回帰で担保。

- **[N-004]** 良好な点（アクセシブルネーム維持）: DisplayModeSwitch はアイコンのみ（#626 ADR-001）のため各 radio に `aria-label`（リスト/タイル/カレンダー）+ `title` を維持し、アイコンは `aria-hidden`（`DisplayModeSwitch.tsx:94-95,104`）。PublicTopControls は可視テキスト `{label}` がアクセシブルネームを供給するため `aria-label` 不要で WCAG 2.5.3（Label in Name）も満たす。両者ともネーミング欠落なし。

- **[N-005]** 良好な点（focus-visible 知覚性・ADR-003 統一）: AC-4/6 を全対象で確認。
  - segmented ボタン: `DISPLAY_SEGMENTED_BTN`（home, `styles.ts:16`）/ `SEGMENTED_BTN`（public, `public/styles.ts:112`）とも `focus-visible:outline-2 outline-accent`、offset 無しの外側 outline（`p-[2px]` の隙間に乗る前提・plan S-004 / ステップ3の注意どおり）。public 側は本 PR で追加（従前欠落）。
  - メニュー系: `menuItem`（`common/styles.ts:441`）/ `SORT_MENU_ITEM`（`public/styles.ts:119`）/ `TAG_ADD_OPTION_ITEM`（`PublicTopControls.tsx:668`）に `focus-visible:outline-2 outline-accent -outline-offset-2`（inset）を追加、`focus-visible:bg-surface` は併存維持。ADR-011 が ViewSwitcher で確立した方針の横展開で表現が統一。
  - danger 項目: `menuItem` の danger 変種（NoteActions 削除等）も accent outline で統一し、error 色は `text-error` + `focus-visible:bg-error-surface` が担う（ADR-003 案B）。focus リングにセマンティクスを二重持ちさせない判断は妥当で、フォーカス可視性は accent で 3:1 を満たす。

- **[N-006]** 良好な点（キーボード相互作用の健全性）: 未処理キー（Tab/Space/Enter 等）では `preventDefault` を掛けず素通し（`useRovingTablist.ts:73`）。ネイティブ `<button>` の Space/Enter 活性化は caller の `onClick` が担い、矢印・click 双方が同じ `select`/`selectDisplayMode` ハンドラへ収束。`biome-ignore lint/a11y/useSemanticElements`（ADR-005）も全 radio に理由付きで併記。フォーカス移動は keydown 内のみで render/SSR 経路に載らず hydration 非干渉。`count===0` ガードもあり（固定3要素のため到達しないが防御的に妥当）。

#### 観点別チェック結果

| 観点 | 結果 |
|---|---|
| Radio Group パターン忠実性（role/aria-checked/roving/矢印/Home/End/即選択/ラップ） | OK（N-003） |
| 旧 tablist/tab/aria-selected の完全除去 | OK（表示モード segmented から除去。EditorModeSwitch/TagListToolbar はスコープ外で残置・意図どおり） |
| aria-label（アイコンのみのアクセシブルネーム） | OK（N-004） |
| focus-visible 知覚性 / danger 含む outline 統一（WCAG 2.4.7・ADR-003） | OK（N-005） |
| キーボードトラップ / フォーカス喪失 / 未処理キー素通し | OK（N-006、上下キー消費は仕様準拠 N-002） |
| aria-required を付けない / aria-activedescendant 不使用の妥当性 | OK（N-003） |
| SR 読み上げモデル（ラジオボタン n/N・選択/未選択） | OK。aria-orientation 明示でさらに正確化可（N-001） |
| `querySelectorAll('[role="radio"]')` の誤動作リスク | OK — container 配下に他の `[role="radio"]` は無く、宣言順=DOM順（JSDoc の index-discipline）で caller index と DOM index が一致。SortPopover/TagAddPopover は別 role（menuitemradio/option）で混入しない |
