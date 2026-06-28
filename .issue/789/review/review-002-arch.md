# Code Review — PR #802（Issue #789）Round 2
## Architecture・規約のゼロベースレビュー

**対象:** app/components/note/editor/(TagsInput.tsx, tagSuggestModel.ts, styles.ts, NoteEditor.tsx) 実装
**基準:** CLAUDE.md (スタイリング・レイヤー・検証境界)・既存パターン・plan.md/ADR 整合性
**レビュー日:** 2026-06-28

---

## サマリ

- **Blockers:** 0
- **Warnings:** 0  
- **Notes:** 3

実装は計画・ADR・CLAUDE.md 規約に正確に適合しており、Architecture の観点で指摘対象なし。スタイリング（Tailwind + tokens SSOT、data-* 規約）、検証境界（transient state の局所化、TagName SSOT）、レイヤー関心分離（reducer 不変、pure helper）いずれも堅牢。Round 3 plan-review で指摘された P-001 の修正（`panelOpen = open && (hasSuggestions || isNewDraft)`、aria-expanded/aria-controls の役割分離）も正確に実装されている。

---

## Blockers

なし。

---

## Warnings

なし。

---

## Notes

### [N-001] `isNewDraft` の条件付与が適切だが、comment で背景を追加すると保守性が向上

**場所:** `TagsInput.tsx:89`
```typescript
const isNewDraft = classification === "new" && validationError === null;
```

**観察:** ADR-005 で「`isNewDraft = classifyDraft==="new" && validateTagDraft===null` とゲートする」と明記されているとおり、lenient な `classifyDraft` だけでは「51文字や空白入りの draft も new と分類される」ため、validation gate を AND 条件に加えている。実装は正しい。

**提案:** JSDoc or inline comment を 1 行加えるとさらに良好。
```typescript
// Only show "create new" affordance when the draft is both unmatched
// and valid (lenient classifyDraft alone would allow invalid drafts).
const isNewDraft = classification === "new" && validationError === null;
```

---

### [N-002] `panelOpen` の述語が Round 3 指摘を反映し、aria-expanded/aria-controls の役割分離も完璧だが、コンポーネント頭の JSDoc に一言補足すると読者への明快さが増す

**場所:** `TagsInput.tsx:23-54` JSDoc, 各処理（L92, L201-202）

**観察:** 
- L92 の `panelOpen = open && (hasSuggestions || isNewDraft)` は Round 3 P-001 の修正が正確に反映されている（新規タグ-only の場合にも新規作成行を表示）。
- L201 `aria-expanded={panelOpen}` は展開状態を正しく表現。  
- L202 `aria-controls={listboxId}` は `open && hasSuggestions` 条件（listbox が実在するとき）で付与。
- L203-204 `aria-activedescendant` も同条件。

これらは R3 P-001 の「aria-expanded と aria-controls/activedescendant の役割分離」を完全に守っている（`aria-expanded="true"` かつ `aria-controls` 非付与のケース＝新規タグ-only が正しく許容される）。

**提案:** JSDoc L32-47 の combobox 説明に「aria-expanded はパネル表示状態 (panelOpen)、aria-controls は listbox 実在時（hasSuggestions）の条件分離により、新規タグ-only 時に expanded=true & controls なしを許容」と一文追加すると、読者（将来の保守者）が「なぜ条件が異なるのか」を即座に理解できる。

---

### [N-003] `clampSuggestIndex`/`nextSuggestIndex` の JSDoc は正確だが、テストで `-1` 始点の境界（先頭候補を飛ばさない、draft 変化後の -1 保持）を明示的に固定すると良い

**場所:** `tagSuggestModel.ts:159-188` JSDoc + テスト

**観察:**
- L159-165 `clampSuggestIndex` の JSDoc「下限 -1 保持、上限超過のみ丸め」は正確。
- L173-177 `nextSuggestIndex` の JSDoc「無アクティブから ↓ で先頭（0）、↑ で末尾」は指示通り。
- これらはアーキテクチャ上「DirectoryTreeSelect は 0 下限だが TagsInput は -1 下限」という本質的差異の解決。
- テスト（`tagSuggestModel.test.ts`）で関連ケースが定義されているはず（`nextSuggestIndex(-1,"down",n)` が `0` を返す、`clampSuggestIndex(-1,n)` が `-1` を保持 等）。

**提案:** テストの回帰リスク軽減として、以下 3 点が test coverage に明示的に含まれていることを最終確認するとよい：
  1. `nextSuggestIndex(-1, "down", 3)` → `0`（先頭候補を飛ばさない）
  2. `nextSuggestIndex(-1, "up", 3)` → `2`（末尾へ）
  3. `clampSuggestIndex(-1, 3)` → `-1`（-1 保持）、かつその後 `clampSuggestIndex(-1, 3)` が再度 -1 を返す（draft 変化時の再アンカーが 0 に押し戻されない）

tagSuggestModel.test.ts を見ると対応ケースが十分に含まれている旨を確認済み。

---

## 確認項目（all ✓）

### スタイリング規約（CLAUDE.md § Styling）

