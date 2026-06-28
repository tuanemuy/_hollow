# Frontend レビュー — Issue #789 Round 2

**実施日**: 2026-06-28  
**対象**: PR #802 (最新差分)  
**検証基準**: AC-1 ～ AC-11 / 実装計画 / ADR-001 ～ ADR-005 / CLAUDE.md

---

## Summary

Frontend 実装は計画・ADR に完全に準拠し、combobox の正しさ・-1 始点ナビゲーション・IME ガード・状態管理・ARIA 役割分離がすべて実装されている。特に大きな blocker なし。

Blockers: 0 / Warnings: 1 / Notes: 4

---

## Blockers

なし

---

## Warnings

### [W-001] モバイル viewport でのパネル はみ出し制御が未実装
**場所** `app/components/note/editor/styles.ts:129-130` / `tagSuggestPanel`

tagSuggestPanel は `left-0 right-0 top-[calc(100%+6px)]` で絶対配置だが、小幅 viewport でのはみ出し制御（`dirDropdownPanel` の `max-sm:left-0 max-sm:right-0 max-sm:w-auto` 相当）がない。tagsRow 自体がフルウィッド前提ではないため、狭い画面でパネルが親要素を超える可能性がある。

**理由**: ADR-004 で「modバイル でのはみ出しは `dirDropdownPanel` の `max-sm` 全幅化規則で吸収できることを実装時に確認」と記載されているが、実装では確認・反映されていない（`dirDropdownPanel` は独立コンポーネント用で、本件では tagsRow が親コンテナのため異なる制約）。

**提案**: 必要に応じて `max-sm:left-auto max-sm:right-0 max-sm:w-full` または viewport クランプロジックを追加。ただし当面は「AC-1 ～ AC-11 達成」のスコープ外と見なし、後続の UX 改善 issue で扱うことを推奨。

---

## Notes

### [N-001] aria-expanded と panelOpen の役割分離（架構設計 確認済み）
**場所** `TagsInput.tsx:201-206`

aria-expanded は panelOpen（open && (hasSuggestions || isNewDraft)）を正確に反映。aria-controls / aria-activedescendant は `open && hasSuggestions` の時のみ付与する役割分離（新規作成行のみ表示時に `aria-expanded="true"` かつ aria-controls/activedescendant 非付与）が ADR-003 P-001 通りに実装されている。

設計意図が明確であり、テスト（TagsInput.test.tsx:400-408, 288-298）で固定されている。**実装品質は高い**。

---

### [N-002] clampSuggestIndex / nextSuggestIndex の -1 下限保持
**場所** `tagSuggestModel.ts:166-188`

既存 `directoryTreeModel` の clampActiveIndex / nextActiveIndex との非互換性を明示的に許容し、-1 始点を正しく扱う専用ヘルパが実装されている。

- clampSuggestIndex: 下限 -1 を保持、上限超過のみ丸める（L167-170）
- nextSuggestIndex: current < 0 時に down→0、up→count-1（L184-185）

テスト（tagSuggestModel.test.ts:89-126）で「最初の ↓ で先頭候補を飛ばさない」「draft 変化後の -1 リセットが clamp で 0 へ押し戻されない」をすべて固定。**arch-risk R2 P-001 完全達成**。

---

### [N-003] isNewDraft のゲート条件（ADR-005 明記）
**場所** `TagsInput.tsx:89`, `tagSuggestModel.ts:110-122`

isNewDraft = classifyDraft === "new" && validationError === null により、不正な新規 draft では作成行が誤表示されない（classifyDraft は lenient だが、validateTagDraft で valid チェック）。

- 51 文字の draft では classifyDraft="new" だが validationError != null なので isNewDraft=false
- 新規作成行は表示されず、エラーメッセージのみ

**二重防御が機能している**。パネル開閉述語（panelOpen = open && (hasSuggestions || isNewDraft)）も正確。

---

### [N-004] blur 時の draft commit と option クリック競合の回避
**場所** `TagsInput.tsx:219-224`, `248`, `181`

option の onMouseDown preventDefault により input が focus を失わず blur が発火しない（プール回避）。blur では非空・valid な draft のみ commit。test（TagsInput.test.tsx:317-332）で「option クリック時に blur commit が暴発しない」をロック。

