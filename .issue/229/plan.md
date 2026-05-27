# 実装計画 — Issue #229: 破棄したアップロードジョブを取り込みキューに残さない（既定で非表示）

**Issue:** #229
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

`discardIngestionPreview` で破棄したジョブ（`status = "discarded"`）が `UploadPage` の取り込みキューに残り続ける問題を解消する。Issueで合意された **A案（UI 側でフィルタ）** に沿って、`getIngestionJobs` のデフォルト挙動を「`discarded` を除外」に変更する。

## スコープ

### 含まれるもの

- `IngestionJobListOpts` への「除外ステータス」サポート（ポート拡張）
- D1 アダプタでの除外ステータスの実装
- `getIngestionJobs` ユースケースのデフォルト挙動変更（`discarded` を除外）
- 明示的に `discarded` を含めるためのオプトイン手段（`includeDiscarded` フラグ、または `status: "discarded"` 明示指定）
- `spec/usecases/ingestion.md` および `spec/testcases/ingestion/index.md` の追記
- 統合テストでのフィルタ挙動の担保

### 含まれないもの

- 「破棄済みを表示」UIトグル（Issueで任意要件とされている。API（`includeDiscarded`）だけ用意して、UI 露出は後続Issueに委ねる）
- 物理削除（B案）への移行
- `findRecent` / `findStuck` 等の他のクエリの挙動変更
- 既存の `previewing` / `pending` 状態のジョブの扱いの変更

## 実装ステップ

### 1. `IngestionJobListOpts` に `excludeStatuses` を追加

- **対象ファイル:** `app/core/domain/ingestion/ports/ingestionJobRepository.ts`
- **変更内容:** `excludeStatuses?: readonly IngestionStatus[]` を `IngestionJobListOpts` に追加。JSDoc では契約として以下を明記:
  - 与えられた status 群を結果から除外する。
  - `status`（include）と併用された場合は `status` の指定が優先され、`excludeStatuses` は **無視される**（アダプタは `notInArray` 句を生成しない）。呼び出し側はこの挙動を期待してよい。
- **理由:** 「破棄済みを既定で隠す」というアプリケーション層の関心事を、ポートで安定した語彙として宣言的に表現する。include/exclude を別フィールドに分けることで、将来 `discarded + saved` 両方を隠したい等の拡張にも対応可能。include 優先の契約をポート側に書くことで、アダプタ実装の解釈ブレを防ぐ。

### 2. D1 アダプタで `excludeStatuses` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/ingestionJobRepository.ts:359-383`（`findByOwner`）
- **変更内容:** `opts.status` が未指定 **かつ** `opts.excludeStatuses?.length` があるときに限り `notInArray(ingestionJobs.status, opts.excludeStatuses)` を `conditions` に追加。`opts.status` が指定されている場合は `excludeStatuses` を一切参照しない（ポート JSDoc の契約に合わせる）。
- **理由:** drizzle の `notInArray` で安全かつ宣言的に表現できる。SQL レベルでも余計な条件を発行しないことで、クエリプランが明快になる。

### 3. `getIngestionJobs` のデフォルトで `discarded` を除外

- **対象ファイル:** `app/core/application/ingestion/getIngestionJobs.ts`
- **変更内容:**
  - 入力 DTO に `includeDiscarded?: boolean`（既定 `false`）を追加。
  - `input.status` が明示指定されている場合は、その値で `status` フィルタを通す（履歴ビュー等のユースケースを温存）。このとき **`excludeStatuses` は付与しない**（include 優先の契約）。
  - `input.status === undefined && includeDiscarded !== true` の場合に `excludeStatuses: ["discarded"]` を `findByOwner` に渡す。
  - `input.status === undefined && includeDiscarded === true` の場合は従来通り全件返す（`excludeStatuses` も `status` も渡さない）。
- **理由:** 既定挙動を「キュー表示向け」に寄せつつ、明示的に discarded を見たいケース（履歴・管理用途、後続Issueでのトグル実装）への扉も閉じない。明示指定が既定除外より優先される契約をコード分岐としても明示する。

### 4. UI ローダー側は呼び出し変更なし（既定挙動の更新で吸収）

- **対象ファイル:** `app/components/ingestion/loaders.ts` / `app/components/ingestion/UploadPage.tsx`
- **変更内容:** なし。`loadIngestionJobs(user.id)` を従来通り引数なしで呼び、自動的に discarded が除外される。
- **理由:** Issue完了条件「破棄したジョブが既定で取り込みキューに表示されない」を満たす。「破棄済みを表示」トグルは任意要件のため本Issueスコープ外。

### 5. `spec/usecases/ingestion.md` の `GetIngestionJobs` セクションを更新

- **対象ファイル:** `spec/usecases/ingestion.md`（`GetIngestionJobs` の記述箇所）
- **変更内容:**
  - 「既定で `discarded` を結果から除外する。`includeDiscarded: true` または `status: 'discarded'` を明示することで履歴取得可能」と追記。
  - 入力 DTO の項目（`actorUserId`、`status?`、`limit?`、`offset?`、`includeDiscarded?`）を列挙して spec 側のシグネチャを明文化する（他ユースケースの記法に倣う）。
