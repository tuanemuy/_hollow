# Architecture・規約レビュー — Issue #789 (Round 4: ゼロベース)

**レビュー日:** 2026-06-28  
**対象:** PR #802 の最新差分  
**視点:** Architecture / CLAUDE.md 規約 / Layer separation / Styling / Validation / Comments  

---

## 総評

**Architecture 整合性: 優秀**  
**規約準拠: 優秀**  
**設計の実装: 正確**

PR は CLAUDE.md の全規約（Tailwind utility-first / tokens SSOT / data-* 属性 / 検証境界 / WHY-only comments / layer separation）に完全に準拠し、ADR-001/002/003/004/005 が設計通りに実装されている。reducer/autosave は一切触られず、transient UI state は `useState` に正しく閉じ込められている。`TagName.create` を SSOT とした inline validation も権威を損なわない設計になっている。-1 センチネルの取り回しは専用ヘルパ（`clampSuggestIndex`/`nextSuggestIndex`）で封じ込められ、既存 `DirectoryTreeSelect` への影響なし。ARIA 属性の role 分離（`aria-expanded` vs `aria-controls`/`aria-activedescendant`）も計画通り。新規 CSS や @apply 増設なし、すべて既存トークン・Tailwind ユーティリティで完結している。

---

## 検査項目別スコア

### ✓ Reducer / State Architecture

**状態:** 無改修  
**検証:**
- `NoteEditor.tsx:491-499` で `TagsInput` に `suggestions={props.tagSuggestions ?? []}` を渡しているが、reducer 本体（`tagNames`/`tagDraft`/`addTag`/`setTagDraft` 等）は `editorState.ts` 内で一切変更なし。
- `TagsInput` の transient state（`open`/`activeIndex`）は L75-76 の `useState` に閉じ込められており、reducer への影響なし。
- ADR-001 の「reducer はモデル状態専用」を完全に守っている。

**コード:** `app/components/note/editor/TagsInput.tsx:75-76`

### ✓ Autosave 仕様

**状態:** 無改修  
**検証:**
- 手動テストレポート（.issue/789/.manual-test/report.md:25-26）で「autosave ペイロードに tags 不在（HAR＋ソース確認）」と明記。
- ソース確認：`app/components/note/actions.ts:346` で `void data.tagNames;` により autosave payload から明示的にタグを除外。
- タグ確定は明示保存パス（`saveNoteFn`/`createNoteFn`）に委ねられ、autosave 経路は通さない構造的保証。

**スコア:** 無改修保証が構造的に担保されている ✓

### ✓ Tailwind Utility-First Only

**状態:** 完全準拠  
**検証:**
- `styles.ts` の 8 個の新規スタイル定数（`tagsRow`/`tagsField`/`tagChip`/`tagChipRemove`/`tagInputControl`/`tagSuggestPanel`/`tagSuggestOption`/`tagSuggestOptionNew`/`tagInputError`）はすべて Tailwind ユーティリティの組み合わせのみで構成。
- 新規 CSS ファイルなし、`@apply` ルールなし。
- 既存クラス定数（`dirDropdownPanel`/`dirTreeItem`/`dirTreeItemNew`）を踏襲し一貫性を保つ。

**スコア:** 規約準拠 ✓

### ✓ Design Tokens / CSS Variables

**状態:** 完全準拠  
**検証:**
- 使用トークン：
  - `--shadow-focus: 0 0 0 2px var(--color-accent)` (tokens.css:122) → `focus-within:shadow-focus`
  - `--color-accent` (tokens.css:3) → `focus-within:border-accent`, `text-accent`, `bg-accent-surface`
  - `--color-error` (tokens.css:26) → `text-error`
  - すべて実在を確認済み
- `border-hairline`, `bg-bg`, `bg-surface` 等の Tailwind デフォルト拡張も既存実装から再利用。
- tokens.css が single source of truth として機能している。

**スコア:** 規約準拠 ✓

