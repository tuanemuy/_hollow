# Frontend レビュー — PR #780

**対象:** PR #780 — Issue #776: 残りの不完全 role=tablist パターンの APG 是正
**レビュー者:** Frontend（コンポーネント設計・状態管理・フック実装）
**日付:** 2026-06-26

---

## Blockers

なし

---

## Warnings

### [W-001] useRovingTablist の manual 経路での onSelect 型定義の安全性確認

**説明:** discriminated union で `UseRovingTablistManual` が `onSelect?: (index: number) => void` を optional に設定している。呼び出し側（line 162 `onSelect?.(next)`）は optional-call 演算子で保護されており、manual 経路では onSelect が呼ばれない設計。ただし type-level での保証が重要。

**場所:** `app/components/common/useRovingTablist.ts:85-89` / line 162

**理由:** manual activation では矢印キーで `onSelect` を呼ばず、caller の native click が activation を担当する設計。type ガードで「manual では onSelect 不要」を表現する discriminated union が ADR-004 の決定。

**検証状況:** ✅ 実装は ADR-004 に従い discriminated union が正確に設計されている（automatic は onSelect 必須、manual は optional）。既存 consumer（DisplayModeSwitch / PublicTopControls）は manualActivation 未指定で Automatic に解決され無改変動作。EditorModeSwitch は manualActivation: true で manual に解決。型推論が正確。問題なし。

---

### [W-002] NoteEditor の tabpanel ラッパーが dangling aria-labelledby idref でないか確認

**説明:** NoteEditor line 507 で `aria-labelledby={editorModeTabId(state.mode)}` が常にレンダー済み tab id を指すことが保証されるか確認必要。

**場所:** `app/components/note/editor/NoteEditor.tsx:504-508`

**理由:** aria-labelledby が参照先の id を持たない場合は invalid ARIA。state.mode が常に EditorModeSwitch の可視タブ集合内に留まることが前提。

**検証状況:** ✅ plan ADR-002 でこの不変条件を明記済み「`state.mode` は常に当該サーフェスの可視タブ集合の要素で、dangling idref にならない」。実装上：
  - `surface === "new"` → state.mode ∈ {wysiwyg, html} のみ（InlineEditor は new で表示されない、onInitFailed で inline→html）
  - `surface === "edit"` → state.mode ∈ {inline, wysiwyg, html}
  
EditorModeSwitch も同じ surface に応じて tab inventory を生成するため、対応関係が保証される。問題なし。

---

### [W-003] EditorModeSwitch の "use client" ディレクティブ — RSC 境界の整合性

**説明:** EditorModeSwitch が `"use client"` を明示的に付与した（line 1）。既に NoteEditor（client 境界内）で利用されているため、付与しなくても動作するが、future-proof な良い実装。

**場所:** `app/components/note/editor/EditorModeSwitch.tsx:1`

**理由:** useRovingTablist（useState / useRef）を直接呼ぶため、参照実装 DisplayModeSwitch に倣い client フックであることを明示。

**検証状況:** ✅ plan ステップ3 で「参照実装 DisplayModeSwitch に倣い先頭に `"use client"` を付与」と明記済み。typecheck/build で RSC 境界を割っていないこと（親 NoteEditor が既に client）を確認。実装が正確で問題なし。

---

## Notes

### [N-001] discriminated union による型安全性が high level

**詳細:** `UseRovingTablistOptions` を discriminated union で表現することで、「automatic だが onSelect なし」という不正状態を型レベルで排除。既存 consumer の推論を壊さない（automatic が既定で onSelect 必須のままで機能）。ADR-004 で実装時確定した型設計として optimal。

**参考:** `app/components/common/useRovingTablist.ts:71-93`

---

### [N-002] Rules of Hooks を正確に守った focusedIndex state の条件分岐外宣言

**詳細:** line 111 で `const [focusedIndex, setFocusedIndex] = useState(selectedIndex)` が常に宣言され、automatic 経路はこの state を参照しない設計。条件付きフック呼び出し（`if (manualActivation) useState(...)`）を避け、React の rules を厳密に守っている。

**実装の正確性:** 条件分岐は getTabIndex 導出時とキーハンドラ内に限定（line 127-131, line 156-163）。state 宣言自体は条件外なため無条件実行。

**参考:** `app/components/common/useRovingTablist.ts:49-51` のコメント、line 111

---

### [N-003] Render-time 調整で無限ループを防止する prevSelectedRef ガード

**詳細:** line 112-120 で `prevSelectedRef.current !== selectedIndex` の比較ガードで、render-time での setState（line 119 `setFocusedIndex(selectedIndex)`）が無限ループに陥るのを防止。derived-state 調整パターン（React の推奨形）を正確に実装。

**安全性:** 各 render で 1 回のみ setState が発火し、次 render では prev ref が更新されているため再度の条件判定は false になる。accumulation guard が effective。

**参考:** `app/components/common/useRovingTablist.ts:114-120`

---

### [N-004] 既存 consumer（DisplayModeSwitch / PublicTopControls）の後方互換性が完全

**詳細:** 両 consumer は `manualActivation` を指定せず、既定の `false` で automatic activation のまま。useRovingTablist の automatic 経路は focusedIndex を参照しないため、state が常設されても挙動は現状と identical。

