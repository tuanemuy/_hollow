# Architecture・規約 Review — PR #802

**対象**: Issue #789（タグ入力 combobox 化）
**review 日**: 2026-06-28
**検査項目**: Tailwind/tokens.css 規約、data-* 属性、styles.ts 集約、検証境界、関心分離、ADR/plan 整合

---

## Blockers

なし

---

## Warnings

なし

---

## Notes

なし

---

## 詳細検査ログ

### ✓ Tailwind/tokens.css 規約

**tagSuggestModel.ts**（新規ヘルパ）
- 純粋関数（matchKey / filterTagSuggestions / classifyDraft / validateTagDraft）
- 新規 CSS 不要（ロジックのみ）

**styles.ts**（タグ関連）
- tagsRow / tagChip / tagInputControl / tagSuggestPanel / tagSuggestOption / tagSuggestOptionNew / tagInputError
- すべて既存 tokens.css 参照のみ
- 新規 CSS/@apply なし ✓
- module-scoped 定数集約パターン維持 ✓

**TagsInput.tsx**
- L177: tagsRow（border/focus-within/shadow-focus）
- L179-190: tagChip / tagChipRemove
- L192-225: tagInputControl（focus-visible:shadow-none 打ち消し）
- L227-266: tagSuggestPanel + tagSuggestOption / tagSuggestOptionNew
- L269: tagInputError（mt-1.5 で行間調整）
- 全クラス定数は styles.ts 参照 ✓

### ✓ data-* 属性規約

- L245: `data-active={isActive || undefined}` — 規約準拠 ✓
- styles.ts L137: tagSuggestOption で `data-[active]:bg-surface` 使用 ✓

### ✓ styles.ts module-scoped 集約

- 繰り返しユーティリティ定数化パターン継続 ✓
- 既存の dirDropdownPanel / dirTreeItem / dirTreeItemNew を参照・踏襲
- 新ファイル/新CSS なし ✓

### ✓ 検証境界の原則

**Domain（不変）**
- `TagName.create` — NFKC・`#` 除去・空/空白/50超で throw（SSOT）

**Application（参照のみ）**
- editorState.ts の parseTagInput / resolveTagNames 不変 ✓

**Presentation（UI preview）**
- tagSuggestModel.ts の validateTagDraft が TagName.create を try/catch
  - L148-149: BusinessRuleError を catch して code をマップ
  - L150-151: TAG_ERROR_MESSAGES で日本語化
- TagsInput.tsx の inline エラー表示（非権威）
  - L268-272: validationError が null でない時だけ表示
  - L156-157, 220-221: commit 時に validationError チェック
- 権威は save-time の値オブジェクト構築に保持 ✓

### ✓ 関心の分離

**tagSuggestModel.ts**（pure helper）
- filterTagSuggestions（committed 除外・部分一致・上限）
- classifyDraft（exact/new/dup/empty 分類）
- validateTagDraft（draft 妥当性チェック）
- clampSuggestIndex / nextSuggestIndex（-1 始点ナビ）
- 全関数は `readonly` 入出力で stateless ✓

**TagsInput.tsx**（controlled view）
- component state（open / activeIndex）
- keyboard / mouse イベント処理
- ARIA 属性管理
- panel 可視化ロジック
- reducer への dispatch ✓

### ✓ 既存ヘルパの取り扱い

**directoryTreeModel との互換性**
- plan 明記：directoryTreeModel の clampActiveIndex / nextActiveIndex は下限 0 を仮定
- 実装：tagSuggestModel.ts に新規ヘルパ clampSuggestIndex / nextSuggestIndex を独立新設
  - L166-171: clampSuggestIndex は下限 -1 を保持 ✓
  - L179-188: nextSuggestIndex は無アクティブから ↓ で 0、↑ で count-1 ✓
- DirectoryTreeSelect は変更なし ✓

### ✓ -1 始点ナビゲーション正確性

**初期状態**
- L76: `const [activeIndex, setActiveIndex] = useState(-1);` ✓

**draft 変化で -1 リセット**
- L98-100: draft 依存で activeIndex を -1 にリセット
- clampSuggestIndex が -1 を保持するため 0 へ押し戻されない ✓

**candidates 長変化で clamp**
- L104-106: candidates.length を clampSuggestIndex に渡す
- -1 始点保持 ✓

**キーボード移動**
- L136-138: nextSuggestIndex で activeIndex 更新
- 無アクティブから ↓ で先頭候補 0（飛ばさない）✓

