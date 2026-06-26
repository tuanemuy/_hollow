# Test Review — Issue #776: 残りの不完全 role=tablist パターンの APG 是正（2周目）

**対象**: PR #780（2周目フルレビュー）
**実施日**: 2026-06-26
**観点**: テスト網羅性・テスト設計・回帰カバレッジ・実装正確性

---

## Summary

| 指摘 | 数 | 重要度 |
|---|---|---|
| **Blockers** | 1 | Critical |
| **Warnings** | 0 | - |
| **Notes** | 2 | Informational |

**全体評価**: 1周目の Blockers（B-001/002/003）と Warnings（W-001/003）はほぼ修正済み。ただし W-001（ArrowUp/Down）テストが **TagListToolbar.test 単体で欠落** しており、新規 Blocker として浮上。

---

## Blockers

### [B-004] W-001 (ArrowUp/Down) テストが TagListToolbar.test に欠ける

**説明**: 
1周目の W-001「ArrowUp/Down のテストが両テストで完全に欠ける」は、editorModeSwitch.test では 234-264 行で修正済み（`it("ArrowDown behaves like ArrowRight...")`, `it("ArrowUp behaves like ArrowLeft...")` の 2 ケース）。

しかし TagListToolbar.test には **ArrowUp/Down テストが実装されていない**。grep で確認（`grep -n "ArrowUp\|ArrowDown" app/components/tag/__tests__/TagListToolbar.test.tsx` → 0 結果）。

**理由**:
1. useRovingTablist の実装（app/components/common/useRovingTablist.ts 142-145 行）は ArrowUp/Down を処理する（nextKey/prevKey に依存しない絶対キー対応）。
2. DisplayModeSwitch.test（#660 参照実装）は ArrowUp/Down テストを持つ（両軸でカバー）。
3. TagListToolbar と EditorModeSwitch は同じ useRovingTablist を用いるため、両者とも ArrowUp/Down テストを持つべき（parity）。
4. 1周目計画「ステップ5（TagListToolbar テスト）で『矢印キー回帰のパターンに倣い追加』」で coverage が要求された（AC-9）。

**根拠（実装確認）**:
```typescript
// useRovingTablist.ts 142-145
if (event.key === nextKey || event.key === "ArrowDown") next = (base + 1) % count;
else if (event.key === prevKey || event.key === "ArrowUp") next = (base - 1 + count) % count;
```
→ 両軸に対応。TagListToolbar は horizontal（nextKey=ArrowRight, prevKey=ArrowLeft）だが、ArrowUp/Down も処理される。

**提案**:
```typescript
it("ArrowDown behaves like ArrowRight: moves selection and navigates (W-001)", async () => {
  await renderToolbar(undefined, "name");
  await pressSortKey("ArrowDown");

  expect(routerNavigate).toHaveBeenCalledTimes(1);
  const call = routerNavigate.mock.calls[0]?.[0];
  if (typeof call?.search === "function") {
    expect(call.search({ sort: "name" }).sort).toBe("noteCount");
  }
  expect(document.activeElement).toBe(getSortButtons()[1]);
});

it("ArrowUp from the first sort wraps to the last and navigates (W-001)", async () => {
  await renderToolbar(undefined, "name");
  await pressSortKey("ArrowUp");

  expect(routerNavigate).toHaveBeenCalledTimes(1);
  const call = routerNavigate.mock.calls[0]?.[0];
  if (typeof call?.search === "function") {
    expect(call.search({ sort: "name" }).sort).toBe("lastUsedAt");
  }
  expect(document.activeElement).toBe(getSortButtons()[3]);
});
```

**場所**: `app/components/tag/__tests__/TagListToolbar.test.tsx`（既存 ArrowRight/ArrowLeft テストの直後に追加）

---

## Warnings

なし（W-001 は Blocker に格上げ）

---

## Notes

### [N-001] 1周目 Blockers（B-001/002/003）が正確に修正実装された

**確認項目**:
- **B-001** ArrowLeft テスト: editorModeSwitch.test 169-202 行で実装済み（初回移動 + ラップ 2 ケース） ✓
- **B-002** 複数連続矢印キーテスト: 
  - editorModeSwitch.test 204-221 行で実装済み ✓
  - TagListToolbar.test 306-329 行で実装済み ✓
- **B-003** aria-selected 矢印後不変の explicit assert: editorModeSwitch.test 148-152, 161-165 行で明示的 assert 追加済み ✓

**所見**: 提案どおりに実装されており、manual activation（矢印でフォーカスのみ移動・選択不変）の verify が強化されている。

---

### [N-002] 1周目 Warnings（W-001/003）の修正状況

