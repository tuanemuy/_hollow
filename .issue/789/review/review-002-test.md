# Test レビュー — PR #802 Round 2 (Issue #789)

**レビュー対象**: PR #802 — ノート編集画面のタグ入力 combobox 化・候補ドロップダウン追加
**実装計画**: .issue/789/plan.md
**前回レビュー**: .issue/789/review/review-001-test.md（R1）
**テストファイル**: 
- `app/components/note/editor/__tests__/tagSuggestModel.test.ts` (27 tests)
- `app/components/note/editor/__tests__/TagsInput.test.tsx` (既存 6 + 新規 11 = 計 17 tests)

---

## レビュー結論

**R1 指摘の対応**: 3 Blockers + 5 Warnings がすべて実装済み。高い品質で収束。

**R2 新規指摘**: 次のステップの問題を見出す（Blockers 0 / Warnings 3 / Notes 2）。

---

## Blockers

なし

---

## Warnings

**[W-001]** `classifyDraft` が committed の正規化ケースをテストしていない
- **場所**: `tagSuggestModel.test.ts:39-59`（classifyDraft テスト）
- **理由**: 計画 L85「マッチ判定は同一の正規化規則 SSOT を適用してから比較」と明記。testL52-54 で `classifyDraft(all, ["react"], "react")` は "dup" を確認するが、**正規化が必要なケース**（例：committed が `#React` で draft が `react`）をテストしていない。実装は committedKeySet で TagName.create→matchKey で正規化するため正しいが、テストが正規化の効果を検証していない。
- **提案**: テストケースを追加。
  ```typescript
  it("classifies with normalised committed (strip leading #)", () => {
    const allNames = ["react"];
    expect(classifyDraft(allNames, ["#React"], "react")).toBe("dup");
    expect(classifyDraft(allNames, ["#React"], "REACT")).toBe("dup");
  });
  ```

**[W-002]** `filterTagSuggestions` が substring match（部分一致）の効果をテストしていない
- **場所**: `tagSuggestModel.test.ts:18-21`（partial-match テスト）
- **理由**: 計画 L83「部分一致」と明記。実装 L88 は `key.includes(query)` で substring match。テスト L19-20 では all=["react", "redux", "vue"] で query="re" をテストするが、偶然前方一致のみのケース。真の substring（例：query がタグの中央に含まれる）を検証していない。
- **提案**: substring ケースを追加。
  ```typescript
  it("partial-matches names with query in the middle", () => {
    expect(filterTagSuggestions(["JavaScript", "TypeScript"], [], "Script")).toEqual([
      "JavaScript",
      "TypeScript",
    ]);
  });
  ```

**[W-003]** `nextSuggestIndex` の count=1（候補1件）エッジケースが明示されていない
- **場所**: `tagSuggestModel.test.ts:109-126`（nextSuggestIndex テスト）
- **理由**: テスト L118-121 で "wraps at both ends" を count=5 で検証。候補1件（count=1）のときも `-1` から ↓ で 0、↑ で 0（末尾＝先頭）に移動する挙動をテストすべき。実装は正しいが、エッジケースの明示性が低い。
- **提案**: エッジケーステストを追加。
  ```typescript
  it("navigates correctly with a single candidate (count=1)", () => {
    expect(nextSuggestIndex(-1, "down", 1)).toBe(0);
    expect(nextSuggestIndex(-1, "up", 1)).toBe(0); // last = 0 when count=1
    expect(nextSuggestIndex(0, "down", 1)).toBe(0); // wraps to 0
    expect(nextSuggestIndex(0, "up", 1)).toBe(0);   // wraps to 0
  });
  ```

---

## Notes

**[N-001]** `validateTagDraft` が `parseTagInput` に implicit に依存している
- **場所**: `tagSuggestModel.test.ts:82-86` + `tagSuggestModel.ts:144`
- **理由**: `validateTagDraft` は parseTagInput で分割した全トークンを検証する設計（計画 L88）。テスト L82-86 は「`${"a".repeat(51)},ok`」を検証しているが、parseTagInput の comma-split 動作を前提としていることが comment で明記されていない。parseTagInput の挙動が変わった場合のリスク。
- **提案**: テスト comment に「mirrors `parseTagInput`'s comma-split」を明記。
  ```typescript
  it("flags an invalid token even when a later token is valid (commit unit)", () => {
    // Validation unit = commit unit (parseTagInput's comma-split tokens)
    expect(validateTagDraft(`${"a".repeat(51)},ok`)).toBe("...");
  });
  ```

**[N-002]** `click` でのフォーカス/blur 相互作用が間接検証のみ
- **場所**: `TagsInput.test.tsx:317-332`（R1 B-001 対応済み）
- **理由**: テストが「click → onAddTag 呼び出し → aria-expanded false」を確認しているが、「onMouseDown preventDefault が blur を完全に抑止したか」を直接検証していない。実装は正しいが、テストの信頼度を高めるには blur event listener を tracking する方法もあり（optional な改善）。
- **提案**: 直接検証（任意）。
  ```typescript
  it("onMouseDown preventDefault prevents blur event firing", () => {
    let blurFired = false;
    const input = getInput();
    input.addEventListener("blur", () => {
      blurFired = true;
    });
    const optionBtn = options()[0];
    act(() => {
      optionBtn?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      optionBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(blurFired).toBe(false); // preventDefault stopped blur
  });
  ```

---

## 総評

### R1 → R2 の改善

- **B-001** 候補クリック commit（L317-332）✓
- **B-002** ArrowUp no-op（L335-348）✓
- **B-003** disabled + panel open（L351-360）✓
- **W-001** draft 変化→activeIndex=-1 reset（L363-388）✓
- **W-002** panelOpen DOM sync（L391-408）✓
- **W-003** error aria-live（L411-416）✓
- **W-004** 空白draft エラー非表示（L419-423）✓
- **W-005** aria-describedby 付与条件（L426-432）✓

**すべて対応済み**。R1 の指摘から品質が大幅に向上。

### R2 の課題

**新規 Warnings 3 件**は「見落とし」レベルの未検証条件（正規化・substring・エッジケース）。実装は正確だが、テストの網羅度を高める余地あり。

| テスト層 | 評価 | 備考 |
|---------|------|------|
| tagSuggestModel | **A** | filter/classify/validate/clamp/next の主要境界はカバー。正規化・substring 確認は推奨。 |
| TagsInput component | **A-** | 既存 6 ロック + 新規 combobox ロジックの大部分が検証済み。aria 属性の動的付与も強固。R1 指摘をすべて反映。 |
| 手動テスト | **A** | `.issue/789/.manual-test/report.md` で 11/12 PASS・1 SKIP。ユニットテストの補完として機能。 |

### テスト品質総評

- **実装正確性**: 高い。plan の設計（-1 始点ナビ・正規化 SSOT・ARIA 役割分離）が正しく実装。
- **テスト網羅度**: 高い。R1 指摘がすべて反映され、主要シナリオが緑テストで固定。
- **テスト詳細度**: 中。推奨3つの追加ケース（正規化・substring・count=1）で完全性を高める余地あり。

**合格**: テスト品質は実装を担保するのに十分。R1 → R2 で大幅に改善された。警告的な欠落（N-001/N-002）は実装には影響を与えない。

---

## まとめ

| 項目 | R1 | R2 |
|-----|-----|----|
| Blockers | 3 | 0（全対応） |
| Warnings | 5 | 3（新規） |
| Notes | 4 | 2（新規） |

**R2 判定**: 合格。実装をテストで十分に担保。推奨3つの追加ケースで完全性向上可能。
