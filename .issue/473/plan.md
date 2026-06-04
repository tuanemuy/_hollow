# 実装計画 — Issue #473: DTO ブランド型を廃止しプリミティブ string に置き換えて無駄な as unknown as キャストを純減する

**Issue:** #473
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

DTO 層が独自定義する 10 個のブランド型（`string & { readonly __brand: "XId" }`）を全廃し、DTO 型・usecase 入出力・presentation/loader の型注釈をプリミティブ `string` に置き換える。これによりブランド橋渡しの `as unknown as` キャストを純減する。ランタイム挙動は不変（ブランドは構造的に `string` のサブタイプ）。

## スコープ

### 含まれるもの

- DTO ブランド型定義 10 個の廃止（`dto/{identity,note,directory,tag,view,publication,export,ingestion}.ts`）
- 参照側（application usecase / components / routes / presentation / tests）の `XId` 型注釈 → `string` への置換
- dto 射影の `as unknown as XId`（domain→DTO 出力）→ 素の代入
- usecase 出力系インライン射影の `as unknown as XId` → 素の代入
- loader/presentation の `as unknown as string`（剥がし）キャスト削除
- `dto/index.ts` / `dto/identity.ts` のブランド規約 JSDoc 更新（設計判断の反転を明記）
- `spec/usecases/index.md` の型定義ブロックを string ベースに同期

### 含まれないもの

- domain 層のブランド型・値オブジェクト（`domain/**/valueObject.ts` の `XId.create()` を持つ `string & { readonly [symbol]: true }`）— 一切変更しない
- usecase 入力の既存 `.create()` 境界検証（3 箇所）— 維持・変更しない
- 入力ブリッジ箇所に新たな `.create()` 検証を追加すること（挙動変更になるためスコープ外。ADR-001 参照）

## 実装ステップ

### 1. DTO ブランド定義 10 個を削除し、DTO 型のフィールド注釈を string に

- **定義削除ファイル（8 個）:** `app/core/application/dto/{identity,note,directory,tag,view,publication,export,ingestion}.ts`
- **フィールド注釈書き換え対象（消費ファイル含む 10 個）:** 上記 8 個に加え、ブランドを sibling import して DTO 型フィールドに使う `dto/media.ts`（`MediaAssetId`/`UserId`）・`dto/search.ts`（`NoteId`/`UserId`/`DirectoryId`）も対象。
- **変更内容:** `export type XId = string & { readonly __brand: "XId" }` の定義行を削除。各 DTO 型（`NoteDTO.id: NoteId`, `MediaAssetDTO.id: MediaAssetId` 等）のフィールド型注釈を `string` に書き換える。
- **対象ブランド型（10 個）:** `UserId`, `MediaAssetId`（identity）/ `NoteId`, `NoteRevisionId`（note）/ `DirectoryId` / `TagId` / `SavedViewId`（view）/ `ShareLinkId`（publication）/ `ExportJobId` / `IngestionJobId`
- **注意:** `dto/note.ts`・`dto/media.ts`・`dto/search.ts` は sibling dto から id 型を import するため、1 定義削除で連鎖的に赤くなる。定義削除＋消費ファイルのフィールド注釈をまとめて 1 単位として typecheck を回す。
- **理由:** 型システム上 DTO ブランドを消す起点。これで全参照箇所が型エラーになり、置換漏れを typecheck が炙り出す。

### 2. dto 射影キャスト（domain→DTO 出力）を素の代入に

- **対象ファイル:** ステップ 1 の全 dto/ 射影ファイル（8 定義ファイル + `media.ts` + `search.ts`）の `to{Entity}DTO` 関数内
- **変更内容:** `id: x.id as unknown as XId` → `id: x.id`。domain ブランドは構造的に `string` なのでフィールド型が `string` になれば代入が通る。
- **理由:** 純減対象の中核（約 41 件）。

### 3. usecase 出力系インライン射影を素の代入に

- **対象ファイル:** `note/view.ts`, `note/getNoteDetail.ts`, `note/searchInternalLinkTargets.ts`, `search/view.ts`, `tag/{deleteTag,mergeTags,renameTag}.ts`, `publication/getPublicNote.ts` ほか dto/ 外の非テスト射影
- **変更内容:** `as unknown as XId`（domain→DTO 出力方向）を削除して素の代入に。
- **理由:** dto/ を経由しないインライン射影も同じく純ノイズ。

### 4. usecase Input/Output 型注釈を string に置換（import 元ベース）