**W-001（ArrowUp/Down）**:
- **editorModeSwitch.test**: ✓ 234-264 行で実装済み（DisplayModeSwitch.test パターンに倣い）
- **TagListToolbar.test**: ✗ **実装されていない**（本 Blocker B-004 の根拠）

**W-003（tabpanel aria-labelledby 矢印不変）**:
- **noteEditorModeChange.test**: ✓ 393-424 行で実装済み（「arrow key traversal does not change tabpanel aria-labelledby」と明示）
- テストは矢印で複数 tab を通過して「aria-labelledby が選択 tab のまま不変」を verify（manual activation の精密性確認）

**所見**: W-003 は完全に修正。W-001 は editorModeSwitch では修正・TagListToolbar では未修正の asymmetrical 状態。

---

## 実装品質チェック

### ARIA マークアップ（全要素確認）

✓ **TagListToolbar.tsx** (151-170 行):
- container: `role="radiogroup"` + `aria-label="並び替え軸"` + `aria-orientation="horizontal"` ✓
- button: `role="radio"` + `aria-checked` + `tabIndex` + `biome-ignore` コメント ✓

✓ **EditorModeSwitch.tsx** (87-114 行):
- container: `role="tablist"` + `aria-label="編集モード"` + `aria-orientation="horizontal"` ✓
- button: `role="tab"` + `id={editorModeTabId(...)}` + `aria-selected` + `aria-controls={EDITOR_BODY_PANEL_ID}` + `tabIndex` ✓
- focus-visible outline: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` ✓

✓ **NoteEditor.tsx** (504-561 行):
- tabpanel wrapper: `role="tabpanel"` + `id={EDITOR_BODY_PANEL_ID}` + `aria-labelledby={editorModeTabId(state.mode)}` ✓
- FrontMatterEditor は wrapper の**外**（#697 ADR-002 順守） ✓

✓ **useRovingTablist.ts** (102-167 行):
- manual activation 実装: `focusedIndex` state + `manualActivation` flag + discriminated union types ✓
- count=0 early return + getTabIndex clamp（safety valve） ✓
- blur でリセットしない（再 Tab-in は最後フォーカス復帰） ✓

### テスト カバレッジ（確認済み）

✓ editorModeSwitch.test:
- role 契約（tablist/tab/aria-selected/aria-controls/id）: 104-132 行 ✓
- roving tabindex（初期+矢印後）: 135-139, 159 行 ✓
- ArrowRight + ArrowLeft（初回+ラップ）: 142-202 行 ✓
- 複数連続矢印: 204-221 行 ✓
- Home/End: 223-232 行 ✓
- ArrowUp/Down: 234-264 行 ✓
- click 活性化: 266-274 行 ✓
- unhandled keys（Tab）: 276-284 行 ✓

✓ noteEditorModeChange.test:
- tabpanel aria-labelledby 初期値: 375-391 行 ✓
- 矢印で aria-labelledby 不変: 393-424 行 ✓

✓ TagListToolbar.test:
- radiogroup/radio/aria-checked 契約: 232-258 行 ✓
- ArrowRight/ArrowLeft（初回+ラップ）: 263-286 行 ✓
- Home/End: 288-304 行 ✓
- 複数連続矢印: 306-329 行 ✓
- click 活性化: 342-362 行 ✓
- unhandled keys（Tab）: 331-340 行 ✓
- **ArrowUp/Down**: ✗ **欠ける** ← B-004

### テスト実行結果

全テスト実行（`pnpm test`）: **794 passed** ✓（exit code 0）
- editorModeSwitch.test: 全ケース PASS ✓
- noteEditorModeChange.test: 全ケース PASS（新規 tabpanel テスト含む） ✓
- TagListToolbar.test: 全ケース PASS ✓（ただし W-001 カバレッジ欠落により false negative の可能性）

---

## 修正予定ファイル

1. **`app/components/tag/__tests__/TagListToolbar.test.tsx`** — B-004 対応（ArrowUp/Down テスト 2 ケース追加）

---

## 関連スコープ確認

✓ W-002（count=0/1 エッジケース）見送り判断は妥当:
- useRovingTablist line 137 で `count === 0` early return ✓
- line 125-131 で `focusedIndex` clamp（out-of-range → 0） ✓
- 計画「count はマウント中不変」で実装が safety valve を持つため、explicit edge case テスト優先度は低い ✓

---

## 最終判定

1周目の Blockers は修正済みだが、W-001（ArrowUp/Down）が TagListToolbar.test **単体で欠落** しており、テスト parity 原則（同じ useRovingTablist を用いる両コンポーネント間での対称性）に違反。AC-9「関連テストの role 契約アサーション更新 + 矢印キー回帰テスト追加」の網羅性が不完全。

**B-004 対応により完全合致**。

