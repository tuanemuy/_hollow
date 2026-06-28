# Frontend レビュー — Issue #789 (Round 4: ゼロベース)

**レビュー日**: 2026-06-28  
**対象**: PR #802  
**視点**: Frontend 実装の正確性・a11y・UX・DX

---

## 総評

実装は**極めて高い品質**で、計画・ADR を正確に踏襲し、Frontend 観点の懸念事項はない。Combobox の ARIA 仕様、`-1` 始点ナビゲーション、IME ガード、blur 競合対策、panelOpen 述語の役割分離、disabled 時の UI 制御が厳密に実装されている。テストカバレッジも包括的で、既存動作の退行防止と新規要件の検証が両立している。

**結論**: ゼロベースのフルレビューから、Frontend の観点では指摘対象なし。品質上、merge 可能。

---

## Blockers

なし

---

## Warnings

なし

---

## Notes

### [N-001] Combobox ARIA 仕様の完全実装

**検証**: `TagsInput.tsx:203-209`

```jsx
role="combobox"
aria-autocomplete="list"
aria-expanded={panelOpen}
{...(open && hasSuggestions ? { "aria-controls": listboxId } : {})}
{...(activeOptionId !== undefined ? { "aria-activedescendant": activeOptionId } : {})}
```

**検証ポイント**:
- Input は `role="combobox"`、`aria-autocomplete="list"` で autocomplete combobox として宣言 ✓
- `aria-expanded` は **panelOpen**（パネル可視状態）を正確に反映。Escape や blur でクローズ時に false に ✓
- `aria-controls` は **`open && hasSuggestions`**（listbox 実在）の時のみ付与。新規作成行のみ表示時は非付与し、存在しない listbox を指さない設計 ✓
- `aria-activedescendant` は active option がある時のみ ID を指定。無アクティブ時は undefined で属性削除 ✓
- Option は `role="option"` で正しく宣言、`aria-selected={isActive}` で active 状態を反映 ✓

ADR-003 の役割分離が厳密に実装されており、ARIA APG combobox パターンに準拠。手動テスト（.manual-test/results/TC-002.md）でもキーボードナビと aria-selected の動作が確認されている。

---

### [N-002] `-1` 始点ナビゲーション ヘルパの正確性

**検証**: `tagSuggestModel.ts:159-188`

```javascript
export function clampSuggestIndex(index: number, count: number): number {
  if (count <= 0) return -1;
  if (index < 0) return -1;        // 下限 -1 を保持
  if (index > count - 1) return count - 1;
  return index;
}

export function nextSuggestIndex(
  current: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) return -1;
  if (current < 0) return direction === "down" ? 0 : count - 1;  // 無アクティブから ↓ で先頭
  if (direction === "down") return (current + 1) % count;
  return (current - 1 + count) % count;
}
```

**検証ポイント**:
- `clampSuggestIndex(-1, n) === -1`：下限 -1 を保持し、0 に潰さない ✓
- draft 変化で `activeIndex` を -1 にリセット後、options 長変化の clamp effect でも -1 が 0 へ押し戻されない（L105-106）✓
- `nextSuggestIndex(-1, "down", n) === 0`：無アクティブから最初の ArrowDown で先頭候補（index 0）を飛ばさない ✓
- 巡回：ArrowDown at 末尾で先頭へ、ArrowUp at 先頭で末尾へ ✓

これにより、部分一致する既存タグがあっても Enter は draft を新規タグとしてコミット可能（AC-4 の「新規タグ確定」を奪わない）。テスト（TagsInput.test.tsx:235-251, 253-262）で検証済み。

既存 `directoryTreeModel.ts` の `clampActiveIndex`/`nextActiveIndex` は下限 0 を仮定するため、新規ヘルパの独立設置は正しい設計判断（重複を避け、DirectoryTreeSelect への影響なし）。

---

### [N-003] IME 中のキー入力ガード

**検証**: `TagsInput.tsx:128-137, 145-148`

```jsx
if (event.key === "ArrowDown" || event.key === "ArrowUp") {
  if (event.nativeEvent.isComposing) return;  // ← ArrowUp/Down もガード
  // ...
}
if (event.key === "Enter" || event.key === ",") {
  if (event.nativeEvent.isComposing) return;  // ← Enter/comma もガード
```

