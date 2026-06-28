# Test レビュー — PR #802 Round 3 (Issue #789)

**レビュー対象**: PR #802 — ノート編集画面のタグ入力 combobox 化・候補ドロップダウン追加
**実装計画**: .issue/789/plan.md
**テストファイル**: 
- `app/components/note/editor/__tests__/tagSuggestModel.test.ts` (27 tests)
- `app/components/note/editor/__tests__/TagsInput.test.tsx` (既存 6 + 新規 13 = 計 19 tests)
**視点**: Test（ゼロベースフルレビュー）

---

## レビュー結論

**Blockers**: 0（問題なし）
**Warnings**: 2（事前警告の品質向上）
**Notes**: 3（設計層の明確性、実装安全性）

R2 指摘 3W 3N がすべて対応済み。実装とテストの整合性は高く、計画の受け入れ基準を十分に担保している。

---

## Blockers

なし

---

## Warnings

**[W-001]** `aria-controls` と listbox `id` の実一致をテストしていない
- **場所**: `TagsInput.test.tsx:226-233`, `390-398`
- **理由**: L232 で `aria-controls` non-null チェックのみ。実装では `aria-controls={listboxId}`（L202）と `id={listboxId}`（L230）が同じ useId で生成されるため安全だが、テストでは「両者が実一致するか」を明示的に検証していない。テスト側で aria-controls 値を抽出し listbox.id と比較するケースが欠けている。
- **影響**: 低い（useId の determinism は React の保証）。しかし a11y tool による検証では aria-controls/id 不一致がエラーになるため、テスト明示性としては確認推奨。
- **提案**: テスト時に aria-controls 値と listbox.id を比較するアサーションを追加。
  ```typescript
  it("aria-controls points to the correct listbox id", () => {
    renderInput({ draft: "re", suggestions: ["react", "redux"] });
    focusInput();
    const input = getInput();
    const listbox = container.querySelector('[role="listbox"]');
    const ariaControls = input.getAttribute("aria-controls");
    expect(ariaControls).toBe(listbox?.id);
  });
  ```

**[W-002]** `data-active` attribute と `aria-selected` の同期をテストしていない
- **場所**: `TagsInput.test.tsx:235-251`
- **理由**: L245 `aria-selected={isActive}` と L245 `data-[active]:...` が実装では常に同期しているが、テストでは option ボタンのクリック後に「`data-active` が削除される」ことを確認していない。つまり、active option が toggle されたときに両属性が確実に消えるか、つくかを explicit に検証していない。
- **影響**: 低い（実装で isActive 単一の真実値から両属性を同期生成）。しかし aria-selected は ARIA spec で boolean であり、テストで「removed ≠ falsey」を区別しないと微妙な属性管理の変更に気づきにくい。
- **提案**: option を click した直後に同じ option の `data-active` が削除されることを explicit テスト。
  ```typescript
  it("removes data-active and aria-selected when option is deselected (click)", () => {
    renderInput({
      draft: "re",
      suggestions: ["react", "redux"],
      onAddTag: vi.fn(),
    });
    focusInput();
    pressKey("ArrowDown");
    expect(options()[0]?.getAttribute("data-active")).not.toBeNull();
    // Click commits; activeIndex is reset to -1; panel closes.
    const option = options()[0];
    act(() => {
      option?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // After click, re-render; panel is closed so no options.
    // This test confirms the visual state transitions correctly.
    expect(container.querySelector('[data-active]')).toBeNull();
  });
  ```

---

## Notes

**[N-001]** `classifyDraft` の "exact" vs "dup" の semantics が implicit
- **場所**: `tagSuggestModel.test.ts:52-70`, `TagsInput.test.tsx:288-298`
- **理由**: classifyDraft の return type `"exact" | "dup" | "empty" | "new"` で "exact" = 既存タグと一致、"dup" = 確定済み chip と一致と区別されるが、テスト・component 層での使い分けが implicit。TagsInput では classification を `useMemo` (L87) で computed するだけで、"dup" の UI 表示（重複警告など）がない。plan L85 で「既存・既 committed のいずれとも一致しない有効な新規」と区別すると明記されているが、"dup" の UX が実装・テストに反映されていない。
- **影響**: 低い（plan では "dup" → commit 抑止（inline validation + blur）で担保と明記。テストは "dup" 時 validation=null の場合を L59-60 で確認）。しかし component 層で "dup" classification が使われていないため、「なぜ返り値があるのか」が曖昧。
- **提案**: JSDoc で "dup" の役割を明記するか、plan に「"dup" は現在 validation 層で重複除外され、component では未使用」と記録。

