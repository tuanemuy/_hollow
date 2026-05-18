# PR Review #001 — feat(view): persist visibilityFilter on SavedView (#31)

**PR:** #61
**Date:** 2026-05-19
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 4
- Notes: 13
- Verdict: **BLOCKED**（B-001 解消後 APPROVED 予定）

---

## Domain + Adapter（agent 1）

### Blockers
なし

### Warnings
- **[W-D1]** `decodeQueryJson` は `null` を `[]` に同化していない（`undefined` のみガード）
  - 場所: `app/core/adapters/d1/repositories/savedViewRepository.ts:88-89`
  - 理由: 現状の strict 挙動は正しいが、`null` でも `[]` 扱いにしておくと将来のシリアライズミスに耐えやすい
  - 提案: 任意。strict 維持でも可

### Notes
- [N-D1] `repairBrokenConditions` は visibilityFilter を正しく素通しする（visibility は enum リテラルなので broken-condition の対象外）
- [N-D2] `ViewQuery.create` の freeze / dedup / `empty()` / `equals` がすべて `tagIds` と対称
- [N-D3] reconstruct の `PublicationVisibility.create` 経由検証 → `RehydrationError` ラッピングが正しく機能
- [N-D4] encode/decode は 3 visibility 値・空配列・キー欠落全パターンで対称
- [N-D5] `json_extract($.visibilityFilter)` 系クエリ不要（visibility は削除されない enum）
- [N-D6] 余裕があれば `repairBrokenConditions` が非空の visibilityFilter を維持するアサーションを 1 つ追加

## Application + Frontend（agent 2）

### Blockers
なし

### Warnings
- **[W-A1]** Plan からの逸脱: `visibilitySchema` を再宣言している（plan は `note/schema.ts` の既存を再利用と明記）
  - 場所: `app/components/view/schema.ts:5`
  - 理由: visibility enum の定義が `note/schema.ts` / `publication/schema.ts` / `view/schema.ts` の 3 箇所に増殖した
  - 提案: `note/schema.ts` から `visibilitySchema` を export して `view/schema.ts` で import する、もしくは ADR を追記する

### Notes
- [N-A1] `viewQueryEquals` が `ViewQuery.equals` と URL 比較可能サブセットで対称
- [N-A2] `SaveViewDialog` の `[...payload.query.visibilityFilter]` spread は readonly → mutable 変換の意図的で問題なし
- [N-A3] 境界バリデーション（Zod + `PublicationVisibility.create`）が両層で対称
- [N-A4] DTO 投影 `query.visibilityFilter.map((v) => v)` は readonly 契約のための浅いコピー、問題なし
- [N-A5] URL ↔ ViewQuery の multi-element 非対称（複数値 SavedView を URL 化すると先頭値以外がドロップ）が ADR-002 / plan で文書化済み。テスト追加で挙動を pin すると安全
- [N-A6] 空フィルタ往復は対称（tests at L184/L350）
- [N-A7] plan ↔ diff の対応関係: W-A1 を除いて 1:1

## Tests + Cross-cutting（agent 3）

### Blockers
- **[B-001]** ADR-003 の後方互換デコード（`visibilityFilter` キー欠落 → `[]`）に対応する**自動テストが存在しない**
  - 場所: `app/core/adapters/d1/repositories/savedViewRepository.ts:82-89`
  - 理由: 本 PR の最もリスクの高い分岐（純粋ランタイム判定）が型でもテストでも担保されていない。manual-test の TC でも明示空配列のみで、キー欠落ケースは未確認
  - 提案: `app/core/adapters/d1/repositories/__tests__/savedViewRepository.test.ts` を新設し、以下を担保:
    - `decodeQueryJson` が `visibilityFilter` キーを欠く JSON で `[]` を返す
    - 正常な `["public","unlisted"]` がそのまま返る
    - 不正型（number / mixed-type 配列）で `SystemError(DataIntegrityError)` が出る
    - `encodeQueryJson` → `decodeQueryJson` ラウンドトリップ

### Warnings
- **[W-T1]** usecase テストが `visibilityFilter: []` しか通していない（populated パスが usecase レベルで未検証）
  - 場所: `app/core/application/view/__tests__/createSavedView.test.ts`, `updateSavedView.test.ts`
  - 提案: 各ファイルに `visibilityFilter: ["public"]` を含むケースを 1 つ追加
- **[W-T2]** usecase 入力に不正 visibility を渡したときの拒否テストがない
  - 提案: `createSavedView` が `visibilityFilter: ["bogus"]` で `BusinessRuleError` を投げることを確認

### Notes
- [N-T1] plan Step 11 の「型保証 + manual-test で十分」判断は B-001 解消後に再評価
- [N-T2] セキュリティ的にはきれい（3 段の境界検証で injection / type-confusion を遮断）
- [N-T3] migration なしの判断は健全（query_json は TEXT、フィールド追加は破壊変更にならない）
- [N-T4] referencingNoteId 先例との一貫性 OK（順序・命名・equals パターン）

---

## Design Decisions

特になし（既存 ADR-001/002/003 で本ラウンドの論点は既にカバー）。
