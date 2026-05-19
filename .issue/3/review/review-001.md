# PR Review #001 — feat(admin): add P46 jobs monitor screen with admin retry

**PR:** #56
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 15
- Notes: 22+
- Verdict: **BLOCKED**（Warning が多数あり、可能なものはその場で修正）

---

## Domain

### Blockers
なし

### Warnings

- **[D-W-001]** `ExportJob.retry` の API 形状が同モジュール内の他の遷移と非対称
  - 場所: `app/core/domain/export/entity.ts:671-697`
  - 理由: 既存遷移は narrowed type を引数に取る bare 関数の再 export。retry のみ wrapper + runtime guard。
  - 提案: JSDoc に「spec G3 の admin オペレーション用に full union + runtime guard 形式」と一行記載 → その場で対応。

- **[D-W-002]** `IngestionJob.retry` 後に `regenerationCount` が引き継がれる挙動が JSDoc / テストで非明示
  - 場所: `app/core/domain/ingestion/entity.ts:243-271`, `__tests__/entity.test.ts:427-525`
  - 提案: JSDoc に「`regenerationCount` は意図的に保持（retry による上限迂回防止）」を追記 + テストに assertion 1 行 → その場で対応。

### Notes
- N-001: port JSDoc が read-only / OCC 対象外を明示済み
- N-002: イベント命名規約準拠
- N-003: エラーコード命名 SCREAMING_SNAKE 準拠
- N-004: 純粋関数性維持
- N-005: ADR-006 と実装の整合性 OK
- N-006: 型整合性 OK
- N-007: 計画準拠

---

## Application

### Blockers
なし

### Warnings

- **[A-W-001]** ingestion decoder テストが export 側と非対称
  - 場所: `app/core/application/ingestion/__tests__/eventDecoders.test.ts:42-57`
  - 提案: `IngestionEvents.retryRequested` draft 経由の独立 `it` ブロックで揃える → その場で対応。

- **[A-W-002]** deleted/suspended な admin の拒否テスト不在
  - 場所: `retryIngestionJob.integration.test.ts`, `retryExportJob.integration.test.ts`
  - 提案: 既存 admin usecase の規約に倣い、本 PR で 1〜2 ケース追加 → その場で対応。

- **[A-W-003]** export retry テストに「`tempStorageKey` 相当の制約がない」設計差の明示なし
  - 提案: テスト or JSDoc に ADR-001 への参照 1 行 → その場で対応。

- **[A-W-004]** retry usecase 戻り値が `Promise<void>`、retry 後 DTO を返さない
  - 提案: 機能的問題なし。Phase 4 で別 Issue 化する queue consumer 配線と一緒に検討する候補として progress.md に記録 → 後回し。

### Notes
- assertAdmin 配置・UoW 内操作・error 翻訳・統合テスト網羅性すべて適合

---

## Adapter

### Blockers
なし

### Warnings

- **[ADP-W-001]** migration の命名/書式が drizzle-kit 既定と乖離（`IF NOT EXISTS` 付き、手書き）
  - 場所: `app/core/adapters/d1/migrations/0006_admin_job_listing_indexes.sql`
  - 提案: 冒頭コメントで「手書き migration」と明示 → その場で対応。

- **[ADP-W-002]** `findRecent` の `limit` 上限の防衛ライン不在
  - 場所: `ingestionJobRepository.ts` / `exportJobRepository.ts` の port
  - 提案: port JSDoc に「caller が limit を妥当な範囲に絞ること」と一文追加 → その場で対応。

- **[ADP-W-003]** offset 巨大化時のコスト（deep pagination 効率劣化）
  - 提案: port JSDoc に「将来 paging 拡張時は keyset (seek) pagination を検討」と注記 → その場で対応。

### Notes
- index が完全カバー / mapDbError 翻訳整合 / Versioned<> を含まない read-only 戻り型 etc.

---

## Frontend

### Blockers
なし

### Warnings

- **[F-W-001]** `sortFailedFirst` が stable sort に依存しているがコメント無し
  - 提案: 「sort is stable per ES2019; relies on loader-side ORDER BY for intra-bucket order」コメント追加 → その場で対応。

- **[F-W-002]** `JOB_LIST_LIMIT=100` と testing.md の「limit 50」が不一致
  - 場所: `Jobs/action.ts:17`, `.issue/3/testing.md`
  - 提案: testing.md を 100 に修正 → その場で対応。

- **[F-W-003]** `as unknown as Parameters<...>` の二重キャスト可読性低下
  - 場所: `Jobs/action.ts` の retry server fn 内
  - 提案: `toIngestionJobIdDTO` / `toExportJobIdDTO` ヘルパで集約 → その場で対応。

- **[F-W-004]** error 表示に `aria-live` 無し
  - 場所: `Jobs/index.tsx:1665-1672, 1745-1752`
  - 提案: 既存 UsersTable も同様で踏襲。本 PR スコープ外（既存パターン踏襲）→ 後回し（progress.md 記録）。

- **[F-W-005]** retry 失敗確定ケース（NO_TEMP_STORAGE 等）の UX
  - 提案: F-W-004 と同じく既存パターン踏襲、displayError の i18n 不在は別 Issue → 後回し。

- **[F-W-006]** `ingestionStatusTag` / `exportStatusTag` の戻り値型が `string` 固定で網羅性チェック効かず
  - 提案: 戻り値型を `"info" | "success" | "warning" | "error"` literal union に → その場で対応。

### Notes
- routes・Page / Action / Layout すべて既存 admin パターン準拠
- transport validation 適合
- UoW 内 Promise.all で並列フェッチ
- ADR-004 / ADR-007 実装適合
- useTransition / router.invalidate() 規約準拠

---

## Design Decisions

特になし（既存 ADR-001〜007 と整合）。
