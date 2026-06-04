# PR Review #001 — refactor(dto): DTO ブランド型を廃止しプリミティブ string に置き換える

**PR:** #480
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 多数（全レイヤーで domain 保護・ADR 準拠を確認）
- Verdict: **BLOCKED**（W-001 を修正してから再レビュー）

レビューレイヤー: Use Case / Application、Frontend / Presentation、Test の3並列。

---

## Use Case / Application

### Blockers
なし

### Warnings
なし

### Notes
- [N-001] domain 境界は完全に保護。`@/core/domain/**/valueObject` 由来のブランドは一切 string 化されていない。削除は `../dto/` 由来 import のみ（ADR-002 準拠）。
- [N-002] 入力 `.create()` 検証は無傷。production で消えた `.create()` はゼロ（`dispatchDomainEvent.ts:153` は末尾キャスト除去のみで `.create()` 本体は残存）。
- [N-003] 入力ブリッジは ADR-001 通り単一 `as DomainBrand` に統一。新規 `.create()` の混入なし。
- [N-004] export スライスの線引き正確（`retryExportJob` のみ DTO→string、`getExportJob`/`cancelExportJob` は domain 入力維持）。
- [N-005] 出力射影の素代入化が全 dto/ + インライン射影で正しい。
- [N-006] JSDoc / spec 同期が正確。残存 `__brand` 型定義ゼロ。
- [N-007] スコープ厳守。ADR-003 の `as string`（null ナローイング）維持を確認。挙動変更なし。

## Frontend / Presentation

### Blockers
なし

### Warnings
なし

### Notes
- [N-001] export presentation チェーンの domain ブランド `ExportJobId` キャストが ADR-002 通り残存（誤削除なし）。
- [N-002] DTO id import・ヘルパー（`toDtoUserId` 等）の除去が網羅的。未使用 import の新規発生なし。
- [N-003] domain ブランド境界の単一 `as` 縮約が一貫。同名衝突での取り違えなし。
- [N-004] props の string 化と呼び出し側の整合が型で担保。transport 境界の `inputValidator` は維持。
- [N-005] transport 境界の入力検証は不変（schema/validateSearch 変更ゼロ）。
- [N-006] UI 挙動・表示の変更なし（型のみ）。

## Test

### Blockers
なし

### Warnings
- **[W-001]** DTO 出力アンラップの `as unknown as string` が test 内に取り残され、純減目標から漏れている
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（254, 269, 445, 509, 640, 695, 783, 819, 859, 928, 1046, 1102, 1188, 1302, 1476, 1536, 1557, 1579, 1600, 1643, 1686 ほか多数）, `ownerRetryIngestionJob.integration.test.ts:114`, `runIngestionJob.integration.test.ts:1416`
  - 理由: 旧 main では DTO ブランド（`UploadFileOutput.jobId: IngestionJobId`、`IngestionJobDTO.id`、`seedUser` 戻り値 `UserId` 等）を `string` へ剥がす load-bearing キャストだったが、本 PR で当該 DTO 型が `string` になった結果 `string as unknown as string` の完全な no-op に成り下がっている。plan ステップ7 が presentation/loader で剥がした DTO 出力アンラップと同一カテゴリのキャストがテスト側だけ残置。plan ステップ8 が「DTO ブランド*入力*キャストのみ」とテスト範囲を入力に限定したための構造的取りこぼし。typecheck/lint は通る（Biome は冗長 cast を検出しない）が、純減の網羅性に穴。
  - 提案: LHS が既に DTO 由来 `string` の `X as unknown as string`（`jobId`/`noteId`/`owner`/`result.jobId`/`job.id`/`j.id` 等）を素の参照に置換する。**ただし domain 由来のキャスト**（`promptOverride.structure/metadata as unknown as string`、`findById(... as unknown as Parameters<...>)`、`INGESTION_JOB_ID as unknown as IngestionJobIdBrand`）は ADR-002 通り対象外として残す。

### Notes
- [N-001] キャスト削除の正しさは妥当。domain ブランド/mock 由来のキャストを誤って消した形跡なし。import 元での判別（ADR-002）が徹底。
- [N-002] カバレッジ不変。テストケース削除・skip/.only 追加・describe 削除は皆無。アサーションが緩んだ箇所なし。
- [N-003] seed ヘルパーの string 化は正しい。DB 挿入値・usecase へ渡す値は同一の生 string で振る舞い不変。
- [N-004] test ファイルの `as unknown as` 総数は main 783 → HEAD 667 で 116 件純減。W-001 解消でさらに進む。

---

## Design Decisions

特になし（ADR-001〜003 は計画・実装フェーズで記録済み）。
