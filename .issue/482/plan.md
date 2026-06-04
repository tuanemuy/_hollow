# 実装計画 — Issue #482: refactor: export usecase の id 入力契約を string に統一する（#473 残課題）

**Issue:** #482
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

#473（DTO ブランド型廃止）で「全ての usecase の id 入力をプリミティブ `string` に統一し、domain 境界への橋渡し（`as <DomainBrand>`）を usecase 内部に閉じ込める」規約が確立された（`dto/export.ts` から DTO ブランド `ExportJobId` は廃止済み。`retryExportJob` の入力は `actorUserId: string; jobId: string`）。export スライスの一部 usecase だけがこの規約から外れ、presentation が `@/core/domain/export/valueObject` の `ExportJobId`（domain ブランド）を直接 import して剥がしキャストで渡している。この presentation → domain の依存漏れを解消し、`retryExportJob` のパターンに揃える。

挙動変更を伴わない型レベルのリファクタ。

## スコープ

### 含まれるもの

- 4 つの export usecase の `jobId` 入力型を domain `ExportJobId` → プリミティブ `string` に変更し、domain 境界への橋渡し（`input.jobId as ExportJobIdBrand`）を usecase 内部に閉じ込める:
  - `getExportJob` / `cancelExportJob` / `downloadExportArtifact` / `runExportJob`
- presentation 4 ファイルから `@/core/domain/export/valueObject` の `ExportJobId` import と剥がしキャストを除去し、`data.jobId`（zod 検証済み `string`）をそのまま渡す:
  - `app/routes/exports/$jobId.tsx`
  - `app/components/export/ExportJobDetail/Page.tsx`
  - `app/components/export/ExportJobDetail/loader.ts`
  - `app/components/export/ExportForm/action.ts`

### 含まれないもの

- `actorUserId`（domain `UserId`）の入力契約 — 本 Issue は `jobId`/`ExportJobId` の漏れのみが対象。`getExportJob`/`cancelExportJob`/`downloadExportArtifact` は引き続き domain `UserId` を入力に取り、loader.ts/Page.tsx も domain `UserId` を import する。これは別スライス（ingestion 含む）にも横たわる同種の課題で、Phase 4 のスコープ外起票候補。
- `retryExportJob` 自体（既に規約準拠）。
- `enqueueExportJob` / `startExportJob`（`jobId` を入力に取らない。`NoteId` の domain キャストは別課題で据え置き）。
- ingestion スライス（同種の課題があるが Issue 範囲外）。
- worker（`dispatchDomainEvent.ts`）の `ExportJobId.create()` による検証ロジック — application 層内の正当な domain VO 構築であり、presentation 漏れではない。空 jobId の検証はここに残す（テストが pin 済み）。詳細は adr.md ADR-001。

## 確立済みパターン（retryExportJob / 基準）

```ts
// usecase 側
import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject";

export type RetryExportJobInput = Readonly<{ actorUserId: string; jobId: string }>;
// ...内部で domain 境界へ橋渡し:
await exportJobRepository.findById(input.jobId as ExportJobIdBrand);
```

```ts
// presentation 側（admin/Jobs/action.ts）— domain import もキャストもない
await module.retryExportJob({ container, input: { actorUserId: actor.id, jobId: data.jobId } });
```

## 実装ステップ

### 1〜3. `getExportJob` / `cancelExportJob` / `downloadExportArtifact` の入力型を `string` へ

- **対象ファイル:** `app/core/application/export/{getExportJob,cancelExportJob,downloadExportArtifact}.ts`
- **変更内容:**
  - `import type { ExportJobId } from "@/core/domain/export/valueObject"` → `import type { ExportJobId as ExportJobIdBrand } from "@/core/domain/export/valueObject"`。
  - 入力型の `jobId: ExportJobId` → `jobId: string`。
  - `findById(input.jobId)` → `findById(input.jobId as ExportJobIdBrand)`。
- **理由:** 入力契約を retry に揃え、domain ブランドを usecase 入力から外す。`actorUserId`（domain `UserId`）は据え置き。

### 4. `runExportJob` の入力型を `string` へ

- **対象ファイル:** `app/core/application/export/runExportJob.ts`
- **変更内容:**
  - `import type { ExportJobId } from "@/core/domain/export/valueObject"` → `import type { ExportJobId as ExportJobIdBrand } from "..."`（内部ヘルパー `assembleAndComplete`/`failJob`/`transitionPendingToProcessing` の `jobId` 型注釈は domain ブランドのまま使い続けるので alias で残す）。
  - `RunExportJobInput.jobId: ExportJobId` → `jobId: string`。
  - usecase 本体冒頭で一度だけ domain 境界へ橋渡し：`const jobId = input.jobId as ExportJobIdBrand;`。以降の `input.jobId` 参照（`transitionPendingToProcessing` への引き渡し、`failJob` 呼び出し2箇所）を `jobId` に置き換える。`assembleAndComplete` は `startedJob.id`（domain entity の id、既に domain ブランド）を渡しており input.jobId 非依存。
  - `transitionPendingToProcessing(container, input)` のシグネチャを `(container, jobId: ExportJobIdBrand)` に変更し、内部の `input.jobId` を `jobId` 参照に。
  - `failJob`/`assembleAndComplete` の `jobId: ExportJobId` 引数型注釈を `ExportJobIdBrand`（domain alias）に揃える。