**[N-002]** `validateTagDraft("")` と `validateTagDraft("   ")` の一貫性が implicit
- **場所**: `tagSuggestModel.test.ts:74-77`, 実装 L143（trim 後 length check）
- **理由**: validator は `trim()` で空白を除去してから `length === 0` チェック（L143）するため、`validateTagDraft("")` と `validateTagDraft("   ")` が両方 `null` を返す。テストでは両者を並べて確認（L75-76）しているが、comment に「なぜ trim するのか」（即ち「空白のみ draft はエラーにしない設計」）が明記されていない。plan L87 で「空欄時はエラー非表示」と明記されているが、「なぜ空白を許容するか」の Why は comment に欠けている。
- **影響**: 低い（実装・テストとも正確）。後続の保守で「なぜ空白 draft は valid か」を誤解する可能性のみ。
- **提案**: test comment に「空白のみ draft は NG ではなく、UI フィードバックのノイズ軽減（AC-6）」を明記。
  ```typescript
  it("returns null for blank / whitespace-only drafts (no nag)", () => {
    // Whitespace-only draft is not a validation error (only non-empty invalid
    // drafts like "foo bar" or length>50 are surfaced). This avoids noise when
    // the user has only typed spaces or the field is empty (AC-6).
    expect(validateTagDraft("")).toBeNull();
    expect(validateTagDraft("   ")).toBeNull();
  });
  ```

**[N-003]** `nextSuggestIndex` wrapping の non-wrapping 条件が implicit
- **場所**: `tagSuggestModel.test.ts:130-133`
- **理由**: test L130-133 で "wraps at both ends" を検証（`(current+1)%count`）。しかし「`count=0` のとき wraps ではなく `-1`」を返す条件（L184 `if (count <= 0) return -1`）が、テストの "wraps" comment では見落とされている。実装は正しいが、テスト comment が wrapping の全条件を説明していない（count>0 のみで wraps、count≤0 では non-wrapping）。
- **影響**: 低い（実装は正しく、test L135-137 で "empty list" ケースは別途カバー）。ただし wrapping 動作の scope（「count>0 時のみ」）が comment で明示されていないため、保守時の誤解の余地あり。
- **提案**: test comment に「wrapping is only when count>0」を明記。
  ```typescript
  it("wraps at both ends (count>0 only)", () => {
    // Wrapping % modulo only applies when count > 0; empty/null list
    // stays at -1 (see separate test).
    expect(nextSuggestIndex(4, "down", 5)).toBe(0);
    expect(nextSuggestIndex(0, "up", 5)).toBe(4);
  });
  ```

---

## 総合評価

### 受け入れ基準カバレッジ

| AC | 検証層 | ステータス | 備考 |
|----|----|----------|------|
| AC-1 | TagsInput.test.tsx:113-126 + styles | ✓ | chip + input コンテナ、focus-within ボーダー |
| AC-2 | TagsInput.test.tsx:113-126 | ✓ | placeholder、× 削除ボタン、disabled |
| AC-3 | TagsInput.test.tsx:226-233, tagSuggestModel:18-21,38-42 | ✓ | candidates filter + substring |
| AC-4 | TagsInput.test.tsx:235-251 | ✓ | ↑↓ + Enter で候補 commit |
| AC-5 | TagsInput.test.tsx:288-298 | ✓ | 新規 vs 既存区別（classifyDraft） |
| AC-6 | TagsInput.test.tsx:300-314 | ✓ | 50 超・空白エラー + commit 抑止 |
| AC-7 | TagsInput.test.tsx:219-224, 230, 242-246 | ✓ | ARIA: combobox/listbox/option/activedescendant |
| AC-8 | TagsInput.test.tsx:152-157, 264-269 | ✓ | IME 矢印 / Enter 無視 |
| AC-9 | tagSuggestModel.test.ts（全体） + manual-test | ✓ | Enter/comma/Backspace/blur/autosave |
| AC-10 | styles.ts + manual-test | ✓ | Tailwind + tokens のみ |
| AC-11 | 実装ステップ 7 | ✓ | typecheck/lint/format |

**すべてカバー**。

### テスト層別評価

| 層 | テスト数 | 評価 | 備考 |
|----|--------|------|------|
| tagSuggestModel | 27 | A | filter/classify/validate/clamp/next 全境界。正規化・substring・count=1 全カバー（R2 推奨反映）。 |
| TagsInput component | 19 | A | 既存 6 ロック + 新規 combobox 13 ケース。ARIA・キーボード・パネル・error 網羅。DOM selector の brittle 性は低い（aria-label/role 絶対セレクタ使用）。 |
| 手動テスト | report.md | A | 11/12 PASS・1 SKIP（disabled）。ブラウザ検証で unit test 補完。 |

### 警告的所見

