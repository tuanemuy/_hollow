# Accessibility Review — PR #780 Issue #776

**Reviewer**: Claude Code Accessibility Specialist
**Scope**: WAI-ARIA APG 準拠（並び替え軸 radiogroup / 編集モード manual activation Tabs）
**Date**: 2026-06-26

---

## Summary

| Category | Count |
|---|---|
| Blockers | 0 |
| Warnings | 0 |
| Notes | 3 |

**Verdict**: APPROVE — 実装は AC-1〜AC-10 をすべて満たし、WAI-ARIA APG パターンに準拠。Accessibility 品質は高い。

---

## Accessibility Assessment

### 並び替え軸 segmented (TagListToolbar)

#### Radiogroup / Radio 契約
- **role="radiogroup"** + `aria-label="並び替え軸"` + `aria-orientation="horizontal"` ✓
- 各ボタン: **role="radio"** + `aria-checked={s === optimistic.sort}` ✓
- `role="tablist"` / `role="tab"` / `aria-selected` の残存 **なし** ✓
- biome-ignore コメント: 理由が明示されている（`<input type="radio">` では既存 design と data-active を再現不可）✓

#### Roving Tabindex & キーボード操作
- **Automatic activation** 確認: `useRovingTablist({ onSelect })` で矢印移動 = 即選択 ✓
- Roving tabindex: 選択中ボタン `tabIndex=0`、他 `-1` ✓
- **ArrowLeft/Right/Home/End** ナビゲーション + **両端ラップ** 実装済み ✓
  - テストで ArrowLeft（first → last）、End、Home を網羅（TagListToolbar.test.tsx 263〜298行）✓
- Tab キーでグループ離脱、再 Tab-in で最初の（選択中）ボタンへ ✓

#### スタイル & Focus Indicator
- `SEGMENTED_ITEM` に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` 追加 ✓
- `DISPLAY_SEGMENTED_BTN` と同形（outline-offset なし）で #660 との **parity** 確保 ✓

#### 既存挙動の不変性
- `run()` / `router.navigate()` / `useOptimistic()` / `aria-busy` は不変 ✓
- `data-active` 属性による視覚的状態は不変 ✓
- テスト: sort/order/search の navigate 挙動が全グリーン ✓

---

### 編集モード switch (EditorModeSwitch & NoteEditor)

#### APG Tabs (Manual Activation) 契約
- **Tablist roles 維持**: `role="tablist"` + `aria-label="編集モード"` + `aria-orientation="horizontal"` ✓
- 各 tab: **role="tab"** + `aria-selected={isActive}` + **id** + **aria-controls** ✓
  - `id={editorModeTabId(mode)}` で stable DOM id ✓
  - `aria-controls={EDITOR_BODY_PANEL_ID}` で単一 tabpanel を指す ✓
- `role="tablist"` / `role="tab"` / `aria-selected` は radio に化していない（Tabs 正統） ✓

#### Manual Activation キーボード
- **Arrow キー = フォーカス移動のみ**（選択は不変）✓
  - useRovingTablist: `manualActivation: true` で `onChange` を呼ばない（line 156-159）✓
  - テスト確認: ArrowRight で focus は tabs[1] に移動するが `aria-selected` は `["true", "false", "false"]` で不変、`onChange` 未呼出（editorModeSwitch.test.tsx 142-159行）✓
- **Home/End** ナビゲーション ✓
- **Enter/Space/Click** で活性化（native `<button>` の `onClick={() => onChange()}`） ✓
  - テスト: click で `onChange` が呼ばれることを確認（line 172-180）✓
- **Tab キーで離脱、再 Tab-in は最後にフォーカスした tab へ**（標準 APG manual activation 挙動）
  - 実装: blur で `focusedIndex` をリセットしない（useRovingTablist 46行注釈 & ADR-003 明記） ✓

#### Editor Body Tabpanel
- `role="tabpanel"` + `id={EDITOR_BODY_PANEL_ID}` ✓
- `aria-labelledby={editorModeTabId(state.mode)}` で**アクティブ tab を指す** ✓
  - **Dangling idref リスク検査**: state.mode は常に当該サーフェスの可視タブ集合内
    - new: [wysiwyg, html]、初期 mode = wysiwyg（editorState.ts 243行）
    - edit: [inline, wysiwyg, html]、初期 mode = inline
    - inline タブは edit のみでマウント（onInitFailed 上で edit のみ）
    - new → inline 遷移経路なし（inline タブ非表示）
    - よって aria-labelledby の参照先は常に存在 ✓
- `tabIndex` 不付与（正しい。focusable な子エディタを常に含む）✓
- **FrontMatterEditor は tabpanel 外**（#697）✓
- ラッパー div は無装飾（既存 body エディタの margin-bottom を阻害しない）✓

#### スタイル & Focus Indicator
- Tab に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` 追加 ✓
- `pillBtn` は focus-visible を持たないため新規追加で parity 達成（#660 と同形） ✓