**テスト確認:** DisplayModeSwitch.test / PublicTopControls.test が既存テストで全グリーン維持（差分では新規テストは不追加、既存パス維持）。

**参考:** 
  - `app/components/note/list/DisplayModeSwitch.tsx:70-74` (onSelect 渡し継続)
  - `app/components/public/PublicTopControls.tsx:315-319` (onSelect 渡し継続)

---

### [N-005] manual activation の矢印キー挙動が標準 APG 仕様に忠実

**詳細:** EditorModeSwitch の manual 経路では、ArrowLeft/Right/Home/End が focusedIndex 更新 + .focus() のみで、onSelect を呼ばない（line 156-159）。このため wysiwyg を通過する矢印移動でも確認ダイアログが暴発しない。activation は native button click（Space/Enter）に限定（ADR-002）。

**テスト検証:** editorModeSwitch.test 行 142-158 で「矢印で focusedIndex / roving tabindex が移動し、aria-selected は不変、onChange 未呼出」を検証。行 172-179 で「click は onChange を呼ぶ」を検証。manual activation の 2 系統を separation of concern で表現。

**参考:**
  - `app/components/note/editor/__tests__/editorModeSwitch.test.tsx:142-170`
  - 実装 `app/components/common/useRovingTablist.ts:156-163`

---

### [N-006] focus-visible outline が #660 segmented パターンとの parity を取得

**詳細:** TagListToolbar の SEGMENTED_ITEM（tag/styles.ts line 97）と EditorModeSwitch のタブ（line 27: tabFocusVisible）が同形の `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` 定数を共用。DisplayModeSwitch の DISPLAY_SEGMENTED_BTN と視覚的統一（AC-7）を達成。

**スタイル品質:** グローバル `:focus-visible { box-shadow: var(--shadow-focus) }` 既設（index.css 176-178）との組み合わせで WCAG 2.4.7 充足。新規 outline は AC-7 の parity 確認。

**参考:**
  - `app/components/tag/styles.ts:97`
  - `app/components/note/editor/EditorModeSwitch.tsx:24-27`

---

### [N-007] TagListToolbar の radiogroup / radio / aria-checked 契約が完全

**詳細:** TagListToolbar line 151-154 で `role="radiogroup"` + `aria-orientation="horizontal"` を公開。line 161-162 で各ボタンが `role="radio"` + `aria-checked={s === optimistic.sort}` を持つ。旧 tablist/tab/aria-selected が完全に置き換わり、テストで「no tablist remaining」を検証（TagListToolbar.test line 239-241）。

**実装の正確性:** roving tabindex が `selectedIndex` から導出（automatic）され、矢印で即選択・navigate するラジオグループの標準パターン。DisplayModeSwitch の radiogroup 参照実装と形状が identicalで、保守性が high。

**参考:**
  - `app/components/tag/TagListToolbar.tsx:147-171`
  - テスト `app/components/tag/__tests__/TagListToolbar.test.tsx:232-257`

---

### [N-008] EditorModeSwitch のタブパネル配線（aria-controls / id）が stable な static 命名

**詳細:** editorModeTabId ヘルパー（line 14）と EDITOR_BODY_PANEL_ID 定数（line 22）で tab ↔ panel 結合を static id で管理。NoteEditor の tabpanel ラッパーから同じ定数をimport（line 507）して参照先を統一。id 生成競合 / dangling ref のリスク zero。

**設計品質:** 「生成 id の引き回し」を避け、static naming で首尾一貫性を保証（plan 「static id 命名で結合」）。将来の保守でも id スキーム変更が 1 箇所（editorModeTabId）で済む。

**参考:**
  - `app/components/note/editor/EditorModeSwitch.tsx:8-22`
  - `app/components/note/editor/NoteEditor.tsx:507`

---

## サマリ

| 項目 | 結果 |
|---|---|
| Blockers | 0 |
| Warnings | 3（いずれも検証済みで問題なし） |
| Notes | 8（design / implementation quality が high） |

### 結論

PR #780 は計画（plan.md / adr.md）に正確に従い、以下を達成している：

1. **useRovingTablist の discriminated union** — automatic / manual の 2 path を型レベルで厳密に表現。既存 consumer 後方互換性 100%。
2. **EditorModeSwitch 完全な APG Tabs（manual）化** — focusedIndex 追従の roving tabindex、矢印でフォーカス移動のみ、click で確認ゲート保存。確認ダイアログ暴発防止。
3. **TagListToolbar の radiogroup 化** — tablist/tab/aria-selected 完全置換、自動選択パターンで標準化。
4. **NoteEditor の tabpanel ラッパー** — unstyled で layout 不変、static id で dangling ref zero。FrontMatter 外置き確認（#697）。
5. **テスト品質** — radiogroup / tabs / aria-labelledby 契約検証が comprehensive。矢印キー automatic/manual 差の検証が明確。
6. **コンポーネント設計品質** — Rules of Hooks 準拠、type safety 最大化、derived-state の無限ループ防止ガード precise。

**承認:** ✅ frontend の観点で合格。AC-1 ~ AC-9 の受け入れ基準を満たし、既存機能の不変性が保証される。

