# PR Review #001 — feat(ingestion): UI に「破棄済みを表示」トグルを追加

**PR:** #335
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 8（Frontend 3 / Presentation 2 / Test 3 — うち重複1）
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を修正のため。修正後 review-002 で再判定）

3レイヤー（Frontend / Presentation・検証境界 / Test）を並列レビュー。Blocker は全レイヤーで0件。Warning は実装の誤りではなく、コメント矛盾・テストカバレッジ・表現の明確化が中心。基本方針に従い妥当なものはその場で修正した。

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** DiscardedToggle の `data-primary` と aria の関係が不明確
  - 判定: **据え置き**。`DisplayModeSwitch` と同一の確立パターン（`pillBtnPrimary` が `data-[primary]:` variant を駆動、`aria-pressed` は状態通知）。誤りではなく規約準拠。
- **[W-002]** `IngestionQueue` の effect 依存に `includeDiscarded` が無い、と計画が記載
  - 判定: **修正済み**。実装は既に `[fetchJobs, includeDiscarded]` で正しい。ただし JSDoc が「effect 依存に追加不要」と書いており**コメントと実装が矛盾**していたため、JSDoc を実態（依存に含める／lint-clean）に合わせて修正（`IngestionQueue.tsx`）。
- **[W-003]** `aria-pressed` に boolean を直接渡す
  - 判定: **据え置き**。React が文字列化、既存コンポーネントと一貫。問題なし。

## Presentation / 検証境界

### Blockers
なし

### Warnings
- **[W-001]** `uploadSearchSchema` の transform が非truthy値を `false` で出力（`undefined` で統一する案）
  - 判定: **据え置き**。挙動は正しくテスト済み。loader が `?? false` で正規化、トグルは OFF 時に `undefined` を navigate するため `false` が URL に書かれることはない。レビュアーも「実害なし」と明記。tri-state（undefined/true/false）→ loader で boolean に畳む設計は一貫しており、不要な churn を避けるため現状維持。
- **[W-002]** 計画と実装の effect 依存の記述矛盾
  - 判定: **修正済み**（Frontend W-002 と同一。JSDoc を修正）。

## Test

### Blockers
なし

### Warnings
- **[W-001]** falsy=false テストのラベルと正規化ロジックの対応が見づらい
  - 判定: **修正済み**。`it.each` で型別（boolean/number/string）に分割し、union 各メンバーの falsy カバレッジを明示。
- **[W-002]** falsy 値の型分け（boolean/number/string）がテストで可視化されていない
  - 判定: **修正済み**（W-001 と同じ `it.each` 分割で対応）。
- **[W-003]** 破棄済みカードのアクションボタン非表示が未検証
  - 判定: **修正済み**。「renders no action buttons on a discarded card」テストを追加（`ConfirmDialog` は閉時 null、status-gated アクションは discarded に該当しないため0個を表明）。
- **[W-004]** 「存在かつ不正な shape」（null 等）の複合ケース未検証
  - 判定: **修正済み**。`it.each` で `{nested}` / `null` / `[1]` を網羅し、throw せず `undefined` を返すことを表明。

---

## 修正サマリー（このラウンドで対応）

- `app/components/ingestion/IngestionQueue.tsx` — JSDoc のコメント矛盾を修正（effect 依存に含める旨へ）
- `app/components/ingestion/__tests__/uploadSearch.test.ts` — falsy を型別 `it.each` に分割、present-but-invalid（object/null/array）の網羅を追加
- `app/components/ingestion/__tests__/IngestionJobRow.test.tsx` — 破棄済みカードのアクションボタン非表示テストを追加

検証: `pnpm typecheck` / `lint:fix` / `format` クリーン、対象テスト 19 件 PASS。

## Design Decisions

新規 ADR なし。Presentation W-001（transform の false 出力）は据え置き判断の根拠を本ファイルに記録（ADR 化するほどの新規判断ではない）。