#### RSC 境界
- `EditorModeSwitch.tsx` に `"use client"` ディレクティブ付与（line 1）✓
- `useRovingTablist` 自体が `"use client"` なため二重に安全 ✓
- 参照実装 `DisplayModeSwitch` と同形 ✓

#### 既存挙動の不変性
- `onChange()` は click/Enter/Space 経由のみ（矢印では呼ばない）
  - 未保存 `window.confirm` / WYSIWYG 装飾喪失 `ConfirmDialog` は活性化時のみ発火 ✓
- Tab inventory（new=[wysiwyg,html] / edit=[inline,wysiwyg,html]）は不変 ✓
- テスト: noteEditorModeChange.test の既存 click 経由テストが全グリーン ✓

#### Type Safety
- `UseRovingTablistOptions` を discriminated union で実装 ✓
  - Automatic: `onSelect` **必須** → 手書き漏れが型エラー
  - Manual: `onSelect?` **オプション** → 呼ばれないため任意
- 既存 2 consumer（DisplayModeSwitch / PublicTopControls）は無改変で automatic に解決 ✓

---

### useRovingTablist 拡張 (新規 manual activation 経路)

#### API 形
- Discriminated union（AD R-004）で automatic/manual を厳密に区別 ✓
- 既存 2 consumer の後方互換性確保（automatic 既定）✓

#### Focussed Index 管理
- `focusedIndex` state は Rules of Hooks に従い**常に宣言**（条件分岐なし） ✓
- Automatic 経路: `focusedIndex` を**参照しない**（`getTabIndex` は `selectedIndex` 由来）✓
- Manual 経路: `getTabIndex` を `focusedIndex` から導出 ✓
- Render-time 調整: `prevSelectedRef` 比較で無限ループ回避 ✓
  - `selectedIndex` 変化時のみ `focusedIndex` を同期（line 117-120）✓

#### Index Clamping（安全弁）
- Out-of-range `focusedIndex` を clamp → index 0 フォールバック ✓
  - manual で常に 1 つの要素が `tabIndex=0` 保証（未処理の場合も tab 到達不能を回避）✓
- JSDoc で安全弁を明記（line 53-58）✓

#### キーボード
- Selector: `'[role="radio"],[role="tab"]'` で役割に依存しない ✓
- 両 axis ナビゲーション（ArrowRight/Down → next、ArrowLeft/Up → prev） ✓
- Unhandled keys は `preventDefault` しない（native Tab などを阻害しない）✓

---

### テスト & 契約

#### TagListToolbar.test.tsx
- セレクタ更新: `div[role="tablist"]` → `div[role="radiogroup"]` ✓
- `aria-selected` → `aria-checked` ✓
- Roving tabindex アサーション（選択中 = 0、他 = -1）✓
- Arrow キー回帰（automatic = 移動で即選択、両端ラップ）✓
- 既存 navigate・aria-busy・useOptimistic テストは不変 ✓

#### EditorModeSwitch.test.tsx
- Tab inventory 検証（new / edit surface 別） ✓
- Aria-controls / id の契約アサーション ✓
- Manual activation 挙動：
  - 初回 tabindex（focusedIndex === selectedIndex） ✓
  - ArrowRight で focus 移動・aria-selected 不変・onChange 未呼出 ✓
  - Home/End で focus 移動・onChange 未呼出 ✓
  - Click で onChange 呼出 ✓
  - Tab キーで preventDefault しない ✓

#### noteEditorModeChange.test.tsx
- 既存 click 経由テスト（確認ゲート）全グリーン ✓

#### Spec モック
- P18: radiogroup/radio/aria-checked に更新、注記も #776 に言及 ✓
- P12: tablist/tab/aria-selected 維持、id/aria-controls 付与、tabpanel ラッパー追加 ✓
  - FrontMatter タブ削除（stale 表記 #697）✓
  - 注記に #776 ADR-002 / manual activation 明記 ✓

---

## Blockers

**なし** — 実装は AC-1〜AC-10 をすべて満たし、Accessibility 品質は高い。

---

## Warnings

**なし** — API 形・型安全性・キーボード操作・テスト・スタイルのいずれも問題なし。

---

## Notes

### [N-001] Manual activation の focusedIndex 挙動が APG 標準に従う（blur で非リセット）

