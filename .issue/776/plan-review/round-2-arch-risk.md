# Plan Review — Issue #776 / Round 2（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/776/plan.md` / `.issue/776/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
これは 2 周目（1 周目指摘の反映確認）。

結論を先に: 1 周目の P-001（manual activation の再 Tab-in / roving セマンティクス統一）および S-001/S-002/S-003/S-004 はすべて正しく反映されている。focusedIndex 駆動のレンダー中 setState 無限ループ回避・automatic 経路の後方互換・tabpanel 配線・Rules of Hooks 準拠のいずれも、実コード（`useRovingTablist.ts` / `EditorModeSwitch.tsx` / `NoteEditor.tsx` 493-544 行）と突き合わせて実現可能で矛盾なし。**問題点ゼロ**。

---

## 1 周目指摘の反映確認

- **[P-001 反映済]** ADR-003 line 92-93 / AC-4 / ステップ1 が「blur で `focusedIndex` をリセットしない → 再 Tab-in は最後にフォーカスした tab へ戻る（WAI-ARIA APG roving-tabindex 標準挙動）」で一貫。1 周目に指摘した「選択中 tab に戻る」という内部矛盾は解消され、`selectedIndex` 追従（活性化時のみ発火）と整合する記述になった。ステップ6 のテストも「初回=選択 tab tabIndex=0」「矢印後=フォーカス中 tab tabIndex=0・onChange/aria-selected 不変」の 2 ケース分割で、新セマンティクスを正しく固定している。
- **[S-001 反映済]** ADR-003 line 89 が「Rules of Hooks に従い `manualActivation` の値に関わらず常に宣言する（条件付きフック呼び出しはしない）」、Consequences line 99 が「stateless = automatic 経路は `focusedIndex` を参照しない」の正確な意味へ修正。ステップ1 line 90 も同趣旨を明記。`useRovingTablist.ts` の現状（line 54 で `useRef` を無条件宣言、stateless）と整合し、`useState(selectedIndex)` 追加は無条件宣言で実現可能。
- **[S-002 反映済]** AC-7 が「focus 指標の新設」から「#660 segmented parity 確認」へ書き換え。グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css 176-178 行）で WCAG 2.4.7 充足済みの前提が明記され、必須機械検証の対象から外れた旨も「見送った提案」節で整理。
- **[S-003 反映済]** ステップ3 に RSC 境界節を追加。実コードで確認: `EditorModeSwitch.tsx` は現状 `"use client"` 無し（line 1 が import から始まる）。フック導入後の `"use client"` 付与方針は妥当で、参照実装 `useRovingTablist.ts` 自体が `"use client"` 持ち（line 1）なので二重に安全。
- **[S-004 反映済]** ステップ4 に dangling idref 不変条件（`state.mode` は常に当該サーフェスの可視タブ集合内）を調査済み事実として明記。`NoteEditor.tsx` 514 行 `onInitFailed → setMode("html")` が inline（edit のみ）マウント時に限定される点も確認でき、new で inline に遷移する経路は無い。

---

## 問題点（要修正）

問題点ゼロ。

実コードとの突き合わせ結果:
- `useRovingTablist.ts`（48-83 行）は現状 automatic 専用・stateless・`getTabIndex` は `selectedIndex` 由来・`.focus()` は `[role="radio"]` セレクタ固定。plan ステップ1 の manual 拡張（`focusedIndex` state 常設＋ manual 経路のみ参照、`.focus()` セレクタを role 非依存化）は既存構造に無理なく載り、automatic 経路（既存 2 consumer）は無改変で動く。後方互換は型・挙動とも保たれる。
- レンダー中 `prevSelected` ref 比較 → `setFocusedIndex` は React 標準の derived-state-during-render パターン。`if (prevSelected.current !== selectedIndex)` ガードで無限ループは回避でき、plan のリスク節（148 行）でも正しく警戒済み。automatic 経路で発火しても `focusedIndex` 非参照のため無害という記述も正しい。
- `NoteEditor.tsx` 493-544 行は html/inline/wysiwyg の 3 つの独立条件ブロック（各 `<>…</>` = エディタ＋MediaUploader）、549 行に FrontMatterEditor。3 ブロックを単一 `<div role="tabpanel">` で囲み FrontMatter を外に残す配線は実現可能で、同時に 1 モードしかマウントされないため `aria-labelledby` の参照先 tab は常に実在する。
- `EditorModeSwitch.tsx` は `role="tablist"`/`role="tab"`/`aria-selected`/`onClick={() => onChange(tab.mode)}` を持つ純粋コンポーネント。`role="tab"` 維持＋ `id`/`aria-controls`/`tabIndex` 追加・manual roving 配線は既存セレクタ（`[role="tab"]`）とテストを温存しつつ実現でき、確認ゲート（onChange）は click/Enter/Space 経由のみ発火で不変。

---

## 改善提案（検討推奨）

- **[S-001]**（低優先・任意）manual 経路の roving 不変条件「常に厳密に 1 つの tab が `tabIndex=0`」は `focusedIndex ∈ [0, count)` に依存する。`count`（= surface 別タブ集合サイズ）は NoteEditor マウント時に固定で実行時に変わらないため実用上は破綻しないが、`focusedIndex` が範囲外になると全 tab が `tabIndex=-1`（グループ全体が Tab 到達不能）になる。実装時に `getTabIndex` 側で「範囲外なら 0 番目を 0 にフォールバック」する、もしくは JSDoc に「`focusedIndex` は常に `[0,count)`（surface 即ち tab 集合がマウント中不変であることが前提）」と index-discipline と並べて明記しておくと、将来 surface 可変化したときの安全弁になる。現計画の範囲では破綻しないため必須ではない。

---

## 良い点

- 1 周目指摘 5 件すべてを、文言の場当たり修正でなく ADR-003 の挙動定義そのものの一貫化（再 Tab-in = 標準 roving / stateless の正確な定義）として反映しており、ADR ↔ AC ↔ ステップ ↔ テストの 4 点が同一セマンティクスで揃った。
- radiogroup（automatic）/ Tabs（manual）の分岐を「実体 tabpanel の有無」#660 ADR-001 基準で `NoteEditor.tsx` 493-544 行の実コードに接地して判断し続けている。机上設計でない。
- manual activation 採用理由（TipTap 重量マウント＋ `onModeChange` 確認ゲートが矢印 wysiwyg 通過で暴発しない）が APG 推奨（遅延を伴うパネルは manual）と合致し、core 副作用（223-293 行）を無改変で tabpanel ラッパー追加のみに閉じる方針が健全。
- `focusedIndex` state を無条件宣言・automatic 非参照とする設計で Rules of Hooks 準拠と後方互換を両立。`.focus()` セレクタを manual で role 非依存へ広げる必要性もステップ1 で正しく認識済み。
- tabpanel ラッパー追加が body エディタ群の `mb-*` margin・flex レイアウトに与える影響をリスク節で明示し、無装飾コンテナ＋ FrontMatter 除外を不変条件化。実害は小さい（同時 1 モードのみマウントのため wrapper 内 gap は実質無関係）が、検証項目として残しているのは適切。
- id 結合を `editorModeTabId(mode)` / `EDITOR_BODY_PANEL_ID` の静的命名で済ませ生成 id 引き回しを回避、検証ゲートを Issue AC 文言どおりの素の `pnpm lint`（fix なし）に固定するなど、CLAUDE.md 規約と Issue AC の双方に忠実。

---

（ドメイン/アプリ/アダプター層への影響なし。プレゼンテーション層の a11y 変更に閉じ、依存方向違反なし。新たなリスク・矛盾は検出されず。）
