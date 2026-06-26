# Test Review — Issue #776: 残りの不完全 role=tablist パターンの APG 是正

**対象**: PR #780
**実施日**: 2026-06-26
**観点**: テスト網羅性・テスト設計・回帰カバレッジ・spec mock の正確性

---

## Blockers

### [B-001] ArrowLeft テストが EditorModeSwitch.test に欠ける
**場所**: `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`

**説明**: AC-4 の受け入れ基準は「矢印（ArrowLeft/Right + Home/End、両端ラップ）は**フォーカス移動のみ**で選択は変えない」と明記。editorModeSwitch.test は 142-159 行で **ArrowRight のみ** テストしており、ArrowLeft（逆方向移動・ラップ）をカバーしていない。

**理由**: 
1. orientation は "horizontal" なので ArrowLeft/Right が主軸。
2. useRovingTablist の実装は ArrowLeft を処理（144-145 行）。
3. TagListToolbar.test は 276-286 行で「ArrowLeft from the first sort wraps to the last」を明確にテストしており、parity が欠ける。

**提案**: 
```typescript
it("ArrowLeft moves focus to the previous tab (manual)", () => {
  const onChange = vi.fn();
  renderSwitch("edit", "wysiwyg", onChange);  // start at index 1

  pressKey("ArrowLeft");

  const tabs = tabEls();
  expect(document.activeElement).toBe(tabs[0]);
  expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
    "false",
    "true",
    "false",
  ]);
  expect(onChange).not.toHaveBeenCalled();
});

it("ArrowLeft from the first tab wraps to the last (manual)", () => {
  const onChange = vi.fn();
  renderSwitch("edit", "inline", onChange);  // start at index 0

  pressKey("ArrowLeft");

  const tabs = tabEls();
  expect(document.activeElement).toBe(tabs[2]);  // last
  expect(onChange).not.toHaveBeenCalled();
});
```

---

### [B-002] 複数連続矢印キー（focus 複数移動）のテストが両テストファイルに欠ける
**場所**: 
- `app/components/tag/__tests__/TagListToolbar.test.tsx`
- `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`

**説明**: 参考実装 DisplayModeSwitch.test の 391-415 行は「consecutive arrow presses」で複数の ArrowRight を連続発火し、**毎回 navigate が呼ばれる**（automatic activation）ことを確認している。

editorModeSwitch.test でも、矢印を複数回連続で押した場合：
1. focus が複数ステップ移動する
2. **onChange は 1 度も呼ばれない**（manual activation の肝）
3. aria-selected は不変

を verify すべき。

**理由**: 
1. 単発矢印のテストだけでは「矢印移動の途中で onChange が暴発しないこと」を確認できない。
2. WYSIWYG 装飾喪失ダイアログが「矢印で wysiwyg を通過中に暴発しない」という AC-6 の核を verify するには、矢印で複数 tab を通過するシナリオが必須。

**提案**（editorModeSwitch.test）:
```typescript
it("consecutive arrow presses move focus multiple steps without selecting (manual)", () => {
  const onChange = vi.fn();
  renderSwitch("edit", "inline", onChange);

  pressKey("ArrowRight");
  pressKey("ArrowRight");

  expect(document.activeElement).toBe(tabEls()[2]);  // html tab
  expect(onChange).not.toHaveBeenCalled();
});
```

**提案**（TagListToolbar.test）:
```typescript
it("consecutive arrow presses navigate for each press (automatic)", async () => {
  await renderToolbar(undefined, "name");

  await pressSortKey("ArrowRight");
  await pressSortKey("ArrowRight");

  expect(routerNavigate).toHaveBeenCalledTimes(2);
  // Verify the two navigate calls selected different sorts
  const calls = routerNavigate.mock.calls;
  if (typeof calls[0]?.[0]?.search === "function" && typeof calls[1]?.[0]?.search === "function") {
    expect(calls[0][0].search({ sort: "name" }).sort).toBe("noteCount");
    expect(calls[1][0].search({ sort: "noteCount" }).sort).toBe("createdAt");
  }
});
```

---

### [B-003] EditorModeSwitch テストで aria-selected が矢印後も不変であることを explicit に assert していない
**場所**: `app/components/note/editor/__tests__/editorModeSwitch.test.tsx:142-159`