- **理由:** worker は `ExportJobId.create()` で検証済み domain ブランドを渡しており、それは `string` へ代入可能。worker・テストを一切変えずに domain ブランドを公開入力型から外せる。検証位置は worker に残す（adr.md ADR-001）。

### 5〜8. presentation 4 ファイルの domain import 除去

- **対象ファイル:** `$jobId.tsx` / `ExportJobDetail/Page.tsx` / `ExportJobDetail/loader.ts` / `ExportForm/action.ts`
- **変更内容:**
  - `import type { ExportJobId } from "@/core/domain/export/valueObject"` を除去。
  - `$jobId.tsx`: `<ExportJobDetailPage jobId={data.jobId as unknown as ExportJobId} />` → `jobId={data.jobId}`（`data.jobId` は `z.string().min(1)` 済みの素の `string`）。
  - `Page.tsx`: prop 型 `{ jobId: ExportJobId }` → `{ jobId: string }`。
  - `loader.ts`: `LoadExportJobInput.jobId: ExportJobId` → `jobId: string`（domain `UserId` import はスコープ外なので据え置き）。
  - `ExportForm/action.ts`: `cancelExportJob`/`downloadExportArtifact` 呼び出しの `jobId: data.jobId as ExportJobId` → `jobId: data.jobId`。`import type { NoteId } from "@/core/domain/note/valueObject"` は残す（除去は `ExportJobId` のみ）。
- **理由:** presentation から domain valueObject 依存を剥がす。`admin/Jobs/action.ts` が完全な前例（domain import もキャストもなく `jobId: data.jobId` を渡す）。

### 9. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test`（unit + integration）— 特に `dispatchDomainEvent.test.ts`（runExportJob 呼び出し・空 jobId 検証）と `handlers.integration.test.ts`、`retryExportJob.integration.test.ts` が通ること。

## 設計判断

- **ADR-001:** `runExportJob` の入力を `string` 化しても、空 jobId 検証（`ExportJobId.create()`）は worker に残す。詳細は adr.md。

## リスクと注意点

- **挙動保存が最優先。** 純粋な型レベルのリファクタであり、ランタイム挙動を一切変えない。
- **runExportJob の検証位置:** 空 jobId の検証は worker（`dispatchDomainEvent.ts` の `ExportJobId.create()`）に残す。`dispatchDomainEvent.test.ts` の「空 exportJobId で runExportJob が呼ばれず warn」テストがこの契約を pin している。`.create()` を usecase に移すとこのテストが壊れる＝worker レベルの挙動変更になるため、移さない。
- **domain `ExportJobId` の橋渡しは単一 `as`。** `string` → `string & { brand }` は単一 `as ExportJobIdBrand` で通る（retry と同形）。`as unknown as` は不要。
- 既存テストは mock + 値比較（`toHaveBeenCalledWith`）で型非依存のため、入力型変更で assertion は壊れない。

## テスト方針

- **自動テスト中心**（型レベルリファクタのため）:
  - `pnpm typecheck` — presentation から domain `ExportJobId` import が消え、4 usecase の入力型が `string` になっても型が通ること。
  - `pnpm test` — 既存の unit/integration が全て green。特に worker 経由の runExportJob 系・空 jobId 検証。
- **軽い手動確認**（任意）: エクスポートジョブ詳細ページの表示、retry/cancel/download の動作が変わらないこと。

## レビュー履歴

### 1周目（両視点並列・計画段階）

**アーキ・リスク視点:** 問題点ゼロ。worker レベルの空 jobId 検証契約の温存、presentation チェーンの型一貫性、既存テスト非破壊を確認済みとの評価。

**要件カバレッジ視点:** 対象 usecase 4件・presentation 4件が完全一致、スコープ外の切り分けも的確。要修正は P-001（Issue 本文と当時参照していたコードのズレを明記）。

### 実装時の重要な訂正

計画初稿はセッション開始時のブランチ（`issue/463`）の古い export スライス実装を参照しており、「DTO ブランド `ExportJobId` が現存し retry はそれを入力に取る」と誤認していた。実際の base ブランチ（`main`）では #473 で **DTO ブランドは完全廃止済み**で、`retryExportJob` の入力は素の `actorUserId: string; jobId: string`。Issue 本文の「`string` に統一」が正確だった。本計画・実装はこれに合わせ、**4 usecase すべて入力 `jobId: string`・内部 `as ExportJobIdBrand`** に統一、presentation は `data.jobId` をそのまま渡す形に修正した。