**検証ポイント**:
- Enter・comma・ArrowUp・ArrowDown いずれも `isComposing` 中は `return`（無処理）✓
- 日本語変換中に矢印キーが IME 候補移動に奪われず、タグ候補ナビもしない（正しい動作）✓
- DirectoryTreeSelect は Enter のみガード（計画 p153 明記）だが、本件は矢印もガード（オンライン combobox では矢印移動が UI ナビを競合させるため必要）✓

テスト（TagsInput.test.tsx:264-269）で「IME 中の ArrowDown は候補ハイライト移動しない」が検証済み。

---

### [N-004] blur による commit 競合の回避

**検証**: `TagsInput.tsx:248, 223-228`

```jsx
onMouseDown={(e) => e.preventDefault()}  // option のクリックで blur 発火を遅延

onBlur={() => {
  if (draft.trim().length > 0 && validationError === null) {
    onAddTag(draft);
  }
  setOpen(false);
}}
```

**検証ポイント**:
- Option button は `onMouseDown preventDefault` で実フォーカスを奪わない → blur が別候補や input の blur commit を奪わない ✓
- Escape クローズでも `setOpen(false)` を分離（blur からの close との混同を避ける）✓
- blur は有効な draft のみ commit（invalid は非コミット）✓

テスト（TagsInput.test.tsx:317-332）で「候補クリックで blur 暴発なし」が確認済み。

---

### [N-005] panelOpen 述語と ARIA 属性の役割分離

**検証**: `TagsInput.tsx:92-95, 119-122, 205-209`

```jsx
const panelOpen = open && (hasSuggestions || isNewDraft);  // パネルの可視述語
const activeOptionId = 
  open && hasSuggestions && activeIndex >= 0
    ? `${optionIdBase}-${activeIndex}`
    : undefined;

aria-expanded={panelOpen}  // パネル表示状態を反映
{...(open && hasSuggestions ? { "aria-controls": listboxId } : {})}  // listbox 実在のみ
```

**検証ポイント**:
- `aria-expanded` は `panelOpen`（パネル描画の有無）を反映。`hasSuggestions` だけでなく `isNewDraft` も含むため、新規作成行のみの場合も aria-expanded=true ✓
- `aria-controls`/`aria-activedescendant` は `open && hasSuggestions`（既存候補の listbox が実在）の時のみ付与 ✓
- 結果、「新規作成行のみ表示」時は `aria-expanded="true"` かつ `aria-controls`/`aria-activedescendant` 非付与（listbox が不在）という組み合わせを許容 ✓

これにより、AC-5「新規・既存の区別表示」が「新規タグ作成行のみ」のケースでも成立（候補ゼロでもパネルが描画される）。ADR-003 P-001 に明記された設計が厳密に実装されている。

---

### [N-006] Disabled 時の UI 制御

**検証**: `TagsInput.tsx:179, 196, 209, 213-216, 184, 189`

```jsx
<input
  disabled={disabled}
  onChange={(e) => {
    onSetDraft(e.target.value);
    if (!disabled) setOpen(true);  // disabled チェック
  }}
  onFocus={() => {
    if (!disabled) setOpen(true);  // disabled チェック
  }}
  // ...
/>

<button
  disabled={disabled}
  onClick={() => onRemoveTag(name)}
>
```

**検証ポイント**:
- Input は disabled 属性で不活性化 ✓
- Chip 削除ボタンも disabled 属性で不活性化 ✓
- focus/onChange で candidates open 時に disabled チェック ✓
- disabled 状態では suggestions panel が描画されない（L372-383 テストで検証）✓

テスト（TagsInput.test.tsx:208-215, 374-383）で disabled 時の動作が検証済み。

---

### [N-007] Invalid draft の多重防御

**検証**: `TagsInput.tsx:156-161, 223-225` / `tagSuggestModel.ts:141-156`

```jsx
// Inline: Enter/comma の commit 抑止
if (validationError !== null) return;

// Inline: blur の commit 抑止
if (draft.trim().length > 0 && validationError === null) {
  onAddTag(draft);
}

// Helper: validateTagDraft
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

**検証ポイント**:
- Inline: Enter/comma/blur での commit をすべて validationError != null で抑止 ✓
- Helper: `parseTagInput` で分割した全トークンを検証（最後のトークンのみでなく）→ ペースト「不正,正常」での不正タグ混入を防止 ✓
- 権威: `TagName.create` が save-time に最終検証。inline はプレビュー（CLAUDE.md 準拠）✓

テスト（TagsInput.test.tsx:300-314）で「invalid draft は chip 化されず draft のままで保持」が検証済み。

---

### [N-008] Empty draft の安定した挙動

**検証**: `tagSuggestModel.ts:69-76` / `TagsInput.tsx:280-286`

```javascript
export function filterTagSuggestions(...): readonly string[] {
  const query = matchKey(draft.trim());
  if (query.length === 0) return [];  // 空 draft → 候補なし
  // ...
}