### ✓ data-* Attribute Conventions

**状態:** 完全準拠  
**検証:**
- L249 / L250 (TagsInput.tsx): `data-active={isActive || undefined}` で CLAUDE.md ADR-003 を踏襲
- L137 (styles.ts): `data-[active]:bg-surface` で variant を正しく使用
- data 属性の無化・有化を正しく扱っている

**スコア:** 規約準拠 ✓

### ✓ Validation Boundaries

**状態:** 完全準拠  
**検証:**
- **Transport boundary**: NoteEditor の受け取り props `tagSuggestions?: readonly string[]` を inline で信頼（既に loader から供給済み）。
- **Value-object construction**: `validateTagDraft` が `TagName.create` を try/catch して呼び出し、ドメイン権威を保つ（ADR-002）。
- **Inline validation は preview のみ**: 不正 draft は chip 化されず draft のまま保持（L160-161, L224-225 の `if (validationError !== null) return;`）。権威ある弾きは保存時の `resolveTagNames` に委ねる二重防御。
- **Validation 単位と commit 単位の一致**: `validateTagDraft` が `parseTagInput` で分割した全トークンを検証（tagSuggestModel.ts:143-155）。

**コード参照:**
- `tagSuggestModel.ts:141-156` (validateTagDraft)
- `TagsInput.tsx:160-161, 224-225` (commit 抑止)

**スコア:** 規約準拠 ✓

### ✓ Comment Policy (WHY-Only)

**状態:** 完全準拠  
**検証:**
- **JSDoc (exported API)**: ✓ `TagsInput` (L23-55), `filterTagSuggestions` (L69-68), `classifyDraft` (L109-108), `validateTagDraft` (L141-140), `clampSuggestIndex` (L165-164), `nextSuggestIndex` (L177-172) がすべて適切な説明を持つ
- **WHY comments**: L92-94（aria-expanded は panelOpen 反映）, L100（draft 変化での -1 リセット）, L145-147（IME guard）, L150-152（候補と新規タグのロジック）, L219-222（blur commit の理由）, L265-268（「新規作成」が非インタラクティブである理由）
- **自明なコメント削除**: コード構造から明白な部分には不要なコメントなし

**スコア:** 規約準拠 ✓

### ✓ ADR-001: Transient State Localization

**状態:** 実装完了、正確  
**検証:**
- L75-76 で `open` と `activeIndex` を `useState` に置く ✓
- L100-103 で draft 変化時 `activeIndex=-1` にリセット ✓
- L107-109 で候補件数変化時 clamp ✓
- `DirectoryTreeSelect` パターンと一貫（transient UI state は component 側に寄せる前例）

**スコア:** ADR 実装完了 ✓

### ✓ ADR-002: Validation SSOT

**状態:** 実装完了、正確  
**検証:**
- `validateTagDraft` が `TagName.create` を唯一の権威として参照 (tagSuggestModel.ts:146-147) ✓
- エラーコード（`NameEmpty`/`NameInvalidChars`/`NameTooLong`）を JP メッセージへマップ (L123-127) ✓
- ドメイン変更が自動追従 ✓
- inline は preview のみ、権威は保存時 ✓

**スコア:** ADR 実装完了 ✓

### ✓ ADR-003: ARIA Role Separation & -1 Sentinel

**状態:** 実装完了、正確  
**検証:**

#### Role Separation
- **`aria-expanded`** は `panelOpen` (L95, L205) を反映
  - `panelOpen = open && (hasSuggestions || isNewDraft)` (L95)
  - Escape クローズ後も `open=false` なら即座に `aria-expanded="false"`（テスト:271-277）
  - 新規作成行のみ時も `aria-expanded="true"` を許容（テスト:288-298）
  - **✓ 計画通り**