- **理由:** 設計判断をドキュメントに残す（CLAUDE.md の `spec/` を SSOT とする方針）。後続の spec-sync で乖離が出ないよう、入力DTOの記述レベルを揃える。

### 6. `spec/testcases/ingestion/index.md` の `GetIngestionJobs` テストケースを更新

- **対象ファイル:** `spec/testcases/ingestion/index.md`
- **変更内容:** 行を追加 —
  - 「discarded を含む自分のジョブ群 / Get（status 未指定）/ discarded を含まない一覧」
  - 「discarded を含む自分のジョブ群 / Get（`includeDiscarded: true`）/ discarded を含む一覧」
  - 「discarded を含む自分のジョブ群 / Get（`status: "discarded"`）/ discarded のみ含む一覧」
- **理由:** Issue完了条件「単体テストでフィルタ挙動を担保」のテスト設計を明文化する。

### 7. 統合テストを追加

- **対象ファイル:** `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（`describe("getIngestionJobs", ...)` 配下）
- **変更内容:** 以下3ケースを追加。
  - `excludes discarded jobs by default` — owner で previewing と discarded を seed、`actorUserId` のみで呼び、previewing のみ返ることを assert。
  - `includes discarded jobs when includeDiscarded is true` — 同条件で `includeDiscarded: true` を渡し、両方返ることを assert。
  - `returns only discarded when status is "discarded"` — `status: "discarded"` 指定で discarded のみ返ることを assert（明示指定が既定除外より優先される）。
  - `does not exclude discarded when status is explicitly set to non-discarded` — owner で `saved` 1件 + `discarded` 1件を seed し、`status: "saved"` 指定で `saved` のみ返ること（既定除外条件が混入していないこと）を assert。include 優先契約の回帰テスト。
- **理由:** Issue完了条件「単体テストでフィルタ挙動を担保」を満たす。既存パターン（`seedIngestionJob` + `getIngestionJobs`）にそのまま乗る。

## 設計判断

詳細は `.issue/229/adr.md` を参照。要点:

- **ポートに `excludeStatuses` を追加**（usecase 側で全件取得→JS フィルタする案は限界が多いため却下）
- **`includeDiscarded` フラグと `status: "discarded"` 明示の二系統サポート**（トグル用途と履歴ビュー用途を両立）
- **UI トグルは本Issueスコープ外**（任意要件のため API のみ用意）

## リスクと注意点

- **既存統合テストへの影響:** `describe("getIngestionJobs", ...)` の既存テストは `previewing` / `pending` のみ seed しており、デフォルト挙動変更で壊れない（事前確認済み）。
- **他の呼び出し元:** `getIngestionJobs` の呼び出しは `loaders.ts` と統合テストのみ。CLI / Worker からの呼び出しはない（grep 確認済み）。
- **`countByOwner` 系の不在:** `IngestionJobListOpts` を引数に取るメソッドは `findByOwner` のみ。`findRecent` / `findStuck` は別シグネチャなので波及は最小。
- **DTO 名空間:** `GetIngestionJobsInput` に `includeDiscarded?: boolean` を追加するだけ。既存呼び出し元（`loaders.ts`）は引数を渡していないため、変更は破壊的ではない。

## テスト方針

- **自動テスト** (`pnpm test:integration`):
  - 既定で `discarded` が除外されることを assert
  - `includeDiscarded: true` で `discarded` を含むことを assert
  - `status: "discarded"` 明示で `discarded` のみ返ることを assert
  - `status: "saved"` 明示で `discarded` 既定除外を引きずらないことを assert
  - 既存「他人のジョブを返さない」テストを維持
- **手動確認** (`pnpm dev` → `/upload`):
  - ファイルをアップロード → プレビュー画面で「破棄」 → `/upload` 再表示で破棄ジョブがキューから消えることを目視確認
- **静的チェック:** `pnpm typecheck && pnpm lint:fix && pnpm format`（CLAUDE.md 規定）

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点**: なし（問題点ゼロ）

**取り込んだ改善提案**:
- [S-001（アーキ視点）] Step 3 の DTO 分岐に「`status` 指定時は `excludeStatuses` を付与しない」旨を明示記載
- [S-002（アーキ視点）] Step 7 に4ケース目「`status: "saved"` 明示指定で discarded 既定除外を引きずらない」を追加（include 優先契約の回帰テスト）
- [S-003（アーキ視点）] Step 1 の JSDoc 仕様を「契約」として書き直し、アダプタ側に「`status` 指定時は `notInArray` 句を生成しない」と明示
- [S-004（アーキ視点）] Step 5 の `spec/usecases/ingestion.md` 更新に「入力DTOの項目列挙」を含める
- [S-002（要件視点）] adr.md ADR-003 に「`loaders.ts` のシグネチャは未拡張のため、UI から `status: "discarded"` ルートを使うには新規ローダー作成が必要」を注記

**見送った提案とその理由**:
- [S-001（要件視点）] 手動確認手順の補足 — テスト方針セクションで既に「ファイルアップロード → プレビュー画面で「破棄」→ `/upload` 再表示」と具体化されており、追加の補足は不要
- [S-003（要件視点）] 既存「他人のジョブを返さない」テスト維持の明示 — リスクと注意点セクションで既に言及済み
