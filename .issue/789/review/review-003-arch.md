# Code Review — Issue #789 (Round 3: Architecture・Convention)

**Reviewer**: Claude Code (Architecture specialization)
**Date**: 2026-06-28
**Scope**: PR #802 — Full implementation vs. CLAUDE.md + plan + ADR

---

## Summary

全体的に**アーキテクチャ・規約に対して高い遵守度**。内側レイヤー（domain/application/reducer）への改変なし、フロントの純粋ヘルパ・コンポーネント・スタイル完全分離。`-1` センチネルナビゲーション、data-* 規約、Tailwind + tokens 集約、検証境界の二重防御（inline プレビュー + save-time 権威）がすべて正確に実装されている。

**問題点**: なし（厳格にレビュー）
**Warnings**: 1 / **Notes**: 2

---

## Blockers（要修正レベル）

なし

---

## Warnings（要検討）

### [W-001] `aria-expanded` 属性のコンポーネント状態同期の曖昧性

**対象**: `TagsInput.tsx:201`

**状況**:
```tsx
aria-expanded={panelOpen}
```

`panelOpen = open && (hasSuggestions || isNewDraft)` と定義され、ARIA 規約上は正しく「パネルが表示されているか」を反映している。しかし実装面では、このロジックが:
- `open` フラグと
- `hasSuggestions`（候補リストの有無）と
- `isNewDraft`（新規作成行の有無）

の 3 要因に依存しており、例えば**後から `open` state を読み取り専用にしたり useCallback で memoize しようとするとき**、関連する `hasSuggestions` / `isNewDraft` が変わっても `panelOpen` を推定できない**トレーサビリティの破損リスク**がある。

**理由**: 現在は局所化されているため問題ないが、将来の保守（e.g., `open` state の外部制御、パネル表示ロジックの複雑化）時に「なぜこのロジックで `aria-expanded` が正しいのか」を再追跡するのに計算式の逆算が必要になる。ADR-003 の役割分離（`aria-expanded`＝パネル可視 vs. `aria-controls`＝listbox 実在）は大変理にかなっているが、comment で一行「`aria-expanded` は `open && (hasSuggestions || isNewDraft)` を反映し、Escape/blur クローズ後に false に変わる」と明示すると、のちの変更者が式を無条件に改変する誤りを防げる。

**提案**: `panelOpen` の定義行または直後に JSDoc を 1 行加える（例: `// aria-expanded はパネルの可視状態を反映`）。

---

### [W-002] `tagSuggestModel.ts` の仕様シグネチャが実装と齟齬

**対象**: `tagSuggestModel.ts:70-92, 33-38`

**状況**:
実装は正確だが、JSDoc の仕様記述が細部で異なる：

1. **`matchKey` JSDoc**: 「NFKC + leading-`#` strip + case-fold」と説明（L33）。実装は正しいが、この正規化が「`TagName` の比較サブセット」という関係を**明示していない**。`TagName.create` の実装を読まず済むまでは「なぜこの 3 ステップなのか」が自明でない。

2. **`filterTagSuggestions` の contract**: JSDoc は「an empty / whitespace-only draft returns `[]`」と述べるが、技術的理由（空文字は任意文字列の prefix）が説明されていない。実装レベルでは LI29-30 で理由が欲しい。

**理由**: JSDoc は将来の保守者向けの権威ある仕様書。フルテキストでなくても「なぜ」を 1 行で補足すると、サブセット流用・ルール変更時の判断が高速になる。

**提案**:
```ts
/**
 * ...
 * Contract: an empty / whitespace-only draft returns `[]` — a null query
 * would match every tag (empty string is a prefix of all), and focusing the
 * input without typing must not dump the whole list (suggestions appear only
 * on active input). Enforced with an early return at L76 (cf. classifyDraft
 * & validateTagDraft which also treat empty as a boundary).
 */
```

---

## Notes（情報・強み記録）

### [N-001] Pure function signature と lenient 例外処理の徹底

**対象**: `tagSuggestModel.ts` 全体

**観察**: 
- `filterTagSuggestions`, `classifyDraft`, `validateTagDraft` がすべて **never throw**（lenient）設計。
- `matchKey` は全域関数（入力途中の未確定 draft でも動く）。
- `validateTagDraft` は `TagName.create` を try/catch し、不正値を「エラーメッセージ」に変換（throw しない）。
- `committedKeySet` は reducer 由来の生文字列（`#Foo`/全角等）を `TagName.create` try/catch でスキップし、マッチ計算継続。

**評価**: 非常に良好。UI 層が「データが不正だから処理中断」ではなく「エラーメッセージを表示して続行」するモデルを支えている。CLAUDE.md の「検証は 2 点のみが権威」原則を実装層で忠実に守っている。既存ドメイン（`TagName.create`）への依存は適切で、ルール重複がない。