**説明**: 142-159 行の「arrow keys move focus only — no selection, no onChange (manual activation)」テストは、focus が移動して onChange が呼ばれないことは verify しているが、**aria-selected の不変性を明示的にはassert していない**（152-157 行では tabindex と aria-selected を一度に map して出力しているが、テスト本体は onChange 非呼出に焦点）。

Manual activation の核は「aria-selected は活性化（Enter/click）まで変わらない」なので、より defensive に：

**提案**:
```typescript
it("arrow keys move focus only — no selection, no onChange (manual activation)", () => {
  const onChange = vi.fn();
  renderSwitch("edit", "inline", onChange);

  // Initial state
  const tabs = tabEls();
  expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
    "true",
    "false",
    "false",
  ]);

  pressKey("ArrowRight");

  // Focus moved to WYSIWYG, but aria-selected is untouched
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual([
    "true",    // <- still selected (unchanged)
    "false",
    "false",
  ]);
  expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  expect(onChange).not.toHaveBeenCalled();
});
```

---

## Warnings

### [W-001] ArrowUp / ArrowDown のテストが両テストファイルで完全に欠ける
**場所**: 
- `app/components/tag/__tests__/TagListToolbar.test.tsx`
- `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`

**説明**: AC-4 では「ArrowLeft/Right + Home/End」を明記しており、縦キー（ArrowUp/Down）は直接の要件ではない。しかし useRovingTablist の実装は ArrowUp/Down も対応しており（142-145 行）、DisplayModeSwitch.test は ArrowUp/Down をテストしている（312-344 行）。

**理由**: orientation = "horizontal" なので Up/Down は「副次対応」と見なされるが、実装が対応している以上、regression guard になる。ただし AC 上の要件ではないため **Warning**。

**提案**: 任意追加（AC-4 parity として推奨）。

---

### [W-002] エッジケース（count=1、count=0）のロバストネステストが欠ける
**場所**: 
- `app/components/tag/__tests__/TagListToolbar.test.tsx`
- `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`

**説明**: 既存テストは TAG_LIST_SORTS の長さ固定（4 個）または tabs.length 固定（2 または 3）で実行。useRovingTablist の `getTabIndex` 実装（127-134 行）は `focusedIndex` 範囲外を clamp して安全弁を持つが、**count=1 や count=0 での矢印動作**をテストしていない。

**理由**: 
1. count=0 は hook の早期 return（137 行）で処理されるが、テストで verify されていない。
2. count=1 は「矢印で移動する余地がない」が、ラップ / Home/End の挙動は検証価値あり。

**提案**: 任意追加（弱い警告）。

---

### [W-003] EditorModeSwitch テストで矢印キー経路での tabpanel aria-labelledby 不変を verify していない
**場所**: 
- `app/components/note/editor/__tests__/editorModeSwitch.test.tsx` — tabpanel aria-labelledby テストなし
- `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx:375-391` — tabpanel aria-labelledby 初期値テストのみ

**説明**: noteEditorModeChange.test の 375-391 行は「mode 切替（click）後、aria-labelledby が新しい tab を指す」を verify しており良い。しかし矢印キー経路では：
1. ArrowRight で focus が次に移動
2. panel aria-labelledby は **old tab のまま**（aria-selected も old tab のまま）
3. Enter で初めて aria-selected と aria-labelledby が新 tab へ

という manual activation の不変性を verify するテストがない。

**理由**: Manual activation の verify に完全性を期す。特に AC-4「矢印でフォーカス移動のみ・選択不変」の実装正確性を defensive に確認。

**提案**:
```typescript
// editorModeSwitch.test.tsx に追加
it("tabpanel aria-labelledby does not follow focus arrow, only selection (manual)", async () => {
  const { EDITOR_BODY_PANEL_ID, editorModeTabId } = await import("../EditorModeSwitch");
  renderSwitch("edit", "inline");
  const panel = container.querySelector<HTMLElement>(`[id="${EDITOR_BODY_PANEL_ID}"]`);
  
  // Initial: inline is selected, panel points at it
  expect(panel?.getAttribute("aria-labelledby")).toBe(editorModeTabId("inline"));
  
  // Arrow to WYSIWYG: focus moves but panel still points at inline
  pressKey("ArrowRight");
  expect(document.activeElement).toBe(tabEls()[1]);  // focus on wysiwyg
  expect(panel?.getAttribute("aria-labelledby")).toBe(editorModeTabId("inline"));  // <- unchanged
});
```

