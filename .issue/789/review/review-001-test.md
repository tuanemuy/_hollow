# Test レビュー — PR #802 (Issue #789)

**レビュー対象**: PR #802 — ノート編集画面のタグ入力 combobox 化・候補ドロップダウン追加
**実装計画**: .issue/789/plan.md
**テストファイル**: 
- `app/components/note/editor/__tests__/tagSuggestModel.test.ts`
- `app/components/note/editor/__tests__/TagsInput.test.tsx`

---

## Blockers

**[B-001]** 候補 option をマウスクリック確定するテストケースが未実装
- **場所**: `TagsInput.test.tsx` 全体
- **理由**: plan で明記「option は `onMouseDown preventDefault` で実フォーカスを奪わず、blur 暴発を防ぐ」が検証されていない。candidate click → onAddTag という基本的なハッピーパスが緑テストの対象外。
- **提案**: "clicking a suggestion option commits that tag and closes the panel" テストケースを追加。
  ```typescript
  it("commits a clicked suggestion without triggering blur", () => {
    const onAddTag = vi.fn();
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      onAddTag,
    });
    focusInput();
    const optionBtn = container.querySelector<HTMLButtonElement>('[role="option"]');
    act(() => {
      optionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAddTag).toHaveBeenCalledWith("react");
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
  });
  ```
  このテストで onMouseDown preventDefault の効果（blur 前に click handler が走る）を検証。

**[B-002]** 候補なし（`hasSuggestions=false`）時に上向き矢印（ArrowUp）が無視されることをテストしていない
- **場所**: `TagsInput.test.tsx` の arrow key テスト
- **理由**: plan 設計ステップ 3「無アクティブで ↓ は開く、↑ は何もしない」が実装されているが、↑ の no-op をテストしていない。誤実装（↑ でも open する）に気付きにくい。
- **提案**: "does not open the panel on ArrowUp when no suggestions" テスト追加。
  ```typescript
  it("does not open the panel on ArrowUp when no suggestions", () => {
    renderInput({ draft: "x", suggestions: [] });
    focusInput();
    pressKey("ArrowUp");
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
  });
  ```

**[B-003]** `disabled=true` 時に候補パネルが open しないことを検証していない
- **場所**: `TagsInput.test.tsx` の disabled テスト（L208-215）
- **理由**: 既存テスト「disables the remove buttons and the input」は削除ボタン・input の disabled 属性のみ確認。candidates panel の開閉制御（`!disabled && setOpen(true)`）が検証されていない。
- **提案**: disabled テストケースを拡張。
  ```typescript
  it("does not open suggestions when disabled", () => {
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      disabled: true,
    });
    focusInput();
    // aria-expanded は付けるが panel 開かず
    pressKey("ArrowDown");
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
    expect(options()).toHaveLength(0);
  });
  ```

---

## Warnings

**[W-001]** draft 変化後に `activeIndex` が `-1` に戻り、clamp で 0 に押し戻されないことの明示的テストがない
- **場所**: `TagsInput.test.tsx`
- **理由**: plan の重要な設計（ADR-003・arch-risk P-001）「draft 変化→activeIndex=-1→clampSuggestIndex(-1)=-1 保持→0 へ押し戻されない」が unit test（tagSuggestModel.test.ts）では確認されるが、コンポーネント統合では暗黙的。特に「draft 入力変化→新規 ArrowDown→先頭候補」という流れの回帰を明示的に固定すべき。
- **提案**: "resets activeIndex on draft change so repeated ArrowDown navigation works correctly" テスト追加。
  ```typescript
  it("resets activeIndex to -1 on draft change", () => {
    renderInput({ draft: "r", suggestions: ["react", "redux"] });
    focusInput();
    pressKey("ArrowDown");
    let active = getInput().getAttribute("aria-activedescendant");
    expect(active?.endsWith("-0")).toBe(true); // first option
    
    // Change draft (e.g., user types another char)
    // This would happen via onChange → onSetDraft in real flow
    // But test framework doesn't auto-update; manually re-render
    renderInput({ draft: "re", suggestions: ["react", "redux"] });
    focusInput();
    // activeIndex should reset to -1
    expect(getInput().getAttribute("aria-activedescendant")).toBeNull();
    // Next ArrowDown should go to first again, not skip
    pressKey("ArrowDown");
    active = getInput().getAttribute("aria-activedescendant");
    expect(active?.endsWith("-0")).toBe(true);
  });
  ```