---

### [N-002] `clampSuggestIndex` / `nextSuggestIndex` の `-1` センチネル正確性

**対象**: `tagSuggestModel.ts:159-188`

**観察**:
- `clampSuggestIndex(-1, count)` → `-1` 保持（下限 -1）。
- `clampSuggestIndex(index >= count, count)` → `count - 1` に丸め。
- `nextSuggestIndex(-1, "down", count)` → `0`（先頭候補、**飛ばさない**）。
- `nextSuggestIndex(-1, "up", count)` → `count - 1`（末尾）。
- `nextSuggestIndex` 巡回時も wrap(`%count`)で正確。

テスト(`tagSuggestModel.test.ts:101-145`)もすべての境界を覆蓋（空 list、単一 candidate、wrap at both ends）。

**評価**: 数学的に正確。DirectoryTreeSelect の `clampActiveIndex`（下限 0）と明確に区別され、コメントで非互換性を明記。draft 変化で `activeIndex=-1` にリセットしても clamp useEffect（L104-106 TagsInput.tsx）が 0 へ押し戻さない設計。実装は計画どおり。

---

## Convention Checks

### Tailwind + tokens

✅ **OK**
- `styles.ts` に集約（13 個の定数）。
- すべて `className` リテラル（Tailwind JIT スキャン可能）。
- 新規 CSS/@apply なし。
- トークン参照（`--shadow-focus` / `border-hairline` / `bg-bg` / `text-error` / `accent-surface`）は既存 `tokens.css` に存在確認（plan-review 1 実施済み）。
- 状態 variant：`data-active`（`data-[active]:bg-surface`）、`focus-within:`（コンテナ枠フォーカス）、`hover:`（候補 option・chip）、`disabled:` など既存規約準拠。

### Data attributes

✅ **OK**
- `data-active={isActive || undefined}`（L245 TagsInput.tsx）：CLAUDE.md ADR-003 に従うフォーカス状態。
- `aria-hidden="true"`（L261）：新規作成行の意図的非表示。
- コンテナ `aria-label="タグ"`（L177）：`role="group"` 付き、fieldset 代替として biome-ignore で意図的抑止。

### 検証境界

✅ **OK**
- **Transport 境界**: ルート side（`new.tsx` / `edit.tsx`）で `loadAllTags` 結果を props に変換。schema 無し（内部-only）。
- **Value-object 構築**: `TagName.create` が保存時に権威。
- **UI inline preview**: `validateTagDraft` が `TagName.create` を try/catch しメッセージ化（プレビュー）。
- **Autosave bypass**: `useAutosave.ts` 無改変。draft ペイロードに tags 非送信（plan 通り）。実装の確認（R2 test result）で HAR capture + source dual check 完了。

### Reducer 無改修

✅ **OK**
- `editorState.ts`：呼び出すのみ（`parseTagInput`，L22 tagSuggestModel.ts）。`addTag` / `removeTag` / `setTagDraft` 無改変。
- `onAddTag` / `onRemoveTag` / `onSetDraft` はこれまで通り reducer に dispatch。
- transient state（`open`, `activeIndex`）はコンポーネント local `useState`（plan ADR-001 通り）。

### レイヤー依存

✅ **OK**
- **Domain import**: `TagName` / `BusinessRuleError` / `TagErrorCode`（`tagSuggestModel.ts`）。
  - すべて値オブジェクト・エラー型・コード定数。
  - UI 層から domain への参照は CLAUDE.md では明確に許可（「トランスポート境界と値オブジェクト構築」が権威）。
  - ドメイン ← presentation（逆方向）はなし。
- **Application import**: なし（必要ない）。
- **Adapter import**: なし。

### JSDoc・コメント

✅ **OK**（Minor enhancement 余地）
- `TagsInput.tsx:23-55`：詳細な component JSDoc。ADR-003 参照、`-1` 始点、新規作成行の非インタラクティブ性、IME ガード。
- `tagSuggestModel.ts:1-17`：motivation comment。lenient vs. validation 分離。
- `styles.ts:82-90, 112-122` など：state 引き継ぎ理由、二重リングの打ち消し理由を明記。

**微細**: `panelOpen` 定義（L92 TagsInput.tsx）に「ARIA reflected」一行あると ↑ の W-001 を軽減。

### Test coverage