- **対象ファイル:** `../dto/*` から id 型を import している application 配下のファイル群
- **変更内容:** `import type { UserId as UserIdDTO } from "../dto/identity"` 等の DTO id 型 import を削除し、当該注釈（`actorUserId: UserIdDTO`, `jobId: IngestionJobId` 等）を `string` に置換。
- **理由:** DTO ブランドの参照を根絶する。**判定基準は import 元（`../dto/`）であり型名ではない。** domain import（`@/core/domain/`）の同名型には絶対に触れない。

### 5. usecase 入力ブリッジ（DTO→domain ブランド）を単一 as に

- **対象ファイル:** `ingestion/{ownerRetryIngestionJob,runIngestionJob,regenerateIngestionPreview,discardIngestionPreview,getIngestionJob,retryIngestionJob,commitIngestionPreview}.ts`, `export/retryExportJob.ts`, `tag/{listTags,createTag}.ts` ほか
- **変更内容:** `input.jobId as unknown as IngestionJobIdBrand` → `input.jobId as IngestionJobIdBrand`。入力が `string` になった後も domain repository は domain ブランドを要求するため変換は残るが、`as unknown as` の二重キャストを単一 `as` に縮める。**新たな `.create()` 検証は追加しない**（ADR-001）。
- **理由:** 挙動を一切変えずに `as unknown as` 件数を純減する。

### 6. 冗長な `.create(input.X as string)` のダウンキャスト削除

- **対象ファイル:** `directory/createDirectory.ts:45` ほか、**`input.X`（DTO id 入力）に対する `as string` に限定**
- **変更内容:** `DirectoryId.create(input.parentId as string)` → `DirectoryId.create(input.parentId)`。入力が `string` になるため `as string` が冗長に。
- **対象外:** `ContentHtml.create(out.html as string)`（`saveNote.ts` / `createNote.ts` / `restoreNoteRevision.ts` 等）の非 id・domain/LLM 由来キャストはスコープ外。触らない。
- **理由:** 入力型変更で自然に解消される純ノイズのみ対象。

### 7. presentation/loader の剥がしキャストを削除（DTO 由来のみ）

- **対象ファイル:** `app/components/note/{loaders.ts,directoryTree.ts,detail/NoteMetaPanel.tsx}`, `app/routes/_app/notes/$noteId/*.tsx`, その他 components/routes
- **変更内容:** コンポーネント props 型・loader 戻り値型の **`../dto/` 由来 `XId` import** を削除し `string` に変更。その後 `as unknown as string`（約 102 件）の剥がしキャストを削除。
- **対象外（重要）:** export スライスの presentation チェーン（`routes/exports/$jobId.tsx`, `components/export/ExportJobDetail/{Page.tsx,loader.ts}`, `components/export/ExportForm/action.ts`）は **domain ブランド** `ExportJobId` を `@/core/domain/export/valueObject` から import している。`getExportJob`/`cancelExportJob`/`downloadExportArtifact`/`runExportJob` の Input が domain ブランドのままであるため、これらの `as unknown as ExportJobId` / `as ExportJobId`（domain 由来）は ADR-002 によりスコープ外として**残す**。
- **理由:** DTO 由来の剥がしキャストのみ不要になる。`getNoteDetail.ts` 起点の `originalFileName as unknown as string` はここで自然解消。

### 8. テストのブランド入力キャスト削除

- **対象ファイル:** `app/core/application/**/__tests__/*.ts`（DTO ブランド入力キャストのみ、概算 ~104 件。テスト内 `as unknown as` 総数 410 件のうち DTO id 入力分が対象で、件数は概算）
- **変更内容:** `jobId as unknown as IngestionJobId`（DTO 由来）→ `jobId`。typecheck エラー駆動で機械的に処理。domain ブランドや mock 由来のキャストには触れない。
- **理由:** 入力型が `string` になれば DTO 由来キャストは不要。

### 9. JSDoc / spec の更新

- **対象ファイル:** `app/core/application/dto/index.ts`, `app/core/application/dto/identity.ts`, `app/core/application/dto/search.ts`（`OwnedSearchHitDTO` の JSDoc がブランド規約を説明している）, `spec/usecases/index.md`
- **変更内容:** ブランド規約 JSDoc を「DTO id はプリミティブ `string`。旧ブランド方式を廃止した設計判断（#473）」に書き換え。`search.ts` の「`to{Entity}DTO` helpers are the single bridge between domain and DTO brand schemes」という記述も陳腐化するため更新。`spec/usecases/index.md` の型定義ブロックも string ベースに同期。
- **注意:** `spec/usecases/index.md` の型定義は 9 ブランド（NoteRevisionId が元々無い）で実装側 10 個と非対称。同期時にこの差分を把握した上で string 化する。
- **理由:** 設計判断の反転を文書に残し、spec と実装の乖離を防ぐ。