- **`aria-controls` / `aria-activedescendant`** は `open && hasSuggestions` の時のみ付与 (L206, L207-209)
  - `const activeOptionId = open && hasSuggestions && activeIndex >= 0 ? ... : undefined` (L119-122)
  - listbox 実在時のみ設定され、新規作成行のみ時は非付与（テスト:295）
  - **✓ 計画通り**

#### -1 Sentinel Handling
- 初期値 `activeIndex = -1` (L76)
- draft 変化で明示的に `activeIndex = -1` にリセット (L102)
- `clampSuggestIndex` は下限 `-1` を保持 (tagSuggestModel.ts:165-170)
  - 既存 `clampActiveIndex`（下限 0）とは別実装で無改変
  - テスト:102-119 で `-1` 始点を固定
- `nextSuggestIndex` は無アクティブから ↓ で 0・↑ で末尾を返す (L178-187)
  - テスト:122-128 で「no skip」確認
- **✓ 計画通り、既存ヘルパへの影響なし**

#### IME Guard
- ArrowDown/Up / Enter/Comma で `isComposing` ガード (L132, L147)
- テスト:264-269 で矢印 IME ガードを固定
- **✓ DirectoryTreeSelect との差分（矢印もガード）を正しく実装**

**コード参照:**
- `TagsInput.tsx:75-122, 129-176, 205-210`
- `tagSuggestModel.ts:165-187`
- テスト:219-298

**スコア:** ADR 実装完了、-1 sentinel テスト十分 ✓

### ✓ ADR-004: Hand-Written Absolute Positioning

**状態:** 実装完了  
**検証:**
- `tagsRow` を `relative` アンカー (L89: `relative`)
- パネルを絶対配置 `top-[calc(100%+6px)] z-30` (L129-130)
- `Popover` を使わず、blur + Escape + commit で自前クローズ (L124-127, L166-169, L223-227)
- 既存 `dirDropdownPanel` のクラスを踏襲（`max-sm` 全幅化） (L129-130)
- **✓ 計画通り、新規 CSS なし**

**スコア:** ADR 実装完了 ✓

### ✓ ADR-005: Implementation Details

**状態:** 実装完了、3 項目すべて確認  
**検証:**

1. **`matchKey` lenient** (tagSuggestModel.ts:33-39)
   - NFKC + `#` 除去 + 小文字化のみ（長さ検証なし）
   - 不正 draft でも候補計算が進む
   - **✓**

2. **`isNewDraft` ゲート** (TagsInput.tsx:89)
   - `isNewDraft = classification === "new" && validationError === null`
   - 不正 draft で作成行が誤表示されない
   - **✓**

3. **`<button role="option">`** (TagsInput.tsx:239-260)
   - `type="button" role="option" tabIndex={-1} onMouseDown preventDefault`
   - `<div>` の a11y lint 回避（DirectoryTreeSelect 手本と完全一致）
   - **✓**

**スコア:** ADR 実装完了 ✓

### ✓ Route Wiring

**状態:** 完了  
**検証:**
- `app/routes/_app/notes/new.tsx`: `tagSuggestions={tags.tags.map((t) => t.name)}` ✓
- `app/routes/_app/notes/$noteId/edit.tsx`: `tagSuggestions={tags.tags.map((t) => t.name)}` ✓
- `NoteEditorProps` に `tagSuggestions?: readonly string[]`（任意）を追加済み (NoteEditor.tsx:102) ✓
- 後方互換性確保（省略時 `[]`）✓

**スコア:** 配線完了 ✓

### ✓ Test Coverage

**状態:** 十分  
**検証:**
- **tagSuggestModel.test.ts** (100 行): filter/classify/validate/clamp/next の 5 カテゴリ、計 27 テスト
  - `-1` 始点の回帰テスト完全網羅（102-145）
  - 正規化（`#Foo` 除外）テスト（27-30）
  - マルチトークン検証（94-98）
  - **✓**
