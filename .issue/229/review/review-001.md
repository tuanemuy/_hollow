# PR Review #001 — feat(ingestion): hide discarded jobs from upload queue by default

**PR:** #236
**Date:** 2026-05-27
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7（Domain&UseCase 4 / Adapter 2 / Test 3 — Adapter W-001/W-002 はレビュアー自身が「本PR範囲外」と明示）
- Notes: 18（良い点と参考情報）
- Verdict: **BLOCKED**（Blocker は無いが Warning を可能な限り取り込んでから APPROVED に進める方針）

---

## Domain & Use Case

### Blockers
- なし

### Warnings

- **[W-001]** `excludeStatuses` のスプレッド copy 意図が読みにくい
  - 場所: `app/core/adapters/d1/repositories/ingestionJobRepository.ts:370`
  - 理由: `[...opts.excludeStatuses]` が「単に readonly を剥がしている」ように見え、意図が不透明
  - 提案: `Array.from(...)` で明示するか、短いコメントを付ける
  - **対応**: Adapter レビューの N-001 で「`noteRepository.ts:659/698`、`mediaAssetRepository.ts:100` で `inArray(col, [...readonly])` として一貫して使われている慣用句」と確認済み。プロジェクトの一貫したパターンなので、見送り（DRY と整合性を優先）

- **[W-002]** `(["discarded"] as const)` の型注釈
  - 場所: `app/core/application/ingestion/getIngestionJobs.ts:47-50`
  - 提案: `: readonly IngestionStatus[]` 注釈、または定数化
  - **対応**: W-004 の定数化で実質代替される。W-004 を採用

- **[W-003]** usecase 側の二重防御の意図記述
  - 場所: `app/core/application/ingestion/getIngestionJobs.ts:44-50` と `ports/ingestionJobRepository.ts:16-22`
  - 提案: ADR か JSDoc に「usecase 側も契約に従って exclude を渡さない」と一行入れる
  - **対応**: コメントに「include 優先契約はポート側でも守られているが、usecase でも明示することで意図を表現」と一文を追加して整理する

- **[W-004]** ADR-001 の Consequences で言及された「除外集合の語彙化」がコードに落ちていない ✅ **採用**
  - 場所: `app/core/application/ingestion/getIngestionJobs.ts:49`
  - 提案: モジュール先頭に `const UPLOAD_QUEUE_DEFAULT_HIDDEN_STATUSES: readonly IngestionStatus[] = ["discarded"]` を切り出す
  - **対応**: 採用。「キュー表示の既定除外集合」というドメイン概念を集約

### Notes
- N-001〜N-006: ポート設計の妥当性、JSDoc 品質、DTO 拡張の非破壊性、Application 層配置の妥当性、他 usecase との独立性、テスト網羅性すべて良好と評価

---

## Adapter

### Blockers
- なし

### Warnings

- **[W-001]** `IngestionStatus` のブランド化不在による境界検証の欠如
  - **対応**: レビュアー自身が「本 PR で対処する必要はない」と明示。**見送り**

- **[W-002]** `idx_ij_owner_status` の `NOT IN` での部分的利用
  - **対応**: レビュアー自身が「そのままで OK」と明示。**見送り**

### Notes
- N-001〜N-007: `[...readonly]` 慣用パターン準拠、include 優先の構造的強制、空配列ガード、import 順序、他クエリ非影響、エラー翻訳非影響、単一呼び出し元による波及封じ込め — すべて評価

---

## Test

### Blockers
- なし

### Warnings

- **[W-001]** `excludes discarded jobs by default` の assertion が暗黙の順序依存（1件ケースなので機能的には問題なし） ✅ **採用**
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:883-884` 等
  - 提案: 全ケースで `.sort()` を統一するか、件数1ケースを `toHaveLength` + `toBe` で明示する
  - **対応**: 採用。ファイル内の一貫性を確保（既存 `returns only the actor's jobs` も2件で sort しているため、新規4ケースもファイル内方針に整合させる）

- **[W-002]** 4ケース目で `notes` 直接 INSERT — `seedNote` helper 抽出余地
  - **対応**: レビュアー自身が「本 PR の範囲を超える」と明示。**見送り**（既存 `commitIngestionPreview` テストでも同じパターンを使っているのは N-001 の確認通り）

- **[W-003]** `includeDiscarded: true × status: "saved"` の組み合わせケース ✅ **採用**
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:929-969`
  - 理由: ADR-002 の「両者同時に渡された場合は `status` が優先」を直接検証できる
  - **対応**: 採用。低コストで ADR-002 を直接検証する回帰テストになる

### Notes
- N-001〜N-005: plan.md 4ケースの完全対応、既存テスト維持、`tempStorageKey: null` の業務整合性、ケース名の明確さ、fixture 衝突なし — すべて評価

---

## Design Decisions

このラウンドで新たな設計判断はなし（adr.md への追記は不要）。レビュアーが指摘した「除外集合の語彙化」は ADR-001 の Consequences で既に言及されており、それを実装に落とすだけ。

## 修正計画（次のラウンドへ）

1. `app/core/application/ingestion/getIngestionJobs.ts`: モジュール先頭に `UPLOAD_QUEUE_DEFAULT_HIDDEN_STATUSES` 定数を切り出す（W-004 採用）。W-002 もこれで解決。
2. `app/core/application/ingestion/getIngestionJobs.ts`: usecase 側の二重防御の意図をコメント1行で明示（W-003 採用）。
3. `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`: 既存4ケースの assertion を一貫させる（W-001 採用）。
4. `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`: `includeDiscarded: true × status: "saved"` ケース追加（W-003 採用）。
