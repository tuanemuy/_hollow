# PR Review #001 — feat(note-list): 絞り込みUIをチップ＋ポップオーバーに統一 (案2)

**PR:** #491
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 2（Frontend a11y）
- Warnings: 8（うち修正対象6 / 見送り2）
- Notes: 多数（設計・規約準拠への肯定的評価）
- Verdict: **BLOCKED**

3視点（Frontend/UX/a11y、純粋ロジック/正当性/テスト、アーキテクチャ/規約/スコープ）並列レビュー。ロジック視点・アーキ視点は Blocker 0件。日付計算は手計算（Node実行）で全プリセット・境界が正しいことを確認済み。

---

## Frontend / UX / アクセシビリティ

### Blockers
- **[B-001]** `role="menu"` パネル直下に `<div className="w-full">` ラッパーがあり、`menuitemradio` が menu の孫要素になっている。
  - 場所: `FilterBar.tsx` VisibilityPopover の children（`<div className="w-full">`）
  - 理由: WAI-ARIA Menu パターンでは menuitem は menu の直接の子（または role=group/none 経由）であるべき。間の generic div が menu→menuitem の所有関係を崩す可能性。
  - 提案: ラッパー div を削除し、menuitemradio ボタンを role=menu の直接の子にする（パネルは固定280px、ボタンは w-full で充填）。
- **[B-002]** `useLayoutEffect` のクランプが `setShiftX((prev) => prev + dx)` の累積形で、意図が読みにくい。
  - 場所: `FilterPopover.tsx` クランプ effect
  - 理由: deps=[open] で open 遷移時のみ実行され prev=0 なので実害はないが、累積形は誤読・将来の再実行で累積するリスク。
  - 提案: 自然位置（prev=0）から絶対値を `setShiftX(shift)` でセットする形に簡素化。

### Warnings（修正対象）
- **[W-004]** `reduceFilters` に網羅性チェック（`default: never`）がない → 追加。

### Warnings（見送り）
- **[W-001]** 期間ポップオーバー（dialog）の初期フォーカス未指定 → 非モーダル設計（フォーカストラップなし）で意図的。Tab で自然に入れる。見送り。
- **[W-002]** date input の aria-label に未設定/設定済み状態を含める → 既存 sr-only ラベル（開始日/終了日）で十分。aria-label と htmlFor label の二重化を避け見送り。
- **[W-003]** プリセット系テストが見当たらない → **誤認**。テストは `__tests__/listSelectors.test.ts` に存在し、ロジック視点レビューが網羅を確認済み。対応不要。

## 純粋ロジック・正当性・テスト

### Blockers
なし。全プリセット・境界（月またぎ/年またぎ/うるう年2月末/週の月曜起点）を手計算で検証し 100% 一致。タイムゾーン安全（ローカル日付）・純粋性（baseDate 注入）も確認。

### Warnings（修正対象）
- **[W-001]** `shortDate` の不正フォーマットフォールバック分岐がテストで pin されていない（schema が保証するため運用上は安全） → テスト追加。

## アーキテクチャ・規約・スコープ

### Blockers
なし。スコープ遵守（案1/3/4要素なし・schema変更なし・既存3メニュー非関与）、ADR-001〜004 と一致、規約準拠（utility-first / styles.ts集約 / data-* / コメントは why）。

### Warnings（修正対象）
- **[W-001]** styles.ts の filterChip 定数コメントが「全フィルター共有」を過剰主張。ディレクトリ・参照は ghost トリガーなし（active チップのみ）→ コメント修正。
- **[W-003]** `clearReferencingNoteId` / `clearDirectory` の個別解除で `page: undefined` 未付与。期間・公開状態の解除は付与しており不整合 → 一貫性のため両者にも付与。
- **[W-004]** `visibilityLabel(v: Visibility | "all")` に "all" の用途を示す JSDoc がない → JSDoc 追加。

### Warnings（見送り）
- **[W-002]** FilterPopover 契約の正式化 → 肯定的指摘（type-safe で良い）。対応不要。

---

## Design Decisions

このラウンドで新規 ADR を要する判断はなし。page リセットを「フィルターの個別解除すべて」に拡張する点は plan.md の統一ルールに沿う整合修正として扱う。