**[W-002]** `panelOpen` 述語と DOM 描画の同期をテストしていない
- **場所**: `TagsInput.test.tsx` の panelOpen テスト群（L226-298）
- **理由**: テストが `aria-expanded` 属性のみ確認し、実際の `tagSuggestPanel` div が DOM に存在・非存在しているかを検証していない。例えば "shows a create-new indicator" で `aria-expanded="true"` を確認しているが、`.tagSuggestPanel` div が実在するか明示的に確認していない。panelOpen が false なのに aria-expanded=true という矛盾のリグレッションに気付きにくい。
- **提案**: panelOpen テストで `querySelector('[class*="tagSuggestPanel"]')` の有無を explicit assert。
  ```typescript
  it("shows a create-new indicator (no listbox) for a fresh draft", () => {
    renderInput({ draft: "angular", suggestions: ["react", "redux"] });
    focusInput();
    // Panel element must exist
    const panel = container.querySelector('[class*="tagSuggestPanel"]');
    expect(panel).not.toBeNull();
    expect(options()).toHaveLength(0);
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
    expect(getInput().getAttribute("aria-controls")).toBeNull();
    expect(container.textContent).toContain("新規作成");
  });
  ```

**[W-003]** エラーメッセージの `aria-live="polite"` 属性をアサートしていない
- **場所**: `TagsInput.test.tsx:300-314`（invalid draft テスト）
- **理由**: styles.ts で `aria-live="polite"` を付与（L134: `<p id={errorId} className={tagInputError} aria-live="polite">`）するが、テストでは textContent の表示確認のみ。a11y 属性の検証がない。
- **提案**: error element の aria-live を explicit assert。
  ```typescript
  it("surfaces invalid-draft errors via aria-live=polite", () => {
    renderInput({ draft: "foo bar" });
    const error = container.querySelector('[id*="error"]');
    expect(error?.getAttribute("aria-live")).toBe("polite");
    expect(error?.textContent).toContain("空白や改行は使えません");
  });
  ```

**[W-004]** 空白のみの draft でもエラーが出ないことをテストしていない
- **場所**: `TagsInput.test.tsx` の invalid draft テスト群
- **理由**: plan S-002/S-003「`validateTagDraft("   ") → null` エラーなし」が unit test で確認されるが、コンポーネント上で空白のみ draft をテストしていない（`draft=""`のみ）。空白 + バリデーションの相互作用をテストして回帰を防ぐべき。
- **提案**: コンポーネントテストに追加。
  ```typescript
  it("does not show error for whitespace-only draft", () => {
    renderInput({ draft: "   " });
    const error = container.querySelector('[id*="error"]');
    expect(error).toBeNull();
  });
  ```

**[W-005]** `aria-describedby` が input に付与されるのは `validationError !== null` の時だけであることをテストしていない
- **場所**: `TagsInput.test.tsx`
- **理由**: styles.ts で `aria-describedby={errorId}` を条件付与（L206）しているが、テストで確認していない。有効な draft の時は aria-describedby が非付与であることを検証すべき。
- **提案**: 有効/無効 draft での aria-describedby の付与・非付与を explicit assert。
  ```typescript
  it("sets aria-describedby only when error is present", () => {
    renderInput({ draft: "invalid tag" }); // will have error
    expect(getInput().getAttribute("aria-describedby")).toBeTruthy();
    
    renderInput({ draft: "validtag" });
    expect(getInput().getAttribute("aria-describedby")).toBeNull();
  });
  ```

---

## Notes

