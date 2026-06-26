# Plan Review — Issue #776 / Round 2（観点: 要件カバレッジ・スコープ整合性）

レビュー日: 2026-06-26
対象: `.issue/776/plan.md` / `.issue/776/adr.md`
前回: `.issue/776/plan-review/round-1-coverage.md`（P-001 / S-001〜S-003）

## サマリ

1周目指摘はすべて適切に反映されている。最重要だった P-001（manual activation の roving tabindex を「選択追従」と誤記し AC-4・ステップ6・ADR-003 が内部矛盾していた点）は、AC-4・ステップ1/6・ADR-002/003 を「矢印はフォーカスのみ移動・選択不変」「getTabIndex は manual=`focusedIndex` 由来 / automatic=`selectedIndex` 由来」「blur で `focusedIndex` をリセットせず再 Tab-in は最後にフォーカスした tab へ戻る（標準 APG 挙動）」で一貫させ、内部矛盾を解消済み。ステップ6 のテストも「初回=選択 tab tabIndex=0」「矢印後=フォーカス中 tab tabIndex=0・onChange/aria-selected 不変」の2ケースに分割され、回帰が検証可能な形になっている。

実コードと突き合わせて plan の前提も裏取りできた:
- `NoteEditor.tsx` の body は html/inline/wysiwyg の3条件分岐 → その後に常時マウントの FrontMatterEditor（plan の tabpanel ラッパー範囲・FrontMatter 除外と一致）。
- `EditorModeSwitch.tsx` は現状 `role="tablist"`/`role="tab"`/`aria-selected` + `onClick={() => onChange(tab.mode)}`、`"use client"` 無し、`pillBtn` に focus-visible outline 無し（plan ステップ3 の前提と一致）。tab inventory new=[wysiwyg,html] / edit=[inline,wysiwyg,html] も一致。
- `useRovingTablist.ts` は automatic 専用・stateless で `.focus()` セレクタが `[role="radio"]` 固定（plan ステップ1 が manual 用に role 非依存セレクタ化を明記している点と一致）。

Issue の 4 Tasks・5 Acceptance Criteria はすべて AC-1〜AC-10 に被覆され、各基準に由来と対応ステップが紐づく。スコープ外作業の混入は無い。新たな漏れ・矛盾も検出されなかった。

---

#### 問題点（要修正）

問題点ゼロ。

1周目 P-001 は完全に解消され、新規の要件漏れ・スコープ creep・矛盾は見当たらない。
（Issue AC 本文「non-selected tabs are not in the Tab order (roving tabindex)」は manual activation では文字通り常時成立はしないが、plan は AC-4 で「roving tabindex=常に1つだけ tabbable、フォーカス追従」と APG 準拠の正しい意味に解釈・明文化しており、Issue の意図を逸脱しない正当な読み替えとして妥当。）

---

#### 改善提案（検討推奨）

改善提案ゼロ（無理な粗探しはしない）。

1周目の S-001〜S-003 はいずれも反映済み:
- S-001（AC-7 の検証手段欠如）→ AC-7 を「focus 指標の新設」から「#660 segmented との parity 確認」へ緩和し、グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css 176-178 行）で WCAG 2.4.7 充足済みである前提を明記。必須機械検証の対象から外したため別途テスト追加不要、という判断が review 履歴に記録されている。
- S-002（P12 tabpanel 化対象）→ ステップ7 で `.toolbar`（1047 行）+ `.editor` content area（`role="textbox"`、1069 行）を新規 `<div role="tabpanel" id="editor-body-panel" aria-labelledby>` で囲む（role 衝突回避でラッパー側に `role="tabpanel"`）と特定済み。
- S-003（最終ゲートの lint）→ ステップ8 で AC 検証ゲートを素の `pnpm typecheck && pnpm lint && pnpm test` と明記、`lint:fix && format` は開発手順として別建てに整理済み。

---

#### 良い点

- 1周目の最重要指摘 P-001 を、AC・実装ステップ・ADR の3箇所で一貫させて解消し、review 履歴にも「内部矛盾解消」「blur 非リセット明記」「テスト2ケース分割」と具体的に追跡記録している。修正の波及を取りこぼしていない。
- 受け入れ基準表が Issue の 4 Tasks・5 AC を「由来」「対応ステップ」付きで全件トレースし、要件→基準→ステップの紐づけが一目で追える。AC-4 が automatic（radiogroup=選択追従）と manual（tabs=フォーカス追従）の roving 差を明示的に書き分けており、実装者が誤読しにくい。
- radiogroup（並び替え軸）vs Tabs（編集モード）の判断が #660 ADR-001 の基準（実体 tabpanel の有無）に忠実で、実コード（`NoteEditor` の body 条件レンダー、`onModeChange` の確認ゲート）を根拠に裏付けられている。Issue Task 2 が求める「Tabs か radiogroup かの設計判断」を ADR-002 が案A/B/C 比較付きで明示的に下している。
- 編集モードを manual activation にする理由（矢印で wysiwyg を通過しても装飾喪失ダイアログが暴発せず、既存確認ゲートが完全保存）が Issue AC「WYSIWYG 装飾喪失確認ゲートの不変」と直結し、要件保存の観点で的確。
- スコープ外（表示モード #660、editor 内部実装、P12 FrontMatter inventory 完全同期、`useRovingMenu`）が「含まれないもの」で明示され、スコープ creep が無い。AC-7 を parity 確認へ緩めた判断も、純 ARIA 是正を越える視覚変更を「必須要件」と過大化しない方向で妥当。

---

## 返答

- 問題点: 0 / 改善提案: 0
- 問題点ゼロ（1周目 P-001 解消・新規の漏れ/矛盾/スコープ creep 無し）
- 改善提案ゼロ（1周目 S-001〜S-003 はすべて反映済み）
</content>
</invoke>