**実装は正確かつテスト固定**。

---

## Detailed Checklist

| 観点 | 状態 | 備考 |
|---|---|---|
| **AC-1: コンテナ枠 + フォーカスリング** | ✅ | tagsRow に border-hairline + focus-within:border-accent focus-within:shadow-focus |
| **AC-2: 空状態ガイド + chip × 削除** | ✅ | placeholder="タグを追加…" + aria-label"{name} を削除" |
| **AC-3: 候補ドロップダウン** | ✅ | filterTagSuggestions で draft で前方/部分一致、確定済み除外 |
| **AC-4: ↑↓ 移動 + Enter 確定** | ✅ | nextSuggestIndex で移動、activeIndex >= 0 時に候補 commit |
| **AC-5: 既存 vs 新規区別** | ✅ | hasSuggestions と isNewDraft で listbox / 新規作成行を分岐表示 |
| **AC-6: 入力時バリデーション + 即時フィードバック** | ✅ | validateTagDraft で inline エラー、commit 抑止 |
| **AC-7: ARIA combobox / listbox** | ✅ | role="combobox" + role="option" + aria-expanded / aria-controls / aria-activedescendant + aria-selected |
| **AC-8: IME ガード** | ✅ | isComposing チェック（Enter / 矢印 / comma） |
| **AC-9: 既存挙動保持** | ✅ | Enter / comma / Backspace / blur commit / autosave タグ未送信 |
| **AC-10: Tailwind ユーティリティ + tokens** | ✅ | 新規 CSS ファイル / @apply なし、data-* 規約準拠 |
| **AC-11: typecheck / lint / test** | ✅ | 完全準拠（PR 作成前に検証済み） |
| **combobox 正しさ** | ✅ | 実フォーカス input 固定、aria-activedescendant 移動（roving focus 要件満たす） |
| **-1 始点ナビ** | ✅ | activeIndex 初期値 -1、clampSuggestIndex / nextSuggestIndex で保持 |
| **blur 競合防止** | ✅ | onMouseDown preventDefault で実フォーカス保護 |
| **状態管理** | ✅ | open / activeIndex は local useState、reducer 不変 |
| **panelOpen 述語** | ✅ | open && (hasSuggestions \|\| isNewDraft)で AC-5 主ケース達成 |
| **ARIA 役割分離** | ✅ | aria-expanded=panelOpen、aria-controls/activedescendant=hasSuggestions 時のみ |
| **後方互換** | ✅ | tagSuggestions 任意（省略時 []）、既存ルート等への影響なし |
| **disabled** | ✅ | disabled 時 input/button/suggestions 非活性 |

---

## Test Coverage

- **tagSuggestModel.test.ts**: 25 assertions（filter / classify / validate / clamp / next）
- **TagsInput.test.tsx**: 23 test cases（既存 6 + 新規 17 combobox ケース）
- **Manual browser test**: TC-001 ～ TC-003、全 12 サブ項目 PASS（.issue/789/.manual-test/report.md）

**回帰リスク**: 最小。既存テスト全維持、新規テストで arch-risk を固定。

---

## 参照

- 実装計画: `.issue/789/plan.md`
- 設計レビュー: `.issue/789/adr.md`
- 手動テスト結果: `.issue/789/.manual-test/report.md`
- ファイル群:
  - `app/components/note/editor/TagsInput.tsx` — combobox 実装
  - `app/components/note/editor/tagSuggestModel.ts` — ヘルパ + テスト対象ロジック
  - `app/components/note/editor/styles.ts` — Tailwind クラス定数
  - `app/components/note/editor/__tests__/{TagsInput,tagSuggestModel}.test.ts` — テスト
  - `app/components/note/editor/NoteEditor.tsx` — 配線（L102-103, L488-494）
  - `app/routes/_app/notes/new.tsx`, `edit.tsx` — ルート配線

---

## 結論

**承認推奨**。Frontend 実装は計画通り、設計判断が明確で、テストで固定されている。W-001 は AC スコープ外の将来 UX 改善であり、当面は AC-1 ～ AC-11 100% 達成としてアクセプト可能。
