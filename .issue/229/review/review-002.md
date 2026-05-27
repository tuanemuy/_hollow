# PR Review #002 — feat(ingestion): hide discarded jobs from upload queue by default

**PR:** #236
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Verdict: **APPROVED**

---

## Blockers
- なし

## Warnings
- なし

## Notes

### Round 1 修正の検証結果（採用4件）

- **D&U W-004（採用）** `getIngestionJobs.ts:13-15` に `UPLOAD_QUEUE_DEFAULT_HIDDEN_STATUSES: readonly IngestionStatus[]` を切り出し。命名・型注釈・配置位置（モジュール先頭）すべて妥当。JSDoc に拡張余地が記述されており、ADR-001 の Consequences「除外集合の語彙化」がコードに正しく落ちている。`IngestionStatus` は brand 型ではなく文字列リテラルユニオンなので `readonly IngestionStatus[]` 注釈で型安全。
- **D&U W-003（採用）** `getIngestionJobs.ts:54-57` のコメントが「ポート側で `status` 優先は保証されているが、call site でも明示することで契約を文書化し adapter 側の precedence のみに依存しない」と二重防御の意図を明確化。
- **Test W-001（採用）** 単一行 assertion を `toHaveLength(1) + toBe(...)` に統一。2要素ケースは従来通り `.sort()` を使うため、「件数1は明示／件数2以上は sort 統一」というファイル内方針と整合。既存「他人のジョブを返さない」テスト（2要素 sort）とも矛盾しない。
- **Test W-003（採用）** 新規ケース `treats explicit status as winning when both status and includeDiscarded are provided` が ADR-002 の契約「両者同時 → `status` が優先」を直接検証。`status: "saved", includeDiscarded: true` で `saved` のみ返ることを確認しており、契約違反を確実に捕捉できる。

### 見送り5件の妥当性（再確認）

- D&U W-001（`[...readonly]` 慣用句）: プロジェクト全体の一貫したパターン → 妥当
- D&U W-002（型注釈）: W-004 に吸収 → 妥当
- Adapter W-001（境界検証）: レビュアー自身が「本 PR で対処不要」と明示 → 妥当
- Adapter W-002（インデックス）: レビュアー自身が「そのままで OK」と明示 → 妥当
- Test W-002（`seedNote` helper 抽出）: レビュアー自身が「本 PR の範囲を超える」と明示 → 妥当

### 全体評価

- 新たな Blocker/Warning の混入なし
- 3レイヤー観点で確認: Domain ports 変更なし、UseCase は定数化とコメント刷新のみ、Adapter 変更なし、Test は assertion 統一＋追加1ケースのみ
- 品質ゲート（`pnpm typecheck` / `pnpm lint:fix` / `pnpm format` / `pnpm test:integration` 全 427 件 PASS）も問題なし
- PR は **APPROVED** で問題なし

## Design Decisions

このラウンドで新たな設計判断はなし（adr.md への追記は不要）。
