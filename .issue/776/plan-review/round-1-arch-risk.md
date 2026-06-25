# Plan Review — Issue #776 / Round 1（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/776/plan.md` / `.issue/776/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

結論を先に: 計画は #660 で確立した radiogroup パターン・`useRovingTablist` 設計に忠実で、radiogroup vs Tabs の判断（実体 tabpanel の有無）を実コードで検証した上で正しく分岐しており、スコープも適切。実現可能。ただし ADR-003 の「再 Tab-in で選択中 tab に戻る」という挙動記述が、同じ ADR が描く focusedIndex 駆動の実装と整合しない点が 1 件ある。

---

#### 問題点（要修正）

- **[P-001]** ADR-003 / plan ステップ1 の manual activation 記述が内部矛盾している（「Tab 離脱後の再 Tab-in は選択中 tab に戻る（`selectedIndex` 追従で担保）」）
  - 理由: ADR-003 は (a) `getTabIndex` を `focusedIndex` 由来にする、(b) `focusedIndex` の `selectedIndex` 追従は「`selectedIndex` が**外部変化**したらレンダー中調整（`prevSelected` ref 比較 → `setFocusedIndex`）」と定義している。この追従はソート/モードが**活性化された**ときにしか発火しない。矢印で wysiwyg にフォーカス移動しただけ（活性化なし）では `selectedIndex` は変わらないため `focusedIndex` は移動先に留まり、`getTabIndex` も移動先を `tabIndex=0` にする。よって Tab で離脱して再 Tab-in すると「最後にフォーカスした tab」に戻り、「選択中 tab」には戻らない。記述した挙動は実装どおりには得られない。
  - 提案: WAI-ARIA APG の roving-tabindex は「最後にフォーカスした要素に tabindex=0 が残り、再 Tab-in はそこへ戻る」が標準挙動で、これは許容される（むしろ自然）。よって **記述を「再 Tab-in は最後にフォーカスした tab へ戻る（標準 roving 挙動）」に修正**するのが最小コスト。どうしても「選択中 tab に戻す」を実現したいなら blur で `focusedIndex` を `selectedIndex` にリセットするハンドラが追加で要る旨を明記する（複雑度増・APG 上は不要）。本件は AC ではないため標準挙動採用を推奨。

---

#### 改善提案（検討推奨）

- **[S-001]** 「automatic 経路は stateless 維持」の表現は Rules of Hooks 上やや誤解を招く
  - 理由: `manualActivation` を boolean オプションにする以上、`useState(focusedIndex)` は条件分岐の外で**常に呼ばれる**（フックの条件呼び出しは禁止）。「automatic は stateless」は厳密には「automatic は `focusedIndex` state を**読まない**（`getTabIndex` は `selectedIndex` 由来、矢印は `onSelect` 即発火）」の意味である。実装者が `if (manualActivation) { useState(...) }` のような条件フック呼び出しに走らないよう、JSDoc / plan で「state は常設だが automatic 経路は参照しない」と明記すると安全。レンダー中調整（`setFocusedIndex`）も automatic で発火しても無害な形（`focusedIndex` が `selectedIndex` を追うだけ）にしておくか、manual 限定にガードするかを実装時に固定するとよい。

- **[S-002]** AC-7 の前提「focus-visible outline が欠如」は実態をやや過大評価している
  - 理由: `app/styles/index.css` に `:focus-visible { outline: none; box-shadow: var(--shadow-focus) }`（`--shadow-focus: 0 0 0 2px var(--color-accent)`、tokens.css 122行）のグローバル focus ring が全 focusable に適用済み。よって TagListToolbar segmented / EditorModeSwitch tab はキーボードフォーカス時に既にアクセント box-shadow リングを表示しており、WCAG 2.4.7 は既に概ね満たされている可能性が高い。`DISPLAY_SEGMENTED_BTN` が更に専用 `outline-accent` を載せているのは #660 で確立したパターンで、狭い segmented 内での視認性向上・系統間の見た目統一が目的。提案: 本変更を「focus 指標の新設」ではなく「#660 segmented パターンとの**parity**（専用 outline の付与）」として位置づけると正確。追加自体は妥当（賛成）。

