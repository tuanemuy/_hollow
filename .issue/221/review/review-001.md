# PR Review #001 — feat(ingestion): improve upload feedback (#221)

**PR:** #277
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9
- Notes: 14
- Verdict: **BLOCKED**（Warnings 修正後 APPROVED 想定）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-F-001]** `IngestionQueue.tsx` の `schedule(0)` が `visibilitychange` 復帰時に in-flight な `tick()` をキャンセルせず並行起動する race
  - 場所: `app/components/ingestion/IngestionQueue.tsx`
  - 提案: `inflightRef` で重複 tick をガード、または `AbortController` でリクエストをキャンセル
- **[W-F-004]** fatal kind に `notFound` を含めるのが過剰
  - 場所: `app/components/ingestion/IngestionQueue.tsx`
  - 提案: `unauthorized` / `forbidden` の2種に絞る

### Notes
- [N-001] polling 設計は plan + ADR-003 通り
- [N-002] FailedView と IngestionJobRow のスタイル差は意図的
- [N-003] async server component + initial data + client polling の構成は慣用に従う
- [N-004] `extractSerializedError` 拡張は安全（narrow narrowing）
- [N-005] transport-boundary validation 適切
- [N-006] data-* / Tailwind utility 原則遵守

---

## Presentation / Error Handling

### Blockers
なし

### Warnings
- **[W-P-001]** `extractSerializedError` の直接認識ブランチ（ADR-006）のテスト欠落
  - 場所: `app/core/presentation/__tests__/errorDisplay.test.ts`（または errorResponse の専用テスト）
  - 提案: bare SerializedError 形状を渡すユニットテストを追加（business / system / garbage を区別）
- **[W-P-002]** `renderConflictMessage` の `default` 分岐が他の `CONSTRAINT_VIOLATION` で同種バグを起こすリスク
  - 場所: `app/core/presentation/errorDisplay.ts`
  - 提案: `CONSTRAINT_VIOLATION` 用ケースを追加するか、ADR-007 Consequences に同種リスクを明記
- **[W-P-003]** `renderBusinessMessage` の `business` fallback が `error.message`（spec 文言 / 英語）を素通しする経路が Issue 完了条件「内部スタック／原文 message が露出しない」と矛盾する可能性
  - 場所: `app/core/presentation/errorDisplay.ts`
  - 提案: `business` の fallback も汎用文言（「操作を完了できませんでした…」）に倒す

### Notes
- [N-001] `FRONT_MATTER_JSON_INVALID` の命名規約逸脱は既存負債
- [N-002] `role="status"` は暗黙 aria-live="polite"
- [N-003] ADR-005 区切りコメントと冒頭サマリの二重感
- [N-004] `asSerializedError` が `code` を validate しない
- [N-005] `invalid_status_for_*` と `ingestion.invalid_state` の文言揺れ（操作してください / お試しください）
- [N-006] IngestionJobRow の `role="alert"` 二箇所同居

---

## Application / Domain

### Blockers
なし

### Warnings
- **[W-A-001]** `idGenerator.next()` が 0-byte guard より前に呼ばれて ID 飛び番になる
  - 場所: `app/core/application/ingestion/uploadFile.ts:31` の前後
  - 提案: 0-byte ガードを `UserId.create` / `idGenerator.next()` より前に移動

### Notes
- [N-001..007] ガード位置は正しい、ADR-007 の判断妥当、bulkUpload も保護される、test スタイル整合、メッセージは server log 用として明瞭

---

## Test / Spec

### Blockers
なし

### Warnings
- **[W-T-001]** `spec/design/index.md` のセクション番号順序 `9 → 10b → 10 → 11` が混乱を招く
  - 提案: `10b` を `10` に改名し既存 `10/11` を `11/12` にリナンバー、または番号を落として `## フィードバック・エラー表示原則（#221）`
- **[W-T-002]** `errorDisplay.test.ts` (c) グループのテスト名が intent を表せていない
  - 提案: 「value-object construction codes (group (c)) — fallback so internal codes never leak」のような intent ベース名にする
- **[W-T-003]** `IngestionQueue.tsx` 専用テストが存在しない（plan で意図的にスコープアウト）
  - 提案: `.issue/221/progress.md` または別 Issue として記録

### Notes
- [N-001] テストカウント一致確認
- [N-002] マッピング表の (a)/(c) 分類網羅性確認
- [N-003] UploadForm test は AppServerError 経由
- [N-004] spec/manual-tests/ingest.md は変更不要だった
- [N-005] ADR-007 のみ Status: Accepted ヘッダー
- [N-006] plan.md L585 と L529-535 の二重記述

---

## Design Decisions

特になし（このラウンドの修正で派生するものは round-2 にて記録）