**[N-001]** `filterTagSuggestions` の重複排除（`seen` set）が allNames 重複時に機能することをテストしていない
- **場所**: `tagSuggestModel.test.ts:10-36`
- **理由**: `seen` set で重複排除しているが、テストケースは all names に重複がない。実装として正しいが、ドメイン側で allNames の重複可能性が不明な場合、明示的テストで保証すると良い（optional な改善）。
- **提案**: テストケースを追加（optional）。
  ```typescript
  it("deduplicates the result when allNames has duplicates", () => {
    const withDups = ["react", "React", "REACT"];
    expect(filterTagSuggestions(withDups, [], "re")).toHaveLength(1);
  });
  ```

**[N-002]** `focusInput()` が `focus()` 呼び出しだけで `onFocus` callback を発火させることが暗黙的
- **場所**: `TagsInput.test.tsx:78-84, 98-102`（getInput/focusInput）
- **理由**: happy-dom での `focus()` が onFocus event を自動発火するかどうかが明確でない。実装として問題ないと思われるが、JSDoc コメントで理由を明記するか、または明示的に event dispatch する方が可読性向上。
- **提案**: focusInput() に comment を追加するか、event dispatch を明示的に。
  ```typescript
  function focusInput() {
    act(() => {
      const input = getInput();
      input.focus();
      // happy-dom: focus() triggers onFocus callback
    });
  }
  ```

**[N-003]** ComboBox の `aria-autocomplete="list"` を確認しているが、`aria-owns` や `aria-owns` の関係を明示していない
- **場所**: `TagsInput.test.tsx:219-224`
- **理由**: plan では aria-controls/aria-activedescendant の役割分離を明記しているが、実装で aria-owns を使わず aria-controls で listbox を接続している。仕様に従っているが、design comment で aria-controls が listbox を指すことを明記するとさらに良い。
- **提案**: JSDoc に説明を追加（optional）。

**[N-004]** `parseTagInput` が comma-split を行うことを前提に `validateTagDraft` が全トークン検証しているが、その関係性をテスト comment で明記すると良い
- **場所**: `tagSuggestModel.test.ts:82-86`
- **理由**: テストケース「flags an invalid token even when a later token is valid」は良いが、parseTagInput の動作を前提としていることが明確でない。comment を追加して可読性向上。
- **提案**: test comment に "mirrors parseTagInput's comma-split" を追記（optional）。

---

## Summary

| 項目 | 件数 | 状態 |
|-----|------|------|
| Blockers | 3 | 実装必須 |
| Warnings | 5 | 推奨対応 |
| Notes | 4 | 参考（optional） |

### 主要な指摘

**必須対応**:
1. **B-001**: 候補 option click テストが完全に抜けている。click → commit → close の基本フローが緑テストの対象外。
2. **B-002**: 無アクティブ時の arrow up no-op がテストされていない。plan 設計の重要な要素。
3. **B-003**: disabled 時に panel が open しないことを検証していない。

**推奨対応**:
- draft 変化→activeIndex=-1 の明示的テストを追加（arch-risk P-001 の設計担保）
- panelOpen DOM 描画の有無を aria-expanded と同期確認
- error message の aria-live 属性を explicit assert
- 空白のみ draft でもエラー非表示の検証

### テスト品質総評

- **Pure helper（tagSuggestModel）**: filter/classify/validate/clamp/next の境界値が十分にカバーされている。正規化 SSOT（matchKey）の逆境（#Foo → Foo 除外）もテスト済み。品質は高い。
- **Component（TagsInput）**: 既存 6 ロック + 新規 combobox ロジックの多くは検証されているが、**click handler / arrow up / disabled+panel の 3 項目が欠落**。セレクタ（`role="option"`）は堅牢だが、DOM 描画そのものの有無を確認するテストが弱い。
- **ARIA 属性**: role/aria-expanded/aria-controls/aria-activedescendant/aria-autocomplete を確認しているが、aria-describedby/aria-live/aria-label の動的付与・非付与が完全ではない。

### 手動テスト対応状況

plan で明記した「手動：編集・新規両画面で候補表示・↑↓Enter・IME・50超エラー・blur・autosave確認」は `.issue/789/.manual-test/report.md` で 11/12 PASS・1 SKIP（disabled）で確認済み。ユニットテストの補完として機能している。
