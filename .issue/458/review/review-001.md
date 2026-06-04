# PR Review #001 — fix(admin): 管理画面UIの崩れ・冗長表現をまとめて修正 (#458)

**PR:** #469
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 5
- Verdict: **BLOCKED**（Warning 解消後に APPROVED 見込み）

---

## General Review（フロントエンド/UI presentation 層）

### Blockers
- なし

### Warnings
- **[W-001]** デザイントークン整列（要件2）が「列幅・items-start の見直し」ではなく `pt` の統一のみで対応されており、縮小スコープの判断が文書化されていない。
  - 場所: `app/components/admin/DesignTokensForm/index.tsx:223-248`
  - 理由: Issue #458 は「列幅・`items-start` などを見直して揃える」と記述。実装はラベル列ラッパーの `pt-2`→`pt-1` 統一のみで列構造・`items-start` は据え置き。整列は manual-test TC-2（PASS・スクショ確認済み）で検証済みのため機能上の問題はないが、なぜ最小修正で十分かの判断が plan/PR に残っていない。
  - 提案: コード修正は不要。「列構造は据え置き・両列の `pt` 統一で先頭 input を整列」という判断を plan.md のスコープ/設計判断に明示し、追跡性を確保する。

### Notes
- **[N-001]** Tailwind ユーティリティのみで完結。新規CSS・`@apply`・新規トークンなし。CLAUDE.md の utility-first 方針に準拠。
- **[N-002]** `FIELD_LABEL_CLASS` の `block`→`flex items-center gap-2` 化は LLMSettingsForm 内ローカル定数で、PromptsForm 側の同名定数（`block` のまま）に巻き込みなし。内部スペースを含むラベルも単一テキストノードのため語間崩れなし。副作用なし。
- **[N-003]** バッジから `ml-2`/`align-middle` を除去し親 flex の `gap-2` に間隔を委譲。冗長ユーティリティ残置なし。全バッジ `aria-hidden="true"` 維持でアクセシビリティ退行なし。
- **[N-004]** PromptsForm の placeholder は purpose ごとに具体例化され説明文との重複を解消。削除した `INTENT_PLACEHOLDER` の旧コメントも残っていない。
- **[N-005]** 変更は admin 配下4コンポーネント + `.issue/458/` ドキュメントのみ。スコープ外混入なし。typecheck クリーン通過。

---

## Design Decisions

W-001 を受けて plan.md に「デザイントークン整列は列構造を据え置き、`pt` 統一で先頭 input を整列する」縮小スコープの判断を明記した（ADR 化するほどのトレードオフではないため plan.md 内に記録）。