**Enter 確定の分岐**
- L146-152: activeIndex >= 0 の時は候補を commit
- L156-160: activeIndex === -1 の時は draft を新規確定 ✓
- draft が存在する状態で Enter → 候補非選択なら新規タグ確定（既存案件が draft を奪わない）✓

### ✓ ADR-003 の ARIA 実装

**コンテナ**
- L177: `role="group" aria-label="タグ"` ✓

**combobox（input）**
- L199: `role="combobox"` ✓
- L200: `aria-autocomplete="list"` ✓
- L201: `aria-expanded={panelOpen}` — open && (hasSuggestions || isNewDraft) ✓
- L202: `aria-controls={listboxId}` は open && hasSuggestions の時のみ（新規作成行のみの時は非付与）✓
- L203-205: `aria-activedescendant={activeOptionId}` は activeIndex >= 0 の時のみ ✓
- L206: `aria-describedby={errorId}` は validationError が null でない時のみ ✓

**listbox**
- L230: `role="listbox" aria-label="タグ候補"` — id=listboxId ✓

**option（候補）**
- L242-244: `role="option" tabIndex={-1} aria-selected={isActive}` ✓
- L245: `data-active={isActive || undefined}` ✓
- L248: `onMouseDown preventDefault` で focus 奪取防止 ✓

**新規作成行**
- L260-264: isNewDraft の時に aria-hidden="true" で表示
- `role="option"` なし（ナビ対象外）✓
- クリックハンドラなし（Enter 経路でのみ確定）✓

### ✓ ADR-004（手書き絶対配置）

- L85: tagsRow に `relative` ✓
- L227-266: tagSuggestPanel で `absolute left-0 right-0 top-[calc(100%+6px)]` ✓
- Popover 不使用 ✓
- 既存 dirDropdownPanel パターンを踏襲（max-sm は width 指定上書きのため、tagSuggestPanel は不要）✓
- blur / Escape でクローズ（focus-trap 不要）✓

### ✓ ADR-005（lenient matchKey / isNewDraft ゲート）

**matchKey**
- L33-39: NFKC + 先頭 `#` 除去 + 小文字化
- never throws（全域関数）✓
- committed（生テキスト・未正規化）と候補（DB 正規化済み）を同一キーで比較 ✓

**isNewDraft**
- L89: `classification === "new" && validationError === null`
- classifyDraft のみでなく validation ゲート付与（51文字等で新規作成行が誤表示されない）✓
- 51文字 draft では classifyDraft="new" だが validationError !== null → isNewDraft=false → 作成行非表示 ✓

### ✓ 配線（NoteEditor / routes）

**NoteEditor.tsx**
- L102: `tagSuggestions?: readonly string[];` (optional) ✓
- L497: `suggestions={props.tagSuggestions ?? []}` で default ✓

**new.tsx / edit.tsx**
- 両ルートとも loadAllTags() 結果から `tags.tags.map(t => t.name)` を tagSuggestions に渡す ✓
- 後方互換性（省略時 []）確保 ✓

### ✓ テスト

**tagSuggestModel.test.ts**
- filterTagSuggestions（空 draft → []、committed 除外、部分一致、上限、正規化キー一致）
- classifyDraft（empty/exact/dup/new）
- validateTagDraft（空→null、50超/invalid chars、カンマ分割全トークン検証）
- clampSuggestIndex（-1 保持、上限丸め）
- nextSuggestIndex（無アクティブから ↓ で 0、↑ で末尾、巡回）

**TagsInput.test.tsx**
- 既存 6 ロック全維持（Enter/comma/IME/Backspace/×/blur/disabled）
- 新規（候補ナビ、-1 始点 Enter が新規確定、IME 矢印ガード、Escape、invalid 抑止、新規・既存区別、ARIA）
- 構造変更（ul/li → div、chip セレクタ更新）

---

## 総合評価

- **Architecture** ✓ 適切な層分離（domain/application 不変、presentation の純粋ヘルパ + view）
- **規約** ✓ Tailwind/tokens 準拠、data-* 属性規約遵守、styles.ts 集約継続
- **検証** ✓ 権威の一本化（TagName.create が SSOT、inline は preview）
- **ARIA** ✓ ADR-003・ADR-004・ADR-005 に沿う正確な実装
- **関心分離** ✓ pure helper（tagSuggestModel）と view（TagsInput）が明確に分離
- **既存尊重** ✓ directoryTreeModel / editorState / autosave 不変、破壊変更なし

**収束**: Architecture・規約的に問題なし。plan / ADR 準拠。PR ready。
