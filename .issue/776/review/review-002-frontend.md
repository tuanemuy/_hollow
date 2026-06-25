# Frontend レビュー（2周目）— PR #780

**対象:** PR #780 — Issue #776: 残りの不完全 role=tablist パターンの APG 是正
**レビュー者:** Frontend（コンポーネント設計・状態管理・フック実装の正しさ・後方互換）
**日付:** 2026-06-26
**レビュー周期:** 2周目フルレビュー

---

## Blockers

なし

---

## Warnings

なし

---

## Notes

### [N-001] discriminated union による type narrowing が完璧に機能

**詳細:** `UseRovingTablistOptions` の discriminated union が、automatic / manual の分岐時に型レベルで確実に動作。

- automatic（既定）: `onSelect` **必須** → DisplayModeSwitch / PublicTopControls の既存呼び出しは `manualActivation` 未指定のまま無改変で通る（後方互換）
- manual（`manualActivation: true`）: `onSelect` **optional** → EditorModeSwitch は `onSelect` を渡さない実装が正確に型チェック済み（line 81-85）

**実装品質:** CLAUDE.md の「不正状態を型レベルで排除する」原則を完全に達成。「automatic だが onSelect なし」という無効な状態が type-system で不可能に。

**参考:**
  - `app/components/common/useRovingTablist.ts:71-93` (discriminated union 定義)
  - `app/components/note/editor/EditorModeSwitch.tsx:81-85` (manual 側の onSelect 省略)
  - `app/components/note/list/DisplayModeSwitch.tsx:70-74` (automatic 側の onSelect 継続)

---

### [N-002] focusedIndex の clamping が future-safe な安全弁として機能

**詳細:** `getTabIndex` の導出ロジック（line 125-131）で `focusedIndex` が valid range 外だった場合、0 にクランプ。

```typescript
const activeIndex =
  manualActivation && focusedIndex >= 0 && focusedIndex < count
    ? focusedIndex
    : manualActivation
      ? 0
      : selectedIndex;
```

**安全性:** count が変わる scenario（現在のコードでは発生しないが）でも、常に「exactly 1 つの element が `tabIndex=0`」不変条件を保証。グループが Tab で到達不能になる退行を防止（arch-risk S-001 の安全弁）。

**参考:** `app/components/common/useRovingTablist.ts:52-58` (JSDoc)

---

### [N-003] render-time derived-state 調整が無限ループ完全防止

**詳細:** line 117-120 の `prevSelectedRef.current !== selectedIndex` ガードで、render-time の `setFocusedIndex(selectedIndex)` が安全に 1 回のみ発火。

**実装パターン:** React の推奨 derived-state adjustment（ref 比較による guard）を正確に実装。ref 更新と state 更新が同期的に行われるため、次 render での比較は false に確定（accumulation 不可）。

**参考:** `app/components/common/useRovingTablist.ts:114-120`

---

### [N-004] manual activation の矢印キー挙動が標準 APG 仕様に完全に忠実

**詳細:** EditorModeSwitch では ArrowLeft/Right/Home/End が `focusedIndex` 更新のみ（line 159）で `onSelect` を呼ばない。このため：
- wysiwyg 通過時に確認ダイアログが暴発しない（ADR-002 の main goal）
- 既存の確認ゲート（`NoteEditor.onModeChange`）は click / Enter / Space 経由でのみ発火（AC-6）

**テスト検証:**
  - `editorModeSwitch.test.tsx:142-167` — arrow で `onChange` が呼ばれない確認（W-001）
  - `editorModeSwitch.test.tsx:266-274` — click で `onChange` が呼ばれる確認
  - `editorModeSwitch.test.tsx:276-284` — Tab は preventDefault されない（native focus move を妨げない）

**参考:**
  - `app/components/common/useRovingTablist.ts:156-163` (automatic / manual の分岐)
  - `app/components/note/editor/NoteEditor.tsx:223-293` (onModeChange の確認ゲート)

---

### [N-005] tabpanel の aria-labelledby idref が dangling しないことを test で保証

**詳細:** noteEditorModeChange.test.tsx の新規テスト「labels the body tabpanel with the active tab and re-points it on switch」（新規スコープ）が、以下を検証：
- tabpanel が存在し `id="editor-body-panel"` を持つ
- 初期状態（edit surface, inline mode）で aria-labelledby が inline tab id を指す
- tab click で mode switch → aria-labelledby が新しい active tab id へ追従

**不変条件保証:** `state.mode` が常に当該 surface の可視タブ集合内という前提（plan ADR-002）を、実装を通じて test で验证。dangling idref ゼロ。

**参考:** `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx` (新規テスト)

---

### [N-006] NoteEditor の tabpanel ラッパーが layout を非破壊に保証

**詳細:** line 504-561 で body 3 分岐を囲む tabpanel div は、role / id / aria-labelledby のみで unstyled。

**layout 保全:** body エディタ群の mb-* margin が阻害されず、FrontMatterEditor は tabpanel 外に置かれ排他タブではない状態を維持（#697）。

**実装品質:** コンテナに無余分な style を加えない discipline。tabpanel は focusable 子（エディタ）を常に含むため自身の tabIndex は不要（APG）。

**参考:** `app/components/note/editor/NoteEditor.tsx:504-561`

---

### [N-007] automatic activation の arrow = select パターンが Tag sort axis で正確に実装

**詳細:** TagListToolbar では ArrowRight/Left/Home/End が `onSelect(next)` を即呼び出し（line 162）、`run({ type: "setSort" })` → router.navigate が同期。