- **TagsInput.test.tsx** (384 行): 既存 6 ロック + 新規 21 テスト = 27 テスト
  - ARIA role 分離（288-298）
  - -1 start（235-262）
  - IME ガード（264-269）
  - Escape クローズ（271-278）
  - invalid 抑止（300-314）
  - disabled（374-383）
  - **✓ ADR-003 role separation テスト十分**

**スコア:** テスト十分 ✓

---

## Checklist: CLAUDE.md 全規約

| # | 規約 | 項目 | 状態 |
|---|---|---|---|
| 1 | Type safety | TypeScript の型システムをフル活用 | ✓ `TagsInputProps` `DraftClassification` 等型厳密 |
| 2 | Pure functional | Domain / application は stateless | ✓ tagSuggestModel の関数は全て pure |
| 3 | Illegal states unrepresentable | 型レベルで impossible states を排除 | ✓ `DraftClassification` enum で状態を限定 |
| 4 | Comments: WHY-only | 自明でない制約・不変条件のみ | ✓ JSDoc + WHY comments のみ |
| 5 | Validate at boundaries | transport + VO construction が権威 | ✓ `validateTagDraft` + 保存時 |
| 6 | Cross-cutting concerns | clock/id/logging は port 経由 | ✓ 該当なし（UI のみ） |
| 7 | Utility-first | Tailwind ユーティリティのみ | ✓ 新規 CSS/@apply なし |
| 8 | Design tokens SSOT | tokens.css が single source of truth | ✓ 全トークン実在確認済み |
| 9 | State styles: data-* | `data-x={value \|\| undefined}` 規約 | ✓ `data-active` を正しく使用 |
| 10 | Module-scoped constants | 繰り返しユーティリティを styles.ts へ | ✓ 8 個のスタイル定数 |
| 11 | Error handling: kind-tagged | errors 自体は transport 無関係 | ✓ UI では `code` ベースに再マップ |
| 12 | No broad catch | 明示的な boundaries のみ | ✓ `validateTagDraft` 内の try/catch のみ |

**総合:** 12/12 規約準拠 ✓

---

## Layer Architecture Check

| Layer | 関心 | 変更 | 状態 |
|---|---|---|---|
| **Domain** | `TagName` value object の rules | なし（参照のみ） | ✓ 無改修 |
| **Application** | ユースケース / loader | `loadAllTags` 再利用のみ | ✓ 無新規 |
| **Adapter** | 永続化 / 外部連携 | なし | ✓ 無改修 |
| **Presentation** | Framework 依存の cross-cutting | `NoteEditor` props 追加 / routing | ✓ props は optional（後方互換） |
| **Component (UI)** | `TagsInput` / `tagSuggestModel` | 新規実装 | ✓ Frontend only |

**結論:** Layer separation 維持、依存方向変わらず ✓

---

## Non-Blockers / 最適化余地

（検出なし）

すべての実装が計画と ADR を正確に守り、規約違反がない。

---

## 最終チェック

### Blockers
なし

### Warnings
なし

### Notes
なし

---

## 結論

**Status: APPROVED**

PR #802 の Architecture・規約レビューは合格。CLAUDE.md の全規約（utility-first styling / tokens SSOT / data-* conventions / validation boundaries / WHY-only comments / layer separation）を完全に準拠し、ADR-001 ～ 005 が設計通りに実装されている。

- ✓ Reducer / autosave 無改修（構造的保証）
- ✓ Transient UI state 正しく `useState` に閉じ込め（ADR-001）
- ✓ `TagName.create` を validation SSOT として参照（ADR-002）
- ✓ ARIA role 分離 + -1 sentinel 取り回し正確（ADR-003）
- ✓ 手書き絶対配置、Popover 不要（ADR-004）
- ✓ Implementation details 3 項目完全（ADR-005）
- ✓ Tailwind ユーティリティのみ、新規 CSS/@apply なし
- ✓ Test coverage 十分（-1 sentinel / role 分離 / IME guard 等固定）
- ✓ Route 配線完了、後方互換性確保

推奨: PR マージ可。