✅ **OK**
- `tagSuggestModel.test.ts`：filter (normalize, exclude, limit, empty)、classify (4 state)、validate (blank, over-50, whitespace, comma-token)、clamp（-1 preserve）、next（-1→0 no-skip）。
- `TagsInput.test.tsx`：既存 6 ロック全維持 + 新規 12+ (combobox ARIA, suggestion display, -1 Enter new draft, first ArrowDown no skip, IME arrow guard, Escape close, create-new indicator, invalid draft suppress, reset on draft change, panelOpen sync)。

---

## Integrity Checks

### ADR conformance

- **ADR-001** (transient state local): ✅ open/activeIndex useState。reducer 無改修。
- **ADR-002** (validation SSOT): ✅ validateTagDraft が TagName.create 唯一の権威。
- **ADR-003** (activedescendant a11y): ✅ -1 start、role 正確、aria-expanded/controls/activedescendant 条件付き。
- **ADR-004** (hand-written absolute): ✅ tagSuggestPanel absolute (tagsRow relative anchor)。Popover 不使用。dirDropdownPanel 踏襲。
- **ADR-005** (matchKey lenient): ✅ never throw。TagName 正規化サブセット。
  
All ADRs implemented as designed.

### Plan conformance

- **ステップ 1** (pure helper): ✅ tagSuggestModel.ts 新規（-1 aware clamp/next）。
- **ステップ 2** (styles): ✅ tagsRow/tagInputControl/tagsField/tagSuggestPanel/tagSuggestOption(New)/tagInputError。focus-within リング、input shadow-none。
- **ステップ 3** (TagsInput): ✅ combobox role、aria-activedescendant、open/activeIndex state、panelOpen predicate、keyboard IME guard、Escape/blur/commit close、disabled。
- **ステップ 4** (NoteEditor wire): ✅ SharedProps.tagSuggestions?、TagsInput suggestions prop pass。
- **ステップ 5** (Route wire): ✅ new.tsx / edit.tsx で loadAllTags.tags.map(t => t.name)。将来 autocomplete コメント update。
- **ステップ 6** (Test): ✅ tagSuggestModel unit (境界全覆蓋)、TagsInput component (既存+新規 lock)。
- **ステップ 7** (Final gate): テスト報告では `pnpm typecheck/lint/format` pass 確認済み（manual-test report.md）。

All steps verified.

---

## Error Handling

### Lenient vs. strict の役割分離

**inline validation** (lenient, never-throw):
```ts
validateTagDraft(draft) → string | null  // preview only
classifyDraft(...)     → "new" | ...      // display split, lenient
filterTagSuggestions() → candidate[]      // empty draft → []
```

**Save-time validation** (strict, throw):
```ts
TagName.create(name) → throws BusinessRuleError on invalid
// Called by resolver at save-time (authority)
```

この分離は正確。UI は preemptive に reject するが、未クリアの不正 draft が submit に紛れても `TagName.create` が最後のゲート。inline のプレビュー役割を CLAUDE.md に一致させている。

---

## Remaining observations

### Optional prop backward compatibility

✅ **OK**
- `NoteEditor` の `tagSuggestions?: readonly string[]`（L102 NoteEditor.tsx）で optional。
- 初期値 `[]`（L497）で既存呼び出し元非破壊。
- IngestionPreviewForm 等の NoteEditor 呼び出し（plan リスク「別経路利用」）は検証済み：plan-review Coverage P-001 で実コード照合「NoteEditor 呼び出しは 2 route のみ、IngestionPreviewForm は使わず独自 parseTagInput」を確認。

### IME composition guard

✅ **OK**
- `isComposing` guard は Entry + comma + ArrowUp + ArrowDown（L127-140 TagsInput.tsx）。
- plan との差違（DirectoryTreeSelect は Enter のみ）を意識（L153-154 plan）。
- test で `pressKey("ArrowDown", { isComposing: true })` → no-op 固定（TagsInput.test.tsx:264-269）。

### Option click `onMouseDown preventDefault`

✅ **OK**
- L248（TagsInput.tsx）：blur hijack 防止。既存定石（DirectoryTreeSelect:321）を踏襲。

---

## Summary Verdict

**全体評価: APPROVED**

アーキテクチャ・規約観点で問題なし。Tailwind 集約、data-* 規約、検証境界二重防御、純粋ヘルパ、レイヤー依存方向維持がすべて正確。ADR-001〜005 完全実装。計画との整合性 100%。

**Warnings（軽微、実装影響なし）**:
1. W-001: `panelOpen` ロジックの comment 補足推奨。
2. W-002: `filterTagSuggestions` contract の「なぜ空をフィルタするのか」理由を JSDoc に一行追加推奨。

**テスト品質**: 手動 11 PASS / 0 FAIL / 1 SKIP（disabled）、ユニット全境界覆蓋。

**後方互換性**: OK（tagSuggestions optional、他呼び出し元破壊なし）。