### 10. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit && pnpm test:integration`
- 理由: typecheck が残存ブランド参照・剥がし忘れキャストを全て炙り出す。lint:fix が未使用 import（消し忘れた `*DTO` import）を検出。テスト緑で振る舞い不変を確認。

## 設計判断

詳細は `.issue/473/adr.md` 参照。

- **ADR-001:** 入力ブリッジ（DTO→domain ブランド）は新たな `.create()` 検証を追加せず単一 `as DomainBrand` に縮める。挙動不変・スコープ厳守を優先。
- **codemod の判定基準は型名でなく import 元** — `\bUserId\b` の単純置換は domain を破壊する。必ず `../dto/` 由来の識別子だけを対象にする。既存の `*DTO` / `*Brand` エイリアスがこの判別を容易にしている。
- **spec/usecases/index.md も更新対象** — Issue は dto/index.ts のみ明記だが、ここが canonical 定義元なので同期しないと乖離する。

## リスクと注意点

- **domain ブランドを誤って消すリスク（最大）:** `UserId`/`NoteId` 等は domain と DTO で同名。codemod は必ず import 元 `../dto/` でフィルタし、`@/core/domain/` import には触れない。`domain/**/valueObject.ts` は物理的に変更対象外とする。
- **入力の `.create()` 検証を巻き添えで消すリスク:** ステップ 4 で型注釈を `string` にする際、`UserId.create(input.actorUserId)`（domain import の `.create`）を消さない。消すのは `../dto/` の型 import と注釈のみ。
- **エイリアス衝突:** `IdentityUserId` / `AdminSettingsUserId` は domain 側の別 valueObject。維持する。DTO の `UserIdDTO` だけ消す。
- **型エラーの波及が広い:** 1 ブランド削除で 100+ 箇所が一度に赤くなる。dto 定義 → 射影 → usecase → presentation → tests の順で typecheck を回しながら段階的に潰す。
- **実行時挙動の不変性:** ブランドは全て erase されるため、テストが緑なら振る舞い不変を保証できる。

## テスト方針

- `pnpm typecheck` が網羅検証の主軸（残存ブランド参照・剥がし忘れを全検出）
- `pnpm lint:fix` で未使用 import 検出
- `pnpm test:unit && pnpm test:integration` で振る舞い不変を確認
- 動作確認は typecheck/test 中心。UI 変更はないためブラウザ検証は最小限（既存導線が壊れていないことの確認のみ）

## レビュー履歴

### 1周目（2視点並列）
**修正した点**:
- [要件 P-001] `dto/media.ts`・`dto/search.ts` が射影ファイルとして全ステップから漏れていた → ステップ1/2 の対象に明示追加。「7 ファイル」の誤記も修正。
- [アーキ P-001] export presentation チェーンが **domain ブランド** `ExportJobId`（`@/core/domain/export/valueObject`）を直接 import しており、ステップ7 の削除対象と ADR-002 が矛盾していた → ステップ7 を「DTO 由来のみ削除、export domain ブランド由来は残す」に修正。
- [アーキ P-002] `export/` ディレクトリ内で id 入力契約が DTO（`retryExportJob`）と domain（`getExportJob` 等）に分裂 → ADR-002 に「判定は宣言単位、ファイル/ディレクトリ単位の一括置換不可」を追記。

**取り込んだ改善提案**:
- [要件 S-002] ステップ6 の対象を「`input.X`（DTO id 入力）の `as string` に限定」し、`ContentHtml.create(... as string)` を対象外と明記。
- [要件 S-001] ステップ9 の JSDoc 更新対象に `dto/search.ts` を追加。
- [要件 S-003] `spec/usecases/index.md` の NoteRevisionId 非対称をステップ9 に補足。
- [要件 S-004] ステップ8 の件数を概算と明記。
- [アーキ S-001/S-003] ADR-002 に presentation domain ブランド除外、ADR-001 Consequences に export 不統一の残課題を追記。

**見送った提案**: なし（全提案を反映または注記）。

### 終了判定
両視点の問題点（要修正）は全て反映済み。残存ブロッカーなし。実装フェーズへ。