---

## Notes

### [N-001] role 契約の negative assertion が充実している
**場所**: 
- `app/components/tag/__tests__/TagListToolbar.test.tsx:239-241`
- `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx:103-105`

**所見**: tablist/tab/aria-selected が **残らない**（none of the old markup）ことを明示的に assert するテストが両者に入っており、良い防御的テスト設計。editorModeSwitch.test でも同様に tablist/tab/aria-selected を検証（104-132 行）しており、parity 取れている。

---

### [N-002] Manual activation 実装設計の試験方針が明確
**場所**: 
- `editorModeSwitch.test.tsx:104-191`
- `noteEditorModeChange.test.tsx:370-392`

**所見**: 
- editorModeSwitch.test は pure component テスト（control の ARIA + keyboard）に集中。
- noteEditorModeChange.test は orchestrator テスト（panel 切替・確認ゲート）に集中。
- 関心の分離が適切で、責務が clear。

ただし、矢印経路での panel aria-labelledby 不変を criss-cross verify する test case がないため、[W-003] の提案。

---

### [N-003] Automatic vs Manual activation の両パターン試験が distinguish されている
**場所**: 
- TagListToolbar.test（automatic）: navigate / aria-checked の移動
- EditorModeSwitch.test（manual）: onChange 未呼出・aria-selected 不変

**所見**: 操作モデルの違い（矢印で即選択 vs フォーカスのみ）がテスト上で明確に reflect されており、実装と仕様の対応が追跡可能。

---

### [N-004] Existing behavior regression が十分に locked in
**場所**: 
- `TagListToolbar.test:317-403` — sort / order / navigate / useOptimistic
- `noteEditorModeChange.test:216-1027` — confirm gate / FrontMatter / WYSIWYG dialog / autosave

**所見**: AC-3（既存 sort/order 選択不変）と AC-6（既存 editor モード確認ゲート不変）が複数の test case で回帰固定されており、重層的。変更前の挙動を十分に protect している。

---

### [N-005] spec モック（P18/P12）の ARIA マークアップが実装と合致
**場所**: 
- `spec/design/pages/P18-tags.html:785-790` — radiogroup/radio/aria-checked + roving tabindex
- `spec/design/pages/P12-editor.html:967-1054` — tablist/tab/aria-selected + aria-controls/tabpanel

**所見**: 
- P18: radiogroup / radio / aria-checked / tabindex / aria-label / aria-orientation が complete。tablist/tab/aria-selected は完全に removed（注記参照）。
- P12: tablist / tab / aria-selected / id / aria-controls / aria-orientation が complete。tabpanel は actual body area（toolbar + textbox）を囲み、aria-labelledby が active tab を指す。FrontMatter 削除済みの注記あり。

双方ともモック → 実装 → テスト の mapping が consistent。

---

## Summary

| 指摘 | 数 | 重要度 |
|---|---|---|
| **Blockers** | 3 | Critical |
| **Warnings** | 3 | Low–Medium |
| **Notes** | 5 | Informational |

### Blockers 一覧
- **[B-001]** ArrowLeft テストが editorModeSwitch.test に欠ける — `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`
- **[B-002]** 複数連続矢印キーテストが両テストで欠ける — `app/components/tag/__tests__/TagListToolbar.test.tsx`, `app/components/note/editor/__tests__/editorModeSwitch.test.tsx`
- **[B-003]** aria-selected 矢印後不変の explicit assert が editorModeSwitch.test に欠ける — `app/components/note/editor/__tests__/editorModeSwitch.test.tsx:142-159`

### 修正予定ファイル
1. `app/components/note/editor/__tests__/editorModeSwitch.test.tsx` — B-001 / B-002 / B-003 対応
2. `app/components/tag/__tests__/TagListToolbar.test.tsx` — B-002 対応（任意で W-001 対応）