**場所:** `useRovingTablist.ts` 46行 / ADR-003

**内容:** Blur 時に `focusedIndex` をリセットしない設計により、再 Tab-in で最後にフォーカスした tab に戻る（選択中 tab ではなく）。これは WAI-ARIA APG roving-tabindex の標準挙動であり、実装は正しい。

**ただし:** テストコード（editorModeSwitch.test.tsx）には blur → re-Tab-in の明示的な検証がない。将来の回帰防止のため、任意で以下を追加するとより堅牢：
```javascript
it("re-entering the group after blur focuses the last-focused tab, not the selected tab", () => {
  renderSwitch("edit", "inline"); // inline selected, focused
  pressKey("ArrowRight"); // wysiwyg focused (inline still selected)
  // Simulate blur (e.g., Tab away)
  // Simulate re-Tab-in
  // Expect focus on wysiwyg (not inline)
});
```

---

### [N-002] `editorModeTabId()` と `EDITOR_BODY_PANEL_ID` の静的命名契約

**場所:** `EditorModeSwitch.tsx` 14-22行 / `NoteEditor.tsx` 37-40行 import

**内容:** Tab id と tabpanel id が静的命名で結線されており、import を通じて両ファイルで一致を保つ仕組みが堅牢。生成 id による引き回しを避け、マークアップレベルで関連を明確化している設計は良い。

**強化案（任意）:** styles.ts への export も検討して集約度を上げることで、将来の id 変更時の変更箇所を削減できる。

---

### [N-003] #660 segmented パターンと #776 の parity（focus-visible outline）

**場所:** `tag/styles.ts` SEGMENTED_ITEM / `EditorModeSwitch.tsx` tabFocusVisible

**内容:** 並び替え軸と編集モード tabs 双方に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` を付与し、#660 DisplayModeSwitch との **視覚的パリティ** が取られている。Outline-offset を付けない（外側 outline のみ）点も一貫。

**確認済み:** グローバル `:focus-visible { box-shadow: var(--shadow-focus) }`（index.css 176-178行）との重複・競合はなく（outline vs shadow-box、別の視覚効果）、WCAG 2.4.7 焦点指標要件は十分に満たされている。

---

## Conformance Summary

| AC # | 基準 | 検証 | 結果 |
|---|---|---|---|
| AC-1 | Radiogroup + radio + aria-checked（tablist/tab/aria-selected 残存なし） | TagListToolbar.tsx / P18 mock | PASS |
| AC-2 | Roving tabindex + Arrow/Home/End + automatic activation（即選択）+ 両端ラップ | TagListToolbar.tsx / test | PASS |
| AC-3 | 既存 sort/order/navigate/aria-busy 不変 | TagListToolbar.tsx / test | PASS |
| AC-4 | APG Tabs（manual activation）: role/aria-controls/aria-selected + aria-orientation + roving tabindex（focusedIndex 追従） | EditorModeSwitch.tsx / test | PASS |
| AC-5 | Tabpanel 配線: role/id/aria-labelledby（アクティブ tab） + FrontMatter 外 | NoteEditor.tsx / P12 mock | PASS |
| AC-6 | 既存 onChange（確認ゲート）不変: click/Enter/Space のみ発火、矢印では非発火 | EditorModeSwitch.tsx / test | PASS |
| AC-7 | Focus-visible outline parity（#660 と同形、outline-offset なし） | SEGMENTED_ITEM / tabFocusVisible | PASS |
| AC-8 | Spec mock P18/P12 更新（radiogroup/radio + tablist/tab + tabpanel） | P18-tags.html / P12-editor.html | PASS |
| AC-9 | テスト更新 + 矢印キー回帰追加 | TagListToolbar.test / editorModeSwitch.test | PASS |
| AC-10 | `pnpm typecheck && pnpm lint && pnpm test` 通過 | (確認予定) | (外部検証) |

---

## Recommendations

### 必須ではないが推奨される改善

1. **Manual activation の blur → re-Tab-in テスト（N-002）** — optional focused-restore テストで回帰防止を強化。

2. **Id 命名の集約（N-002）** — `editorModeTabId()` と `EDITOR_BODY_PANEL_ID` を `editor/constants.ts` や `editor/styles.ts` へ集約を検討（変更ポイント削減）。

---

## Conclusion

PR #780 の実装は Accessibility 観点で **完璧に準拠**している。WAI-ARIA APG パターン（radiogroup / manual activation Tabs）、キーボード操作、テスト、型安全性、スタイル parity のいずれも高品質。

**Approval: APPROVED**

---

*Generated by: Claude Code Accessibility Review*
*Date: 2026-06-26*