- **[S-003]** `EditorModeSwitch.tsx` は現状 `"use client"` ディレクティブ無し。`useRovingTablist`（`useState`/`useRef`）導入後の扱いを確認
  - 理由: 現状は `NoteEditor`（client）配下でのみレンダーされるためフックを使わず成立している。フック導入後も client サブツリー内の子モジュールなので RSC 境界上は動くと見込まれるが、`DisplayModeSwitch.tsx`（参照実装）は `"use client"` を明示している。整合性と将来の単独利用に備え、`EditorModeSwitch` にも `"use client"` を付すか、付けなくても境界を割らないことを typecheck/ビルドで確認する旨を 1 行加えると安全。

- **[S-004]** tabpanel の `aria-labelledby={editorModeTabId(state.mode)}` が常にレンダー済み tab を指す不変条件を明記
  - 理由: `aria-labelledby` が存在しない tab id を指すと dangling idref になる。確認した結果、初期 mode は new=`wysiwyg` / edit=`inline`（editorState 243行）で、new サーフェスには inline タブが無いが、new で `inline` に遷移する経路は存在せず（inline タブ非表示、`onInitFailed → setMode("html")` は inline マウント時=edit のみ）、`state.mode` は常に当該サーフェスのタブ集合内に収まる。よって本件はすでに満たされているが、ステップ4の実装メモに「`state.mode` は常に可視タブ集合の要素である（dangling idref にならない）」と明記しておくと回帰時の安全弁になる。step 6 の任意回帰（tabpanel の aria-labelledby がアクティブ tab id を指す）でも軽くカバーできる。

---

#### 良い点

- radiogroup vs APG Tabs の分岐を「実体 tabpanel の有無」という #660 ADR-001 の判断基準で一貫させ、**実コードで検証**している（並び替え軸=URL 駆動・兄弟パネル無し→radiogroup、編集モード=`NoteEditor` 493-544行の `state.mode` 条件レンダー=実体パネル有り→Tabs）。設計判断が机上でなく実装事実に接地している。
- ADR-002 の manual activation 採用理由（WYSIWYG 切替の TipTap 重量マウント + `onModeChange` の未保存 `window.confirm` / 装飾喪失 `ConfirmDialog` ゲートが、矢印で wysiwyg を通過しても**暴発しない**）が APG 推奨（パネル表示が大きな変化・遅延を伴う場合は manual）と合致し、既存確認ゲート挙動の完全保存と両立している。core の副作用（223-293行）に手を入れず tabpanel ラッパー追加のみで完成させる方針も健全。
- `role="tab"` を維持して既存 `[role="tab"]` セレクタ（editorModeSwitch.test 57行 / noteEditorModeChange.test 128行）を温存し、テスト churn を最小化する判断が現実的。
- `useRovingTablist` の `manualActivation` を既定 false にし、既存 2 consumer（DisplayModeSwitch / PublicTopControls、いずれも automatic）の後方互換を担保。`.focus()` セレクタを `[role="radio"]` 固定から role 非依存へ広げる必要性（manual=tab）もステップ1で正しく認識済み（automatic 側は container 内に radio しか無いため無回帰）。
- id 結合を `editorModeTabId(mode)` ヘルパー + `EDITOR_BODY_PANEL_ID` 定数の静的命名で済ませ、生成 id の引き回し結合を避けている（#660 ADR-001 案A で懸念された結合増を回避）。
- focus-visible を `DISPLAY_SEGMENTED_BTN` と同形の utility（`focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`）+ module-scope 定数で付与し、CLAUDE.md の utility-first / data-* / トークン規約に準拠。`-outline-offset` を付けない判断も既存と一致。
- AC トレーサビリティ表が検証可能な粒度で、スコープ除外（表示モード #660 / editor 内部ロジック / FrontMatter / P12 inventory 再同期は spec-sync 領域）と理想形の追求しすぎ回避が明示されている。リスク節でレンダー中 setState の無限ループを正しく警戒し、discriminated-union 化は「実装時評価」に留めて過剰設計を避けている。
- happy-dom での矢印キー回帰を `dispatchEvent(KeyboardEvent)` + `act()` でラップする DisplayModeSwitch.test 流儀を踏襲し、manual の肝（矢印で `onChange` 未呼出 / Enter・click で呼出）をテスト対象に据えている。

---

（ドメイン/アプリ/アダプター層への影響なし。プレゼンテーション層の a11y 変更に閉じており、依存方向違反なし。）