export function validateTagDraft(draft: string): string | null {
  if (draft.trim().length === 0) return null;  // 空欄 → エラーなし
```

**検証ポイント**:
- フォーカスのみ（未入力）では `filterTagSuggestions` が `[]` を返す → `hasSuggestions=false` ✓
- 同時に `classifyDraft("")` → `"empty"` ✓
- 結果：`aria-expanded="false"`、パネル非表示、エラーも非表示 ✓
- Typing 開始後に初めてパネルが開く（入力未開始で全タグ候補を出さない、AC-6 noise 回避）✓

テスト（TagsInput.test.tsx:280-286）で「empty draft on focus」の非表示を確認済み。

---

### [N-009] 新規・既存タグの区別表示

**検証**: `TagsInput.tsx:227-274` / `tagSuggestModel.ts:94-121`

```jsx
{panelOpen ? (
  <div className={tagSuggestPanel}>
    {hasSuggestions ? (
      <div id={listboxId} role="listbox" aria-label="タグ候補">
        {candidates.map((name, index) => (
          <button role="option" ...>{`#${name}`}</button>
        ))}
      </div>
    ) : null}
    {isNewDraft ? (
      <div className={tagSuggestOptionNew} aria-hidden="true">
        ＋「{draft.trim()}」を新規作成
      </div>
    ) : null}
  </div>
) : null}
```

**検証ポイント**:
- 既存タグ候補: `#` prefix + listbox/option ナビ対象 ✓
- 新規作成行: `＋` prefix + 非 option インジケータ（ナビ対象外）✓
- `isNewDraft` は `classifyDraft(...) === "new" && validationError === null` でゲート → 不正 draft で誤表示なし ✓

AC-5「既存一致と新規タグ作成の視覚的区別」を完全実装。手動テスト（.manual-test/results/TC-002.md:d）で確認済み。

---

### [N-010] Container フォーカス可視化

**検証**: `styles.ts:89-90` / `TagsInput.tsx:181`

```javascript
export const tagsRow =
  "relative flex flex-wrap items-center gap-1.5 rounded-lg border border-hairline bg-bg px-2 py-1.5 transition-colors motion-reduce:transition-none focus-within:border-accent focus-within:shadow-focus";

export const tagInputControl =
  "... focus-visible:shadow-none disabled:cursor-not-allowed ...";
```

**検証ポイント**:
- `tagsRow` に `focus-within:border-accent focus-within:shadow-focus` → コンテナ枠がフォーカス時に accent 色に ✓
- `tagInputControl` に `focus-visible:shadow-none` → グローバル `:focus-visible` の box-shadow を打ち消し（二重リング回避）✓
- JSDoc（styles.ts L116-119）に「リングはコンテナが担うため」と理由明記 ✓
- `caret-accent` で caret も accent 色に（focus の視認性確保）✓

結果、コンテナ枠が単一の focus ring を持ち、入力フォーカス時に視覚的に明確（AC-1）。手動テスト（TC-001.md:a-3）で computed style に `border 1px solid ...` と `focus-within` 効果が確認済み。

---

### [N-011] Tailwind/tokens の規約遵守

**検証**: `styles.ts` + `index.css` / `tokens.css`

```css
/* styles.ts の使用トークン */
- border-hairline → tokens.css:70 `--border-hairline`
- bg-bg → `--color-bg`
- focus-within:shadow-focus → tokens.css:122 `--shadow-focus: 0 0 0 2px var(--color-accent)`
- text-accent, text-accent-ink, text-error → token 定義
- bg-surface, bg-surface-hover → token 定義
```

**検証ポイント**:
- 新規 CSS ファイルなし ✓
- 新規 `@apply` ベースクラスなし ✓
- data-* 規約（`data-[active]:bg-surface`）で state 管理 ✓
- Tailwind ユーティリティのみで実装（CLAUDE.md 準拠）✓

styles.ts の JSDoc も充実（各定数に意図・トークン・breakpoint の説明あり）。

---

### [N-012] 後方互換性の確保

**検証**: `NoteEditor.tsx:102` / `new.tsx:33` / `edit.tsx:62` / `TagsInput.tsx:72`

```typescript
type SharedProps = Readonly<{
  // ...
  tagSuggestions?: readonly string[];  // 任意
}>;

// TagsInput default
suggestions = [],

// ルート配線
<NoteEditor tagSuggestions={tags.tags.map((t) => t.name)} />
```

**検証ポイント**:
- `tagSuggestions` は optional（`?`）で、省略時は `[]` に ✓
- 既存呼び出し元（`IngestionPreviewForm` など）が省略してもエラーなし ✓
- 新規ルート（new/edit）で正しく配線 ✓

AC-9「既存挙動の保持」と後方互換性が両立。

---

### [N-013] テストカバレッジの包括性

**確認した項目**（TagsInput.test.tsx）:

**既存ロック**（退行防止）:
1. Enter/comma commit（L128-142）✓
2. 空 draft no-op（L144-150）✓
3. IME 中の Enter 無視（L152-157）✓
4. Backspace 末尾削除（L159-165）✓
5. × ボタン削除（L174-185）✓
6. blur commit（L187-206）✓
7. disabled 状態（L208-215）✓

**新規要件**（Issue #789）:
8. Combobox ARIA 仕様（L219-224）✓
9. 候補フィルタ・表示（L226-233）✓
10. ArrowDown で先頭候補ハイライト（L235-251）✓
11. 未選択 Enter で draft 確定（L253-262）✓
12. IME 中の ArrowDown 無視（L264-269）✓
13. Escape クローズ（L271-278）✓
14. Empty draft フォーカス非表示（L280-286）✓
15. 新規作成行のみパネル（L400-408）✓
16. Invalid draft 抑止＆エラー表示（L300-314）✓
17. データ属性・aria-selected の一貫性（L335-356）✓
18. aria-describedby の条件付与（L459-465）✓

計 18 項目全て検証。**新規テストは既存との DRY（重複排除）、タイトル・comment の明示性も高い**。

---

### [N-014] 正規化ルール（matchKey と TagName.create）の分離

**検証**: `tagSuggestModel.ts:26-39, 47-58, 141-156`

```javascript
// matchKey: lenient（throw なし）
function matchKey(raw: string): string {
  const normalised = raw.normalize("NFKC");
  const withoutHash = normalised.startsWith("#") ? normalised.slice(1) : normalised;
  return withoutHash.toLowerCase();  // 3 ステップのみ
}

// committedKeySet: TagName.create で filter
function committedKeySet(committed: readonly string[]): Set<string> {
  for (const name of committed) {
    try {
      TagName.create(name);  // 不正値は skip
    } catch {
      continue;
    }
    set.add(matchKey(name));
  }
  return set;
}

// validateTagDraft: TagName.create が権威
for (const token of tokens) {
  try {
    TagName.create(token);  // 権威ある検証
  } catch (error) {
    return TAG_ERROR_MESSAGES[error.code];
  }
}
```

**検証ポイント**:
- matchKey は入力途中の未確定値でも計算可（lenient）✓
- Matching: matchKey を双方に適用し、`#Foo` と `Foo` の一致を検出（手動テストで確認済み）✓
- Validation: TagName.create をドメイン権威として使用（ルール重複排除）✓

ADR-002「ルール SSOT」を完全実装。テスト（tagSuggestModel.test.ts など）で正規化境界が検証済み。

---

### [N-015] Server component への props 配線

**検証**: `new.tsx:18-39` / `edit.tsx:21-62`

```typescript
// new.tsx
const { loadAllTags } = await import("@/components/note/loaders");
const tags = await loadAllTags({ actorUserId: userDto.id });

return renderServerComponent(
  <NoteEditor
    mode="new"
    tree={tree.flat}
    tagSuggestions={tags.tags.map((t) => t.name)}  // ← 配線完了
  />,
);

// edit.tsx
const tags = await loadAllTags({ actorUserId: userDto.id });
return renderServerComponent(
  <NoteEditor
    noteId={note.id}
    tree={tree.flat}
    tagSuggestions={tags.tags.map((t) => t.name)}  // ← 配線完了
  />,
);
```

**検証ポイント**:
- 両ルート（new/edit）で `loadAllTags` から候補を抽出 ✓
- Server component から RSC へ props で渡す（hydration 安全）✓
- plan 記載の「new.tsx の『将来の autocomplete 用』コメント」が実配線に更新されている ✓

---

### [N-016] Input 要素の semantic 属性

**検証**: `TagsInput.tsx:196-229`

```jsx
<input
  type="text"
  className={tagInputControl}
  value={draft}
  aria-label="新規タグ"  // 明示的なラベル
  placeholder="タグを追加…"  // 空状態ガイド
  disabled={disabled}
  role="combobox"  // semantic role
  aria-autocomplete="list"
  aria-expanded={panelOpen}
  aria-controls={listboxId}  // listbox 指定
  aria-activedescendant={activeOptionId}  // active option 指定
  aria-describedby={errorId}  // エラー関連付け
/>
```

**検証ポイント**:
- `type="text"` で input type 明示 ✓
- `aria-label="新規タグ"` で目的を明確化 ✓
- `placeholder` で空状態ガイド（AC-2）✓
- `role="combobox"` で semantic 役割 ✓
- ARIA 属性で combobox/listbox 関係を宣言 ✓
- `aria-describedby` で error の関連付け ✓

テスト（TagsInput.test.tsx:78-84）で input 取得セレクタが `aria-label="新規タグ"` に依存し、前提が固定されている。

---

### [N-017] Error 表示の a11y 仕上げ

**検証**: `TagsInput.tsx:276-280` / `styles.ts:151`

```jsx
{validationError !== null ? (
  <p id={errorId} className={tagInputError} aria-live="polite">
    {validationError}
  </p>
) : null}

// styles
export const tagInputError = "mt-1.5 px-0.5 text-[12px] text-error";
```

**検証ポイント**:
- `<p>` element for semantics（block エラー表示）✓
- `aria-live="polite"` で dynamic error をスクリーンリーダーに通知 ✓
- Input の `aria-describedby={errorId}` で error 関連付け（エラー文言が input を describe）✓
- `text-error` で色による視認性も確保（WCAG 色依存回避）✓
- 空 draft では error 非表示（HTML から削除）→ a11y tree に現れない ✓

テスト（TagsInput.test.tsx:444-449, 452-465）で error element と aria-describedby の条件付与が検証済み。

---

## 最終判定

**Blockers**: 0 / **Warnings**: 0 / **Notes**: 17

### Frontend の観点から

実装は**完璧に近い品質**で、計画・ADR をほぼ 100% 踏襲している：

- **Combobox ARIA**: 入力の `role="combobox"` + 候補の `role="listbox"` + `aria-activedescendant` 方式で ARIA APG combobox パターンに準拠 ✓
- **キーボードナビ**: `-1` 始点により新規タグ Enter 確定を守り、IME ガード（矢印も含む）で日本語入力と両立 ✓
- **blur 競合**: `onMouseDown preventDefault` で option クリック時の blur 暴発を回避 ✓
- **State 管理**: open/activeIndex を local useState に閉じ、reducer を拡張しない（ADR-001）✓
- **panelOpen 述語**: `open && (hasSuggestions || isNewDraft)` で既存・新規の区別表示を実現（AC-5）✓
- **Disabled**: input/chip × ボタンを disable、focus/onChange で open チェック ✓
- **スタイリング**: Tailwind ユーティリティ + tokens のみで新規 CSS/@apply なし（CLAUDE.md 準拠）✓
- **テスト**: 既存 7 ロック + 新規 11 項目 = 計 18 項目、包括的カバレッジ ✓
- **後方互換性**: `tagSuggestions` optional で既存呼び出し元への影響なし ✓

### UX / a11y の質

- Combobox が打鍵中もフォーカスを input に留めるため、連続入力と候補選択が両立（タイピングが中断されない）✓
- Empty draft でパネル非表示（入力未開始で全タグをダンプしない、noise 排除）✓
- Invalid draft で commit 抑止、inline error で即時フィードバック（AC-6）✓
- aria-live="polite" で error をスクリーンリーダーに通知 ✓
- data-* 規約準拠で state 属性が stable（component re-render で消失しない）✓

### Verdict

Frontend の観点から**品質上、指摘対象なし**。Merge 可能と判断される。

