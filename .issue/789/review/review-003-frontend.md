# Frontend レビュー — Issue #789 (Round 3: ゼロベース)

**レビュー日**: 2026-06-28  
**対象**: PR #802  
**視点**: Frontend 実装の正確性・a11y・UX

---

## 総評

実装は**全体的に高い品質**で、計画の ADR を正確に踏襲している。combobox の ARIA、`-1` 始点ナビゲーション、IME ガード、blur 競合対策、panelOpen 述語の役割分離はすべて期待どおり機能している。Tailwind/styles の再利用も適切で、新規 CSS/@apply は増やしていない。

ただし、新規作成行の a11y 表現（`aria-hidden="true"`）と、disabled 時の focus 管理に軽微な懸念点あり。いずれも機能上の支障はないが、a11y 体験の質を高めるには調整の余地あり。

---

## Blockers

なし

---

## Warnings

### [W-001] 新規作成行の `aria-hidden="true"` がスクリーンリーダーユーザーから完全に隠す

**場所**: `app/components/note/editor/TagsInput.tsx:261`

```jsx
{isNewDraft ? (
  <div className={tagSuggestOptionNew} aria-hidden="true">
    ＋「{draft.trim()}」を新規作成
  </div>
) : null}
```

**理由**: 新規作成行は視覚的には明示的に表示されるが、`aria-hidden="true"` により全 screen reader から隠される。キーボードユーザー（スクリーンリーダー利用者）は draft を Enter で確定できるため機能上は問題ないが、「新規タグを作成可能」という情報がスクリーンリーダーユーザーに明示されない。

**期待値**: 
- **Option 1（推奨）**: `aria-hidden="true"` を削除し、新規作成行もスクリーンリーダーで読み上げられるようにする。この場合、新規作成行に `role="option"` を付与するか、別の役割を定義する必要がある（ただし activedescendant カウント外に留める）。
- **Option 2（現状維持）**: `aria-hidden="true"` を明示的に残すなら、JSDoc に「新規作成行は視覚的インジケータのみ。キーボードユーザーは draft を Enter で確定」と理由を記載し、意図的な設計であることを明確にする。

**提案**: Option 2 を採り、JSDoc を 1 行追加して設計意図を言語化する方が実装変更が小さく、計画との整合も取れると考えられる。

---

### [W-002] disabled 時に open フラグが立つ可能性（edge case）

**場所**: `app/components/note/editor/TagsInput.tsx:208-209`

```jsx
onChange={(e) => {
  onSetDraft(e.target.value);
  if (!disabled) setOpen(true);  // disabled チェック
}}
```

**理由**: `onChange` は disabled input では発火しないため実装上の問題はないが、`onFocus` では disabled チェックが入っている一方 `onKeyDown` のキー処理では disabled チェックがない（L126-172）。consistency 観点では確認の価値あり。

**検査結果**: `onKeyDown` では：
- ArrowDown/Up (L127-140): disabled チェックなし
- Enter/comma (L141-161): disabled チェックなし  
- Escape/Backspace (L162-172): disabled チェックなし

ただし、disabled input から `onKeyDown` が発火すること自体が仕様的に不明なため、実装上の問題は低い。ブラウザが disabled input への keydown 発火を抑止するなら、extra チェックは冗長。

**提案**: disabled input からの keydown は browser が抑止する（標準動作）ため、現状は問題なし。ただし可読性のため、`onKeyDown` の最初に `if (disabled) return;` を 1 行追加してもよい（optional）。

---

## Notes

### [N-001] panelOpen 述語と ARIA 属性の役割分離が正確に実装されている

**検証**: L92 / L116-119 / L201-205

```jsx
const panelOpen = open && (hasSuggestions || isNewDraft);  // L92
const activeOptionId = 
  open && hasSuggestions && activeIndex >= 0
    ? `${optionIdBase}-${activeIndex}`
    : undefined;  // L116-119

aria-expanded={panelOpen}  // L201
{...( open && hasSuggestions ? { "aria-controls": listboxId } : {})}  // L202
{...(activeOptionId !== undefined ? { "aria-activedescendant": activeOptionId } : {})}  // L203-204
```

