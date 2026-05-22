# 実装計画 — Issue #86: unify branded → string cast responsibility across DTO layer

**Issue:** #86
**作成日:** 2026-05-22
**複雑度:** 小規模

---

## 目的

`OwnedSearchHitDTO` の `directoryId` / `slug` フィールドだけが「application 層で branded → plain `string` に flatten される」例外形になっており、DTO 層の規約が経路ごとに揺れている。Issue 提案#1（branded 型を DTO 上に残す）を採用し、DTO 層の規約を一本化する。

## 採用方針: 提案#1（branded 型を DTO に残す）

`app/core/application/dto/index.ts` のヘッダー JSDoc が canonical 規約を明文化している:

> DTO id brands use `string & { readonly __brand: 'XId' }`. ... projections bridge with `as unknown as` casts at exactly one boundary — `to{Entity}DTO` — so call sites never need to know about the discrepancy.

つまり「DTO は branded を保持し、`to{Entity}DTO` だけが brand-bridge の責務を持つ」が文書化された規約。既存の `NoteDTO` / `NoteListItemDTO` / `DirectoryDTO` / `SearchHitDTO` はすべてこの規約に従っており、`OwnedSearchHitDTO` だけが逸脱している。

逸脱を解消する方向（=#1）で統一する。

## スコープ

### 含まれるもの

- `OwnedSearchHitDTO.directoryId` を `string` → `DirectoryId`（DTO brand）に変更
- `OwnedSearchHitDTO` の JSDoc を「branded id を保持、`slug` は他 DTO と同じく plain `string`」と更新
- `toOwnedSearchHitView` の `directoryId` cast を `as unknown as string` → `as unknown as DirectoryId` に修正
- `toOwnedSearchHitView` の `slug as unknown as string` を撤廃（`toNoteDTO` 同様、`NoteSlug` は構造的に `string` のサブタイプなので cast 不要）
- `loaders.ts` の search 経路で `hit.directoryId` を string に剥がす cast を 1 箇所追加し、filter 経路（line 261）と同じイディオムに揃える

### 含まれないもの

- `OwnedSearchHitDTO.slug` の型変更（既存規約: `NoteListItemDTO.slug: string` に揃っており、`note.slug` は structural に `string` なので brand を載せる積極理由がない）
- `loaders.ts` の `OwnedNoteFilterItem` / `OwnedNoteSearchItem` の型変更（presentation 内部の display shape は別議論）
- 他 DTO の規約変更（`NoteDTO` 等は既に規約準拠）
- `searchPublicNotes` 側（`SearchHitDTO` 経路）の変更（既に規約準拠）

## 実装ステップ

### 1. `OwnedSearchHitDTO` の型を branded に修正

- **対象ファイル:** `app/core/application/dto/search.ts`
- **変更内容:**
  - `DirectoryId` を `./directory` から import
  - `OwnedSearchHitDTO.directoryId: string` → `directoryId: DirectoryId`
  - JSDoc から「intentionally flattened to plain `string` at the DTO boundary to match the existing `loaders.ts` convention」の段落を削除し、「branded id は他 DTO と同様に保持し、`slug` は `NoteListItemDTO` 同様 plain `string`（`NoteSlug` は構造的に `string` のサブタイプなので brand を載せない）」と差し替え
- **理由:** `dto/index.ts` の canonical 規約に揃え、DTO 層全体で「branded id を保持」という単一規約に統一する

### 2. `toOwnedSearchHitView` の brand-bridge を `to{Entity}DTO` 規約に揃える

- **対象ファイル:** `app/core/application/search/view.ts`
- **変更内容:**
  - `DirectoryId` を `../dto/search`（再 export 経由）または `../dto/directory` から import
  - `directoryId: note.directoryId as unknown as string` → `directoryId: note.directoryId as unknown as DirectoryId`
  - `slug: note.slug as unknown as string` → `slug: note.slug`（`NoteSlug ⊆ string` のため cast 不要、`toNoteDTO` 同様）
- **理由:** brand-bridge を `to{Entity}DTO` の単一責務に集約する。`slug` の冗長 cast を撤廃して `toNoteDTO` のスタイルに揃える

### 3. `loaders.ts` 検索経路で brand を string に剥がす cast を追加

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:**
  - `directoryId: hit.directoryId` → `directoryId: hit.directoryId as unknown as string`（line 198）
  - `slug: hit.slug` は変更なし（DTO は plain string のまま）
- **理由:** `OwnedNoteSearchItem.directoryId: string` への代入で、filter 経路（line 261）と同じイディオム（`as unknown as string`）に揃える。これにより「brand を剥がす責務は presentation 層」というルールが filter / search の両経路で一貫する

## 設計判断

- **slug は branded 化しない**: `NoteSlug = string & { brand }` は構造的に `string` のサブタイプであり、`note.slug` を `string` 型のフィールドに代入するのに cast は不要。既存の `NoteListItemDTO.slug` / `DirectoryDTO.slug` / `NoteDTO.slug` がすべて `string` で統一されており、`OwnedSearchHitDTO.slug` だけ branded に変える積極理由がない。`directoryId` のみ branded 化することで「DTO id は branded、slug 等の自由文字列は plain string」という規約を強化する。
- **`loaders.ts` での cast の必要性**: TypeScript 上は `string & { __brand }` は `string` に構造的代入可能だが、既存 loaders.ts の filter 経路は明示的な `as unknown as string` cast を採用している。一貫性のため search 経路も同じイディオムに揃える（cast の必要性自体の見直しは本 Issue のスコープ外）。

## リスクと注意点

- **既存テストへの影響**: `OwnedSearchHitDTO` を扱う test fixture が `directoryId: "..."` のような文字列リテラル代入をしている場合、branded 型への代入で TS エラーになる可能性がある。`as unknown as DirectoryId` を追加するか、`DirectoryId.create(...)` 同等のヘルパで生成する必要がある。
- **影響範囲が型のみ**: ランタイム動作には一切影響しない（値は同じ string）。`pnpm typecheck` の通過が事実上の検証になる。
- **`searchPublicNotes` への波及なし**: `OwnedSearchHitDTO` は `searchOwnNotes` のみが返す。`searchPublicNotes` は `SearchHitDTO` 単体を返しており、本変更の影響を受けない。

## テスト方針

- `pnpm typecheck` で型エラーなし
- `pnpm test:unit` の既存テストが通る（特に `searchOwnNotes.test.ts`）
- `pnpm lint:fix && pnpm format` で lint/format 通る
- ブラウザ動作確認: ホーム画面で keyword 検索を実行し、検索結果のディレクトリリンク・slug が正しく表示されることを確認（型変更のみで挙動変化はない想定）
