# 実装計画 — Issue #473: DTO ブランド型を廃止しプリミティブ string に置き換える

**Issue:** #473
**作成日:** 2026-06-04
**複雑度:** 中〜大規模

---

## 目的

DTO 層が定義する独自ブランド型（`type UserId = string & { readonly __brand: "UserId" }` など 10 個）を**完全廃止してプリミティブ `string` に置き換える**。これにより `dto/` 射影の `as unknown as XId`、usecase 出力系のブランドキャスト、presentation/loader の `as unknown as string` 剥がしキャストが純減する。

ブランドの一生は「domain ブランド →（射影で付け替え）→ DTO ブランド →（loader で剥がし）→ string」の三段プランビングで、ランタイム効果ゼロ・型安全効果ほぼゼロ。domain ブランドは `string` のサブタイプなので、DTO フィールドを `string` にすれば `entity.id` がキャストなしで代入可能になり、橋渡しキャストが機械的に解消する。

inbound 境界の domain `XId.create()` 値検証は**維持**する（値の正しさは無傷）。

## スコープ

### 含まれるもの
- DTO ブランド定義 10 個の廃止（→ フィールドを直接 `string` に）
- `dto/` 射影 (a) の `as unknown as <DTObrand>` 41 箇所 → 素の代入
- usecase 出力系 (b) の DTO ブランドキャスト 25 箇所 → 素の代入
- usecase インラインで domain 値を **DTO フィールド（`string`）へ代入する `as unknown as string` 剥がし** → 素の代入。具体的には `getNoteDetail.ts:86`（`NoteSourceFileDTO.originalFileName` への代入。**Issue が「自然に解消される」と明記した起点例**）
- presentation/loader (c) の `as unknown as string` 剥がしキャスト削除（DTO フィールドを剥がしている箇所のみ。下記「含まれないもの」の domain entity 剥がしは除く）
- 単発 `as <DTObrand>` (c') 14 箇所削除／素代入
- DTO ブランドを参照するテスト 8 ファイルの import / フィクスチャキャスト更新
- `dto/index.ts` ほかのブランド規約 JSDoc 更新（設計判断の反転を明記）
- **正典 spec `spec/usecases/index.md`** のブランド型定義（9 型）を `string` ベースに更新

### 含まれないもの
- **domain 層のブランド・検証は一切触らない**（`unique symbol` ブランド、`XId.create()`、domain 単発キャスト `as <domainブランド>` 338 件、`as unknown as <domainブランド>` 75 件）
- usecase **入力**の domain ブランド型注釈・境界 `.create()` 検証（維持）
- `SessionToken`（意図的に非ブランドで既に `string`、据え置き）
- **intra-domain / 内部計算用の `as unknown as string` 剥がし（DTO フィールドではないので据え置き）。** DTO フィールド型を `string` にしても解消されない。対象:
  - `loaders.ts:444 found.entity.ownerId`（presentation で domain entity から剥がし）
  - `startExportJob.ts:54,57`（ファイル名生成用に `note.slug`/`note.id` を剥がし）
  - `runIngestionJob.ts:387,403,409,410`（Map キー・パス構築用に `dir.id`/`cursor.id`/`cursor.name`/`cursor.parentId` を剥がし）
  - `domain/export/service.ts:222,243,245,357`（純 intra-domain）
- 透過エイリアス（`type UserId = string`）を最終成果物に残すこと（移行中の一時足場としてのみ使用可）

## 実装ステップ

置換順序の原則: **先に定義を透過エイリアス `type XId = string` に一旦変える → typecheck を通す → 参照側を畳む → 最後に定義を削除しフィールドを直接 `string` に**。各段階で型が壊れず安全。エイリアスは移行中の一時状態で、最終的に消す。

### 1. DTO 定義を一時的に透過エイリアス化

- **対象ファイル:** `dto/identity.ts`(`UserId`,`MediaAssetId`), `dto/note.ts`(`NoteId`,`NoteRevisionId`), `dto/directory.ts`(`DirectoryId`), `dto/tag.ts`(`TagId`), `dto/publication.ts`(`ShareLinkId`), `dto/export.ts`(`ExportJobId`), `dto/view.ts`(`SavedViewId`), `dto/ingestion.ts`(`IngestionJobId`)
- **変更内容:** 各 `export type XId = string & { readonly __brand: "XId" }` を `export type XId = string` に変更
- **理由:** 参照名を生かしたまま型を `string` に潰すと、射影の `as unknown as XId` が string→string となり typecheck が通る。この時点で `pnpm typecheck` が green になることを確認。

### 2. dto/ 射影 (a) のキャストを素代入に

- **対象ファイル:** `dto/` 配下 41 箇所（`identity.ts` 6, `note.ts` 17, `directory.ts` 3, `tag.ts` 2, `publication.ts` 3, `export.ts` 2, `view.ts` 5, `ingestion.ts` 3, `media.ts` 2, `search.ts` 2）
- **変更内容:** `note.id as unknown as NoteId` → `note.id`、`.map((id) => id as unknown as TagId)` → `.map((id) => id)` 等すべて。`{ ...note.frontMatter } as FrontMatterDTO` 等の**非ブランド**キャストは対象外
- **理由:** domain ブランドは string サブタイプなので素代入可

### 3. usecase 出力系 (b) の DTO ブランドキャストを素代入に

- **対象ファイル:** `note/searchInternalLinkTargets.ts`, `note/view.ts`, `search/view.ts`, `tag/{renameTag,deleteTag,mergeTags}.ts`, `publication/getPublicNote.ts`, `identity/{logIn,signUp,adminSignUp,verifyEmail,verifyEmailChange,resetPassword}.ts`, `ingestion/{uploadFile,commitIngestionPreview}.ts`, `directory/deleteDirectory.ts`, `workers/dispatchDomainEvent.ts` ほか
- **変更内容:** キャスト先のローカル名が DTO import のものだけ素代入化。`as unknown as IngestionJobIdBrand`/`DomainUserId`/`ExportJobIdBrand` 等の**domain 入力キャスト 75 件は触らない**
- **あわせて対応:** usecase インラインで DTO を組み立てる際の **DTO フィールドへの `as unknown as string` 剥がし** も素代入化する。具体的には `getNoteDetail.ts:84-87`（`NoteSourceFileDTO` 構築。`mediaId` のブランドキャストと `originalFileName` の string 剥がしの両方）。**Issue の起点例**であり、ここを必ず潰す。**内部計算用の `startExportJob.ts`/`runIngestionJob.ts`/`domain/export/service.ts` の string 剥がしは「含まれないもの」のとおり触らない**
- **理由:** 出力契約が `string` になればキャスト不要。判別は import 元・代入先（DTO フィールドか内部変数か）で行う

### 4. presentation/loader (c)(c') のキャスト削除

- **対象ファイル（網羅手順）:** presentation 非テストの `as unknown as string` 剥がしは ~101 件と広範（`components/note/{loaders.ts,actions.ts,directoryTree.ts}`, `note/detail/*.tsx`, `note/history/*.tsx`, `note/list/*.tsx`, `note/editor/*`, `publication/PublishSettings/action.ts`, `trash/`, `directory/`, `view/`, `media/`, `ingestion/`, `tag/actions.ts`, `admin/{Jobs,UsersTable}/action.ts`, `identity/ProfileForm/action.ts`, `routes/_app/notes/**` 等）。**個別列挙に頼らず `grep -rn "as unknown as string" app/components app/routes` で全件洗い出し、`loaders.ts:444` 以外を畳む**
- **変更内容:**
  - (c) presentation の `as unknown as string` 削除（**DTO フィールドを剥がしている箇所のみ**）。**例外: `loaders.ts:444 found.entity.ownerId as unknown as string` は domain entity からの剥がしなので残す**
  - (c') 単発 `as <DTObrand>` 14 箇所を削除／素代入
  - presentation の usecase **入力**用 `actor.id as unknown as UserId`（DTO input へ渡す）は input 型が `string` になるので素代入に畳める
  - **間接キャスト経路①: ヘルパー関数。** `tag/actions.ts:17-19`・`ingestion/actions.ts:25` の `const toDtoUserId = (id: DomainUserId): UserIdDTO => id as unknown as UserIdDTO;`（計 13 呼び出し: tag 4・ingestion 9）。`UserIdDTO` が `string` 化すると恒等関数に縮退する。**ヘルパー定義を削除し、呼び出しを `user.id` 直書きにインライン化**する（lint:fix は関数本体を消さないので手当てが必須）
  - **間接キャスト経路②: `Parameters<typeof ...>[0]["input"][...]` 型インデックス。** `tag/actions.ts:51,95` 等の `data.tagId as unknown as Parameters<typeof module.renameTag>[0]["input"]["tagId"]`。DTO 入力型へ間接解決されるためブランド名が出ず name-based 検出を逃れる。input 型が `string` 化すると string→string の冗長キャストになるが typecheck は通ってしまう。**`grep "as unknown as Parameters<typeof"` で洗い出して素代入に畳む**
  - **据え置き:** `as unknown as DomainNoteId`/`DomainUserId` 等の presentation→domain inbound 単発 domain キャスト
- **理由:** DTO 型が `string` になれば剥がし不要。ヘルパー・型インデックス経由の間接キャストは typecheck で検出できないため明示 grep で潰す

### 5. テスト 8 ファイルの DTO ブランド参照を更新

- **対象ファイル:** `note/detail/__tests__/{NoteActions,NoteDetail,NoteMetaPanel}.test.tsx`, `note/history/__tests__/{NoteHistoryList,NoteRevisionDetail}.test.tsx`, `note/editor/__tests__/{internalLinkSuggest,internalLinkSuggestPopup}.test.*`, `note/list/__tests__/NotePickerDialog.test.tsx`
- **変更内容:** `import type { NoteId }` 等の DTO ブランド import を削除し、`as NoteId`/`as unknown as NoteId` フィクスチャキャストをプレーン string 化。`BacklinkDTO` 等オブジェクト型 import は残す
- **理由:** 型が `string` になれば冗長。挙動は不変

### 6. dto/ 定義のエイリアス削除 → フィールドを直接 string に

- **対象ファイル:** ステップ1 の 10 定義＋クロス import する各 DTO ファイル
- **変更内容:** `type XId = string` 定義を**削除**し、DTO 型フィールド（`id: UserId` → `id: string`, `tagIds: readonly TagId[]` → `readonly string[]` 等）と `import type { XId }`（DTO 間クロス import 含む）を削除。`OwnedSearchHitDTO`/`ViewQueryDTO`/`SavedViewDTO`/`NoteSourceFileDTO` 等の派生型も `string` に。usecase/presentation 側で残る型注釈エイリアス（`UserId as UserIdDTO` 等）も `string` に畳んで import 削除
- **理由:** 「守られているフリ」を排除し見た目を `string` に統一（Issue 方針どおりエイリアスを残さない）

### 7. ブランド規約 JSDoc / 正典 spec の更新

- **対象ファイル:** `dto/index.ts` の "Brand convention" 段落, `dto/identity.ts` の "Branded string ids…" 段落, `dto/search.ts` の "carries the DTO `DirectoryId` brand…" 説明, **`spec/usecases/index.md`（25-40 行のブランド型定義 9 個）**
- **変更内容:** 設計判断の反転（DTO はブランドを持たずプリミティブ `string`／値検証は inbound `XId.create()` のみ／取り違え防止は意図的に放棄）を明記。`spec/usecases/index.md` の `type XId = string & { readonly __brand: 'XId' }` 定義を `type XId = string` ベースに改める。`dto/index.ts` JSDoc が `spec/usecases/index.md` を「canonical definitions」として参照しているため、正典側を更新しないと実装と乖離する。`SessionToken` の記述は据え置き
- **理由:** ドキュメント（正典 spec 含む）と実装の整合

### 8. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。lint:fix が冗長キャスト残・未使用 import を機械掃除。最後に `pnpm test` で 8 テストファイル含むユニットを green 確認
- **消し漏れ検出（lint:fix に頼らない明示確認）:** 純減が未達でも typecheck は緑のままなので、以下を grep で確認し残骸を潰す:
  - `grep -rn "as unknown as Parameters<typeof" app/`（間接キャスト経路②の残り）
  - `grep -rn "toDtoUserId" app/`（ヘルパーが残っていないか）
  - `grep -rn "as unknown as string" app/`（DTO フィールド剥がしの消し漏れ。残ってよいのは「含まれないもの」の intra-domain 11 件のみ）

## 設計判断

- **置換は import 元判定が必須。** `NoteId`/`UserId` 等は domain と DTO で同名・同構造。一括 `sed` は 338 件の domain ブランドキャストを破壊する。ファイル単位の手当て＋ typecheck ループを推奨（詳細は adr.md ADR-001）
- **移行中の透過エイリアスは許容、最終成果物に残さない**（adr.md ADR-002）

## リスクと注意点

- **domain / DTO 取り違え（最大リスク）:** `as <Brand>` 単発 352 件中 338 が domain・14 が DTO。`as unknown as <Brand>` 100 件中 75 が domain・25 が DTO。誤って消すと domain 型安全／値検証が壊れる。**必ず import 元で判定**
- **`as unknown as string` の剥がしは DTO フィールド代入か内部計算かで分類が必要:** presentation 側の DTO フィールド剥がしは削除対象だが、app/core（非テスト）には domain entity / 内部計算用の剥がしが 11 件あり、うち DTO フィールド代入は `getNoteDetail.ts:86` の 1 件のみ（要削除）。残り（`startExportJob.ts`/`runIngestionJob.ts`/`domain/export/service.ts`、presentation の `loaders.ts:444`）は据え置き。**代入先で判定**し、内部計算用を誤って消さない
- **置換漏れ:** エイリアス（`UserId as UserIdDTO` 等）を見落とすと定義削除時に未解決参照になる。ステップ6 で typecheck で洗い出す
- **DTO 間クロス import:** `note.ts` のブランドを `publication/export/view/search/ingestion.ts` が、`identity.ts` を `directory/tag/media/view/search/export/ingestion.ts` が import。定義削除時に全 `import type` 削除が必要
- **lint の冗長キャスト警告:** 中間状態で string→string キャストが残ると Biome が警告し得る。各ステップ後ではなく一連完了後に `lint:fix` をかける運用に

## テスト方針

- 中心は `pnpm typecheck`（`tsgo`）。各ステップ後にこまめに回し、特に定義削除（ステップ6）直後の未解決参照を確実に検出する
- `pnpm lint:fix && pnpm format`（Biome）で冗長キャスト・未使用 import を機械掃除
- `pnpm test`（unit + integration）。挙動はランタイム不変（全キャストは erase）なので既存テストは無改変で通るはず。DTO ブランドを import していた 8 テストファイルのみ import/フィクスチャ更新が必要

## レビュー履歴

### 1周目

**修正した点**:
- **[P-001/両視点]** 「`as unknown as string` の domain 剥がしは `loaders.ts:444` の1件だけ」という事実誤認を修正。実コードでは app/core（非テスト）に 11 件の domain 剥がしがあり、DTO フィールド代入は `getNoteDetail.ts:86` のみ（要削除）、残りは内部計算用で据え置きと分類し直した。スコープ「含まれないもの」に intra-domain 剥がし（`startExportJob.ts`/`runIngestionJob.ts`/`domain/export/service.ts`）を明記。
- **[P-002/両視点]** Issue が「自然に解消される」と明記した起点キャスト `getNoteDetail.ts:86` がステップに未明示だった。Step 3 に「DTO フィールドへの `as unknown as string` 剥がし」を追加し、`getNoteDetail.ts:84-87` を対象に列挙。
- **[P-001/要件視点]** 正典 spec `spec/usecases/index.md`（25-40 行のブランド型定義 9 個）が JSDoc 更新（Step 7）の対象から漏れていた。`dto/index.ts` JSDoc がこれを canonical として参照しているため、Step 7 の対象に追加。

**取り込んだ改善提案**:
- **[S-002/アーキ視点]** 同名 domain ブランドが**値 import**（VO 構築子、`import { UserId as ... }`）でも入ってくる点を ADR-001 に追記。名前ベース codemod の誤マッチ防止根拠を明確化。
- **[S-001/アーキ視点]** 透過エイリアス足場が `readonly XId[]`/`Map<XId,...>`/optional も自動追従する点は ADR-002・テスト方針で既に言及済みのため軽微補強にとどめた。

**見送った提案とその理由**:
- **[S-002/要件視点]** Step 2 の per-file 件数（単発 `as` 含む合算）と純 `as unknown as` 件数のズレ — 総数 41 は正確で戦略に影響せず、実装は「各ファイルで DTO ブランドキャストを全て潰す」が要件のため、件数は参考値として据え置き。

### 2周目

**修正した点**:
- **[P-001/アーキ視点]** `toDtoUserId` ヘルパー関数（`tag/actions.ts:17-19`・`ingestion/actions.ts:25`、計 13 呼び出し）が間接キャスト経路として全ステップから漏れていた。Step 4 に「間接キャスト経路①: ヘルパー定義削除＋インライン化」を追加。
- **[P-002/アーキ視点]** `Parameters<typeof ...>[0]["input"][...]` 型インデックス経由の間接キャストがブランド名を出さず name-based 検出を逃れ、typecheck も string→string を許すため消し漏れに気づけない問題。Step 4 に「間接キャスト経路②」、Step 8 に明示 grep 検証を追加。
- **[S-001/アーキ視点]** Step 4 のファイルリストが「ほか」止まりで最大ボリュームの ~101 件が曖昧だった。`grep -rn "as unknown as string" app/components app/routes` で全件洗い出す網羅手順に補強。

**取り込んだ改善提案**:
- **[S-001/要件視点]** `NoteRevisionId` が spec 非掲載・DTO 専用で見落とされやすい点 → Step 6 は「10 個一括」で既にカバーしているため軽微補強にとどめた。
- **[S-002/アーキ視点]** `directory/actions.ts` 等の domain 入力剥がし（元から冗長）と DTO 入力剥がし（本 Issue で冗長化）の理由の違いは、どちらも「`as unknown as string` 削除」で同じ掃除対象になるため Step 8 の grep 網羅手順で吸収。

**見送った提案とその理由**:
- なし（要件視点は「問題点ゼロ」、アーキ視点の指摘は全て反映または網羅手順で吸収）

両視点とも、間接キャスト経路の反映により計画は実行可能と判断。要件カバレッジ視点は 2周目で問題点ゼロ。
