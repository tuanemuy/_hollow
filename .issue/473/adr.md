# ADR — Issue #473: DTO ブランド型を廃止しプリミティブ string に置き換える

## ADR-001: 入力ブリッジは `.create()` 検証を追加せず単一 `as DomainBrand` に縮める

### Status
Accepted

### Context

DTO ブランドを `string` に置き換えると、usecase の入力境界で DTO id（旧ブランド／新 `string`）を domain repository に渡す箇所が問題になる。domain repository（例 `ingestionJobRepository.findById`）は domain ブランド型（`IngestionJobId = string & { readonly [symbol]: true }`）を要求するため、プリミティブ `string` を直接渡せない。

現状これらの箇所（約 12 件、`ingestion/*`, `export/retryExportJob.ts`, `tag/{listTags,createTag}.ts` 等）は `input.jobId as unknown as IngestionJobIdBrand` という二重キャストで型橋渡しのみ行い、値検証はしていない（`.create()` を呼んでいない）。

選択肢:
- **(a)** `IngestionJobId.create(input.jobId)` で境界検証を入れる。`as unknown as` をゼロにでき、CLAUDE.md「Validate at the boundaries」の精神に合致するが、不正 id 時の挙動が `NotFoundError` → `BusinessRuleError` に変わる（**挙動変更**）。
- **(b)** `input.jobId as IngestionJobIdBrand` の単一キャストに縮める。`as unknown as` 件数は純減し、挙動は完全に不変。
- **(c)** repository 引数型を緩める。domain の API 契約を変えるため対象外。

### Decision

**(b) を採用。** 入力ブリッジは単一 `as DomainBrand` に置き換え、新たな `.create()` 検証は追加しない。

理由:
- Issue #473 の主旨は「無駄な `as unknown as` キャストの純減」であり、(b) はこれを満たす。
- Issue は「スコープ外の改善は含めない」「usecase 入力の境界 `.create()` 検証は維持（変更しない）」と明記している。検証を持たない箇所に新規追加するのは挙動変更でありスコープ外。
- (b) はランタイム挙動を完全に保持するため、既存テストが緑であれば振る舞い不変を保証できる。
- 既存の 3 箇所の `.create()` 検証はそのまま維持する（値の正しさは無傷）。

### Consequences

- 良い点: `as unknown as` を純減しつつ挙動を一切変えない。リファクタの安全性が最大。
- トレードオフ: 入力ブリッジに単一 `as` キャストが残る（domain 境界の構造上ゼロにはできない）。検証を持たない入力箇所の負債は本 Issue では解消しない（別途検討の余地）。

---

## ADR-002: codemod の対象判定は型名でなく import 元で行う

### Status
Accepted

### Context

DTO ブランド（`UserId`, `NoteId` 等）は domain ブランド（同名の値オブジェクト）と型名が衝突する。`grep '\bUserId\b'` のような型名ベースの一括置換は domain 層を破壊する。

### Decision

置換対象の判定は **import 元（import 文＝宣言単位）** で行う。`../dto/` または `application/dto` から import された識別子だけを `string` に置換し、`@/core/domain/` から import された同名型には一切触れない。`domain/**/valueObject.ts` は物理的に変更対象外とする。

判定単位は **import 文（宣言）単位**であり、ファイル・ディレクトリ単位の一括置換は不可。特に `export/` ディレクトリは同名 `ExportJobId` が DTO 由来（`retryExportJob.ts` の入力）と domain 由来（`getExportJob`/`cancelExportJob`/`downloadExportArtifact`/`runExportJob` の入力、および presentation チェーン全体）に分かれており、ファイル単位で処理すると domain 入力 usecase を巻き込む。

**presentation が domain ブランドを直接 import している箇所も対象外。** export presentation（`routes/exports/$jobId.tsx`, `components/export/ExportJobDetail/*`, `components/export/ExportForm/action.ts`）は `@/core/domain/export/valueObject` の `ExportJobId` を掴んでおり、対応 usecase の入力が domain ブランドのままなので、これらのキャストは残る。

既存コードが採用している import エイリアス（DTO 側 `UserIdDTO` / `DirectoryIdDTO` / `ExportJobIdBrand`、domain 側 `IngestionJobIdBrand` / `IdentityUserId` / `AdminSettingsUserId`）がこの判別を容易にしている。

### Consequences

- 良い点: domain ブランドの誤削除という最大リスクを構造的に排除できる。
- トレードオフ: 単純な sed 一括置換ではなく import 文脈を見た置換が必要。typecheck を段階的に回して安全性を担保する。
- 残課題: export スライスは id 入力契約が DTO（`retryExportJob`）と domain（`getExportJob` 等）で不統一。この不整合の統一は本 Issue のスコープ外として #482 に起票済み。

---

## ADR-003: `createDirectory` / `moveDirectory` の `parentId as string` は維持する（plan ステップ6 の例外）

### Status
Accepted（実装時に判明）

### Context

plan ステップ6 は「`input.X`（DTO id 入力）の冗長な `as string` を削除する」とし、`directory/createDirectory.ts:45` の `DirectoryId.create(input.parentId as string)` を対象に挙げていた。前提は「入力が `string` になるため `as string` が冗長」というもの。

しかし実装してみると、この `as string` は**ブランド剥がしではなく null ナローイング**を担っていた。`input.parentId` は `string | null`、`as string` を消すと async クロージャ境界をまたいで `parentId === null` のナローイングが保持されず `Argument of type 'string | null' is not assignable to parameter of type 'string'` でコンパイルが落ちる（旧コードでも DTO 型は `DirectoryId | null` で、同じく null を含んでいた）。

`moveDirectory.ts:69` の `input.newParentId as string` も同型。

### Decision

両箇所の `as string` は**維持する**。これは #473 が消す対象の「DTO ブランド剥がしキャスト」ではなく、null ナローイングのためのロードベアリングなキャストであり、削除すると挙動・型安全性が壊れる。`as unknown as` でもないため Issue の純減目標にも影響しない。

### Consequences

- plan ステップ6 の文面（「自然に解消される純ノイズ」）はこの2箇所には当てはまらなかった。残した判断はバグ回避であり、スコープ厳守の精神に沿う。

---