**テスト検証:**
  - `TagListToolbar.test.tsx:263-274` — ArrowRight で select & navigate
  - `TagListToolbar.test.tsx:276-286` — ArrowLeft で wrap & navigate
  - `TagListToolbar.test.tsx:288-299` — Home/End で jump & navigate

**参考:**
  - `app/components/tag/TagListToolbar.tsx:115-123` (roving 配線)
  - `app/components/tag/styles.ts` (SEGMENTED_ITEM の focus-visible)

---

### [N-008] Rules of Hooks を厳密に守った focusedIndex state 宣言

**詳細:** line 111 の `const [focusedIndex, setFocusedIndex] = useState(selectedIndex)` が条件分岐外で常に宣言（Rules of Hooks）。

- automatic 経路: この state を **参照しない** → `getTabIndex` は `selectedIndex` 由来（line 127-131 の else branch）
- manual 経路: この state を **読む** → `getTabIndex` は `focusedIndex` 由来

**React 規律:** 条件付きフック呼び出し（`if (manualActivation) useState(...)`）を避け、state 宣言順が常に一定。hook の内部 list が stable。

**参考:** `app/components/common/useRovingTablist.ts:49-51` (JSDoc), line 111, line 127-131

---

### [N-009] テスト coverage が manual / automatic の差を明確に区別

**詳細:** editorModeSwitch.test と TagListToolbar.test が、同じ `useRovingTablist` を使いながらも操作モデルの違いを検証：

**manual (EditorModeSwitch):**
- ArrowRight で focus 移動 → `aria-selected` 不変、`onChange` 未呼出（line 142-167）
- click で activation → `onChange` 呼ぶ（line 266-274）

**automatic (TagListToolbar):**
- ArrowRight で selection 移動 + navigate 発火（line 263-274）
- click でも同じ navigate logic（click と矢印が収束）

**テスト粒度:** 両者の分岐点（arrow での `onChange` 呼び出しの有無）を複数ケースで検証。comprehensive で bug-resistant。

**参考:**
  - `app/components/note/editor/__tests__/editorModeSwitch.test.tsx:142-285`
  - `app/components/tag/__tests__/TagListToolbar.test.tsx:232-299`

---

### [N-010] 後方互換性が 100% 確保（既存 2 consumer 無改変）

**詳細:** DisplayModeSwitch / PublicTopControls は `manualActivation` を指定せず、既定の `false` （automatic）で動作継続。

**検証:** 両 component の既存テストが全グリーン維持（差分では新規テスト追加のみで既存 case は修正なし）。focusedIndex state が常設されても automatic 経路はこれを参照しないため挙動は bit-identical（#660 ADR-004 の「automatic は `selectedIndex` 由来で矢印即選択」が保証）。

**参考:**
  - `app/components/note/list/DisplayModeSwitch.tsx:70-74`
  - `app/components/public/PublicTopControls.tsx:315-319`

---

### [N-011] EditorModeSwitch の "use client" ディレクティブが明示的・future-proof

**詳細:** line 1 で `"use client"` を付与。既に NoteEditor（client 下位）で使われるため dynamic には不要だが、参照実装 DisplayModeSwitch に倣い明示。

**理由:** useState / useRef を直接呼ぶため、single-import 時の RSC 境界を割らないことを明確に（#660 ADR との整合）。

**参考:** `app/components/note/editor/EditorModeSwitch.tsx:1`

---

### [N-012] static id 命名で生成 id の引き回しを完全に排除

**詳細:** `editorModeTabId(mode)` helper + `EDITOR_BODY_PANEL_ID` 定数で tab ↔ panel を静的に命名。

**実装品質:**
  - EditorModeSwitch が tab 側で id を emit（line 102）
  - NoteEditor が panel 側で EDITOR_BODY_PANEL_ID を reference（line 506）
  - 両ファイルで同じ定数を import → string の手書き重複なし

**保守性:** id スキーム変更が 1 箇所（`editorModeTabId` / `EDITOR_BODY_PANEL_ID`）で完結。id 生成関数に引数を無駄に引き回すコード complexity ゼロ。

**参考:**
  - `app/components/note/editor/EditorModeSwitch.tsx:8-22` (export)
  - `app/components/note/editor/NoteEditor.tsx:507` (import & use)

---

## サマリ

| 項目 | 結果 |
|---|---|
| Blockers | 0 |
| Warnings | 0 |
| Notes | 12 |

### 2周目結論

PR #780 は **計画・ADR・受け入れ基準をすべて正確に実装** しており、以下を達成：

1. **useRovingTablist の型安全性**: discriminated union で automatic / manual を型レベルで厳密に表現
2. **manual activation（EditorModeSwitch）**: 矢印 = focus 移動のみ、click = 確認ゲート通過、既存挙動完全保存
3. **automatic activation（TagListToolbar）**: 矢印 = select + navigate、#660 radiogroup パターン確立
4. **tabpanel 配線**: static id naming で dangling idref ゼロ、test で idref 追跡検証
5. **Rules of Hooks**: focusedIndex 無限ループ防止、render-time adjustment の精密ガード
6. **テスト品質**: manual / automatic の差を対比的に検証、edge case（wrapping / Home/End）を comprehensive にカバー
7. **後方互換性**: 既存 2 consumer 無改変、既存テスト全グリーン維持
8. **layout 保全**: tabpanel ラッパーが unstyled、body margin 阻害なし、FrontMatter 独立

**1周目レビューの 3 つの Warning（onSelect 型安全性 / aria-labelledby dangling 回避 / RSC 境界）はすべて検証済みで問題なし。**

**承認:** ✅ frontend の観点で合格。受け入れ基準 AC-1 ~ AC-10 充足、CLAUDE.md 原則（type safety / Rules of Hooks / derived-state / layout 保全）完全遵守。

