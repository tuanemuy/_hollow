# PR Review #001 — Dialog 共通化（focus trap / Esc / Portal）

**PR:** #87
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 3
- Warnings: 17（A11y 5 / Architecture 6 / Robustness 11 のうち重複・低優先を整理）
- Notes: 多数
- Verdict: **BLOCKED**

---

## Frontend / A11y

### Blockers

- **[B-001]** 初期フォーカスが当たらない（`mounted` ガードと initial-focus effect の依存配列の不整合）
  - 場所: `app/components/common/Dialog.tsx:131-151`（初期 focus effect）／`app/components/common/Dialog.tsx:52, 58-60, 153`（mounted ガード）
  - 理由: 初回 render で `mounted=false` → `null` 返却、panelRef は紐づかない。SSR ガード effect が `setMounted(true)` を呼ぶが、初期 focus effect は依存配列 `[role]` なので mounted=true への遷移では再実行されない。結果として `panel.focus()` も `focusables[0].focus()` も走らない
  - 提案: 初期 focus effect の依存配列を `[role, mounted]` にする、または effect 内で `if (!mounted) return;` ガードを追加

- **[B-002]** Tab トラップの片側穴: panel 外にフォーカスがある時の Tab を捕まえられない
  - 場所: `app/components/common/Dialog.tsx:110-120`
  - 理由: Shift+Tab は `active === first || !panel.contains(active)` で「panel 外 + Shift+Tab」を救うが、Tab 側は `active === last` のみ。focus が panel 外（B-001 で初期 focus 漏れたケースなど）から Tab で前方移動するとブラウザ標準の Tab 巡回で外側 DOM へ進んでしまう
  - 提案: Tab 分岐にも `!panel.contains(active)` を OR 条件で追加し、`first.focus()` に巻き戻す

### Warnings

- **[W-001]** keydown を `document` に attach。ヘッダー検索 input にフォーカス中の挙動を Dialog が奪う
- **[W-002]** iOS Safari の `position: fixed` ハック未対応（デスクトップ前提と明記済み、追加 ADR）
- **[W-003]** `ariaLabel` / `ariaLabelledBy` の型で必須化されていない（全 callsite で渡されているが型で保証されていない）
- **[W-004]** `requestAnimationFrame` を使う理由のコードコメント
- **[W-005]** `HTMLElement` 型ナローイング（SVGElement への配慮、現状影響なし）

---

## Frontend / Architecture

### Blockers
なし

### Warnings

- **[W-Arch-001]** `common/Dialog.tsx` → `note/styles.ts` の cross-domain import（ADR-008 で正当化済みだが構造として弱い）
- **[W-Arch-002]** `MergeTagDialog` のインライン直書きが SSOT を破る（`dialogTitle` / `dialogActions` と完全に同じ文字列）
- **[W-Arch-003]** `DialogInner` に `open` props を渡すのは無駄（`Omit<DialogProps, "open">` で型レベルに表現）
- **[W-Arch-004]** StrictMode 下で `previousActive` cleanup が中間 unmount で発火しうる
- **[W-Arch-005]** `ariaLabel` と `<h2>` の二重ラベリング（5 ダイアログで AT 読み上げ重複の可能性）
- **[W-Arch-006]** MergeTagDialog の primary ボタンが他ダイアログと API 不一致（既存負債、本 Issue スコープ外）

---

## Robustness / Edge Cases

### Blockers

- **[B-003]** IME composition 中の Esc 押下でダイアログが閉じる（日本語入力では致命的な regression）
  - 場所: `app/components/common/Dialog.tsx:90-126`
  - 理由: `document.addEventListener("keydown", handler)` が `event.isComposing` をチェックしていない。日本語入力中の Esc は通常 IME 変換キャンセル用だが、現実装ではダイアログを閉じてしまい、フォーム入力が消失する。既存 6 ダイアログには Esc クローズ自体がなかったので、純粋な regression
  - 提案: handler 冒頭で `if (event.isComposing || event.keyCode === 229) return;` を追加

### Warnings

- **[W-Rob-001]** body scroll lock に reference counter なし（複数ダイアログ同時 open で scroll が永続ロックされる）
- **[W-Rob-002]** BulkExport の `router.navigate` 後の focus 復元タイミング（B-001 の修正と合わせて検討）
- **[W-Rob-003]** Safari `document.activeElement === body` quirk（テストできていない）
- **[W-Rob-004]** StrictMode 下の rAF 重複
- **[W-Rob-005]** focusables NodeList のキャッシュと DOM mutation
- **[W-Rob-006]** `aria-modal` のみで AT 隔離不十分（ADR-006 で out of scope と明記済み、別 Issue 候補）
- **[W-Rob-007]** MergeTagDialog の shadow 差分が未検証（PR 説明でビジュアル確認チェック追加済み）
- **[W-Rob-008]** `[contenteditable]:not([contenteditable="false"])` を focusable selector に追加すべき
- **[W-Rob-009]** `closable` 変化で keydown listener が re-attach（cosmetic）
- **[W-Rob-010]** `previousActiveRef` の StrictMode 二重 capture（B-001 修正と合わせて検討）
- **[W-Rob-011]** z-index と Portal stacking context（現状 OK、将来検討）

### Notes
- Dialog/DialogInner 2 階層構造（ADR-010）は適切に実装
- `closable={!isPending}` 全 callsite 正しく伝達
- ADR-011 / ADR-012 の biome / TS 対応は適切

---

## 修正方針

このラウンドで対応する項目:

1. **B-001 + Rob B-002**: 初期 focus effect の依存配列に `mounted` を追加
2. **B-002**: Tab トラップに `!panel.contains(active)` を追加
3. **B-003**: IME composition ガード `event.isComposing` 追加
4. **W-Rob-001**: scroll lock の reference counter 実装（module-scope）
5. **W-Rob-008**: focusable selector に `[contenteditable]:not([contenteditable="false"])` 追加
6. **W-Arch-003**: `DialogInner` の `open` props 排除（`Omit<DialogProps, "open">`）

別 Issue（フォローアップ）に切り出すもの:

- **W-Arch-001 / W-Arch-002**: cross-domain import 解消（`common/styles.ts` 新設）
- **W-Arch-005**: `ariaLabel` → `ariaLabelledBy` への 5 ダイアログ移行
- **W-Rob-006**: AT 隔離（`inert` / 兄弟 `aria-hidden`）

その他は ADR / コメントで対応。

---

## Design Decisions

- B-001 と B-002 は plan.md の「実装ステップ 1」レベルの基本 A11y 要件未達。**初期 focus と Tab トラップ完全性は Dialog の存在意義そのもの**なので最優先で修正
- B-003 (IME) は日本語プロダクトとしてのリスクが高く、`event.isComposing` ガードは 1 行追加で済むため即修正
- scroll lock の ref counter は ADR-008 の「単一ダイアログ前提」の制約を緩めるが、複数ダイアログ同時 open の事故シナリオが BulkActionBar に既に存在（独立 state）し、防御コストが低いので導入
- cross-domain import の根本解消は **このPRで完了する** よりも別 Issue で `common/styles.ts` 新設して既存 ConfirmDialog の `note/styles` 依存もまとめて解消する方が、PR 1 つあたりのスコープが適切