**良い点**:
- `aria-expanded` は **panelOpen**（パネル可視状態）を反映 → Escape クローズ後 false に
- `aria-controls`/`aria-activedescendant` は **`open && hasSuggestions`**（listbox 実在）の時のみ付与 → 新規作成行のみ表示時は非付与
- ADR-003 P-001 の役割分離が厳密に守られている

手動テストレポート（.issue/789/.manual-test/report.md:29）でも「Escape クローズ後 `aria-expanded="false"`」が確認されている。

---

### [N-002] `-1` 始点ナビゲーション ヘルパの実装が完璧

**検証**: `app/components/note/editor/tagSuggestModel.ts:159-188`

```javascript
export function clampSuggestIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  if (index < 0) return -1;
  if (index > count - 1) return count - 1;
  return index;
}  // 下限 -1 を保持 ✓

export function nextSuggestIndex(
  current: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) return -1;
  if (current < 0) return direction === "down" ? 0 : count - 1;  // 無アクティブから ↓ で先頭（0）✓
  if (direction === "down") return (current + 1) % count;
  return (current - 1 + count) % count;
}
```

**検証ポイント**:
- `clampSuggestIndex(-1, n) === -1`（下限 -1 保持）✓
- `nextSuggestIndex(-1, "down", n) === 0`（無アクティブから ↓ で先頭候補、飛ばさない）✓  
- draft 変化での `-1` リセット後も clamp で 0 へ押し戻されない（L105-106）✓

テスト（TagsInput.test.tsx:235-251, 253-262, 363-388）でも全カバー。

---

### [N-003] IME ガードが ArrowUp/Down にも適用されている

**検証**: `app/components/note/editor/TagsInput.tsx:128`

```jsx
if (event.key === "ArrowDown" || event.key === "ArrowUp") {
  if (event.nativeEvent.isComposing) return;  // ✓
```

**良い点**: DirectoryTreeSelect は Enter のみガードだが、本件は矢印もガード（ADR-003 Consequences に明記）。日本語入力中の矢印キーが IME 候補移動に奪われず、タグ候補ナビゲーションも奪われない設計。テスト（L264-269）で検証済み。

---

### [N-004] 後方互換性が完全に保たれている

**検証**: `app/components/note/editor/NoteEditor.tsx:102`

```typescript
tagSuggestions?: readonly string[];
```

**ルート配線**:
- `new.tsx:33`: `tagSuggestions={tags.tags.map((t) => t.name)}`
- `edit.tsx:62`: `tagSuggestions={tags.tags.map((t) => t.name)}`
- TagsInput デフォルト (L72): `suggestions = []`

既存の呼び出し元（`IngestionPreviewForm` など）が `tagSuggestions` を省略しても、`[]` で安全に動作。

---

### [N-005] blur 競合対策が確実

**検証**: `app/components/note/editor/TagsInput.tsx:248`

```jsx
onMouseDown={(e) => e.preventDefault()}  // option は blur を奪わない
```

オプションをクリック後、blur が発火せず draft が二重 commit されない。テスト（L317-332）で「blur 暴発なし」を確認。

---

### [N-006] スタイリングが CLAUDE.md 規約を完全に守っている

**検証**: `app/components/note/editor/styles.ts:89-145`

- `tagsRow`: `focus-within:border-accent focus-within:shadow-focus` でフォーカス可視化 → AC-1 ✓
- `tagInputControl`: `focus-visible:shadow-none` でグローバルリングを打ち消し（二重リング回避）→ styles.ts コメント L116-119 に理由明記 ✓
- `tagSuggestPanel`: 既存 `dirDropdownPanel` を踏襲した絶対配置 ✓
- `tagSuggestOption`: `data-[active]` で state 属性規約 ✓
- 新規 CSS/@apply なし（Tailwind ユーティリティのみ）✓
- data-* 規約準拠 ✓

---

### [N-007] invalid draft の commit 抑止が多重防御

**検証**: `app/components/note/editor/TagsInput.tsx:156-157, 220`

**inline**:
```jsx
if (validationError !== null) return;  // Enter/comma での commit 抑止
if (draft.trim().length > 0 && validationError === null) {  // blur での commit 抑止
```

**save-time** (権威):
- `app/core/domain/tag/valueObject.ts` の `TagName.create` が保存時に値オブジェクト構築で再度検証

inline はプレビュー・save-time が権威（CLAUDE.md 準拠）。テスト（L300-314）で invalid draft が chip 化されず draft のまま保持されることを確認。