| 項目 | リスク | 対応 |
|----|----|------|
| aria-controls/id 一致 | low（useId 保証） | test 明示推奨（W-001） |
| data-active/aria-selected 同期 | low（単一真実値） | 削除 transition test 推奨（W-002） |
| classifyDraft "dup" 未使用 | low（plan 明記） | JSDoc 明記 or plan 追記（N-001） |
| validateTagDraft trim 理由 | low（実装正確） | test comment 追記（N-002） |
| nextSuggestIndex wrapping scope | low（実装正確） | test comment 追記（N-003） |

---

## まとめ

| 指標 | 評価 |
|-----|------|
| **実装と計画の整合性** | 高（AC-1～11 全カバー） |
| **テスト網羅度** | 高（境界・エッジ・ARIA・error 全層） |
| **テスト品質** | A（R1/R2 指摘全対応・flaky なし） |
| **保守性** | A-（comment で Why 明記可能な箇所 3/100） |

**判定**: **合格**。テストは実装を十分に担保。Blockers なし。推奨 Warnings 2 つは test 透明性向上のための polish。

---

## 詳細所見

### tagSuggestModel.test.ts

#### 強み
- **filterTagSuggestions**: 空 draft・部分一致・substring・committed 除外・正規化・上限、すべてカバー。
- **classifyDraft**: empty/exact/dup/new の 4 classification と正規化ケース両方検証。
- **validateTagDraft**: 空白・50 超・parseTagInput 分割トークン全検証（S-001 compliance）。
- **clampSuggestIndex**: -1 sentinel 保持（arch-risk R2 P-001 critical）、上限丸め、空list、all pass through。
- **nextSuggestIndex**: -1 から下/上で先頭/末尾（skip なし）、wrapping（count>0）、count=1 edge case。

#### 可能な改善（optional）
- none（十分に網羅）

### TagsInput.test.tsx

#### 既存 6 ロック維持
1. ✓ Enter/comma commit（L128-142）
2. ✓ IME composing guard（L152-157）
3. ✓ Backspace 末尾削除（L159-172）
4. ✓ × 削除（L174-185）
5. ✓ blur commit（L187-206）
6. ✓ disabled state（L208-215）

#### 新規 combobox テスト（13 ケース）
- ✓ ARIA contract（L219-224）
- ✓ suggestions filter（L226-233）
- ✓ ArrowDown highlight first（L235-251, arch-risk P-001 critical）
- ✓ unhighlighted Enter drafts new（L253-262, P-001）
- ✓ IME ArrowUp/Down guard（L264-269）
- ✓ Escape close（L271-278）
- ✓ empty draft focus no-panel（L280-286, S-001）
- ✓ new-draft panel（L288-298, R3 P-001）
- ✓ invalid draft suppression（L300-314, S-002）
- ✓ option click（L317-332, B-001）
- ✓ ArrowUp no-suggestions（L335-348, B-002）
- ✓ disabled panel（L351-360, B-003）
- ✓ draft-change activeIndex reset（L363-388, W-001）
- ✓ listbox DOM sync（L391-398, W-002）
- ✓ new-draft-only panel（L401-408, R3 P-001）
- ✓ error aria-live（L411-416, W-003）
- ✓ whitespace draft no-error（L419-423, W-004）
- ✓ aria-describedby（L426-432, W-005）

#### Brittleness assessment
- **getInput()**: `input[aria-label="新規タグ"]` — absolute selector（design 意도대로 유지）✓
- **removeButtons()**: `button[aria-label$="を削除"]` — suffix match（pattern stable）✓
- **options()**: `[role="option"]` — role selector（atomic）✓
- **listbox**: `[role="listbox"]` — atomic ✓

DOM 구조 변경에 강健함（aria-label/role 기반）。

#### Assertion sharpness
- aria-expanded boolean state ✓
- aria-activedescendant id suffix check ✓（`endsWith("-0")`）
- data-active non-null check ✓
- onAddTag call count + arg ✓
- textContent substring ✓

锐度 충분（문제 없음）。

### 抜けている異常系ケース

1. **large suggestion list + scroll into view**: scrollIntoView は happy-dom では no-op。手動 test で確認。acceptable。
2. **option focus trap（外側 click で close）**: plan ADR-004 で「cursor focus を input に 유지、Escape/blur で close」と明記。외측 click close는 test 범위 외（실제 환경에서 blur 경로로 cover）。
3. **committed tag with invalid name**: committedKeySet（L47-58）で try/catch し skip。테스트 L23-25 で커버（비유효 committed는 제외）。
4. **multi-token paste（"tag1,tag2,tag3"）**: parseTagInput 분할 후 각각 validate（L144-154）。테스트 L94-98 에서 일부 커버（단일 불유효 토큰）。전체 시나리오는 reducer 테스트 영역（이 테스트 범위 밖）。

모두 acceptableㅤ（설계 및 테스트 범위 명확）。

---

**R3 결론**: Test는 구현을 충분히 담보. Blockers 없음. Warnings 2개는 transparency 향상용. Notes 3개는 comment 명확화용. 합격.