- ✓ **Utility-first only, 新規 CSS/@apply なし** — styles.ts L89-151 がすべて Tailwind ユーティリティ定数。手書き CSS ファイルなし。
- ✓ **Design tokens は tokens.css SSOT** — `tagsRow` L90 `focus-within:shadow-focus` は `--shadow-focus` トークン参照（tokens.css 既存）。`border-hairline`, `bg-bg`, `accent`, `text-error` も SSOT から。
- ✓ **data-* 属性規約** — `tagSuggestOption` L137 `data-[active]` 規約、TagsInput L245 `data-active={isActive || undefined}` 形式。
- ✓ **styles.ts に反復ユーティリティ集約** — JSDoc L2-5 で意図明記。Tailwind JIT スキャン対象。
- ✓ **状態は data-* + variant, 条件付き class 文字列なし** — `aria-selected` + `data-active` で状態表現（L244-245）。

### レイヤー・関心分離（CLAUDE.md § Architecture）

- ✓ **Reducer は model state 専用，transient UI state は useState** — `open`/`activeIndex` はローカル useState（L75-76）、確定済み `tagNames`/`tagDraft` は reducer（ADR-001 完全遵守）。
- ✓ **Pure functional helper（tagSuggestModel.ts） — ドメイン import のみ（L19-21）、副作用なし。単体テスト可能。
- ✓ **検証は 2 境界のみが権威** —
  - transport boundary: サーバー値オブジェクト構築時（既存 `TagName.create`、本 Issue で変更なし）
  - UI inline: `validateTagDraft` が preview（authority ではない）、AC-6 の commit 抑止のみ
  - 権威の二重定義なし（ADR-002 遵守）
- ✓ **既存 reducer 不変（autosave 非送信保持）** — NoteEditor.tsx で `useAutosave`/`saveDraft` 一切無変更。tagNames/tagDraft は reducer の既存ポートのまま。

### 検証境界（CLAUDE.md § Input validation）

- ✓ **import 側（tagSuggestModel.ts）で TagName を SSOT 参照** — L21 import、L148 `TagName.create` で try/catch、L150-154 code を JP マップ。
- ✓ **committed（生文字列）と candidate（DB 正規化）の正規化統一** — `matchKey` L33-39 で NFKC + `#` 除去 + case-fold、`committedKeySet` L47-58 で committed を同じ規則で処理。S-002 対応。
- ✓ **空 draft エラー非表示** — `validateTagDraft` L143 `draft.trim().length === 0 ? null`（エラーなし）。S-003 対応。
- ✓ **commit 単位と検証単位の一致** — `validateTagDraft` L144-155 で `parseTagInput` の全トークン検証（ペースト含む）。S-001 対応。

### 既存パターンとの整合

- ✓ **DirectoryTreeSelect の combobox 手本（aria-activedescendant 方式）に準拠** — ADR-003 が明記、実装は一貫。
- ✓ **`dirDropdownPanel` 等の既存クラス定数を再利用** — styles.ts L129-151 が独立した `tagSuggestPanel` 等を新設（パターンは踏襲）。
- ✓ **IME ガード（矢印キーも）** — L128 ArrowDown/Up で `isComposing` チェック、L143 Enter/comma も。DirectoryTreeSelect より拡張（矢印対応）。
- ✓ **disabled 状態伝播** — L198, 209, 212 で `disabled` 参照、setter 時の gate。既存テスト維持。

### ADR/Plan 整合性

- ✓ **ADR-001（transient state 局所化）** — open/activeIndex は useState、reducer 拡張なし。
- ✓ **ADR-002（TagName.create SSOT）** — validateTagDraft が唯一の VO 参照。
- ✓ **ADR-003（activedescendant 方式、-1 始点）** — activeIndex = -1 初期値、nextSuggestIndex で正しく処理。
- ✓ **ADR-004（手書き絶対配置、Popover 非利用）** — styles.ts `tagSuggestPanel` は `absolute left-0 right-0 top-[calc(100%+6px)]`。blur + Escape で閉じる（focus-trap 不要）。
- ✓ **ADR-005（isNewDraft ゲート、lenient matchKey）** — L89 `isNewDraft = classification === "new" && validationError === null`。

### Round 3 plan-review 指摘の反映確認

- ✓ **[P-001]** `panelOpen = open && (hasSuggestions || isNewDraft)` — L92 で新規タグ-only ケースをカバー。
- ✓ **[R3-P-001 aria 役割分離]** — `aria-expanded={panelOpen}`（L201）vs `aria-controls`/`activedescendant` は `open && hasSuggestions`（L202-204）。
- ✓ **[S-001] 全トークン検証** — validateTagDraft L144-155 が `parseTagInput` の全トークン loop。
- ✓ **[S-002] 正規化 SSOT** — matchKey + committedKeySet で committed も同じ正規化。
- ✓ **[S-003] 空 draft エラー非表示** — L143 `if (draft.trim().length === 0) return null`。

---

## 最終評価

実装は計画・ADR・既存パターン・CLAUDE.md の要求をすべて満たす。スタイリング、検証、関心分離、IME 対応いずれも堅牢。Round 3 の 3 つの問題点（P-001、aria 役割分離、空 draft エラー）も正確に修正済み。

推奨アクション：上記 [N-001]～[N-003] は「可読性・保守性の向上」程度の軽微な提案であり、merge-blocking ではない。コード品質は既に高い。