---

### [N-008] 空状態の安定した挙動

**検証**: `app/components/note/editor/tagSuggestModel.ts:76-77`

```javascript
const query = matchKey(draft.trim());
if (query.length === 0) return [];  // 空 draft は候補 ≠ 返さない
```

**結果**:
- フォーカスのみ（未入力）では `aria-expanded="false"`（パネル非表示）
- typing 開始後に初めてパネル開く
- エラーもまた空 draft では非表示（L143）

テスト（L280-286）で「empty draft on focus」の非表示を確認。

---

### [N-009] 新規/既存の区別表示が構造的に正確

**検証**: `app/components/note/editor/TagsInput.tsx:227-265`

```jsx
{panelOpen ? (
  <div>
    {hasSuggestions ? (
      <div role="listbox">
        {candidates.map(/* 既存タグ `#name` */)}
      </div>
    ) : null}
    {isNewDraft ? (
      <div aria-hidden="true">＋「{draft}」を新規作成</div>
    ) : null}
  </div>
) : null}
```

- 既存候補: `listbox/option` ナビ対象
- 新規作成行: 非 option インジケータ（ナビ対象外）
- `isNewDraft` は `classifyDraft(...) === "new" && validationError === null` でゲート（不正 draft で誤表示なし）

AC-5「新規/既存の区別」に完全対応。

---

### [N-010] disabled の扱いが完全

**検証**: `app/components/note/editor/TagsInput.tsx:184, 198, 209-212, 351-360`

- chip × ボタン: `disabled={disabled}` ✓
- input: `disabled={disabled}` ✓
- focus/onChange で `if (!disabled) setOpen(true)` ✓
- テスト（L351-360）で「disabled 時は suggestions 非表示」を確認 ✓

---

### [N-011] テストカバレッジが十分

**確認した項目**:
1. 既存ロック（Enter/comma/IME/Backspace/×/blur/disabled）全維持
2. `-1` 始点ナビ（最初の ↓ で先頭を飛ばさない）L235-251 ✓
3. 未選択 Enter で draft 確定 L253-262 ✓
4. IME 中の ArrowDown/Up 無視 L264-269 ✓
5. Escape クローズ（draft 保持） L271-278 ✓
6. 空 draft フォーカス非表示 L280-286 ✓
7. 新規作成行のみパネル（`aria-controls` 非付与） L400-408 ✓
8. Invalid draft suppress L300-314 ✓
9. Blur での commit 抑止（invalid） L187-195 ✓
10. Draft 変化での activeIndex リセット L363-388 ✓
11. 候補クリック（blur 暴発なし） L317-332 ✓

---

### [N-012] タグの正規化ルールが厳密に分離

**検証**: `app/components/note/editor/tagSuggestModel.ts:26-39, 124-157`

**Matching** (lenient):
```javascript
function matchKey(raw: string): string {
  const normalised = raw.normalize("NFKC");
  const withoutHash = normalised.startsWith("#") ? normalised.slice(1) : normalised;
  return withoutHash.toLowerCase();
}
```
→ throw しない（入力途中の未確定値でも計算可）

**Validation** (strict):
```javascript
export function validateTagDraft(draft: string): string | null {
  if (draft.trim().length === 0) return null;  // 空欄→エラーなし
  const tokens = parseTagInput(draft);
  for (const token of tokens) {
    try {
      TagName.create(token);  // ドメイン権威
    } catch (error) {
      return TAG_ERROR_MESSAGES[error.code];
    }
  }
  return null;
}
```
→ 権威ある検証

ADR-002 の「ルール重複を避ける」を完全実装。

---

## 最終判定

**Blockers**: 0 / **Warnings**: 2 / **Notes**: 12

Frontend の視点では、実装は**高い品質**で、計画と ADR をほぼ完璧に踏襲している。ARIA combobox、`-1` 始点ナビ、IME ガード、blur 競合対策、panelOpen 述語の役割分離はすべて正確。

指摘した 2 つの Warning はいずれも機能上の支障がなく、a11y/clarity の微調整レベル。特に [W-001] は、計画の意図的な設計（新規作成行は視覚的インジケータ）を JSDoc で明確化することで解決可能。

品質上、merge 可能と判断される。

