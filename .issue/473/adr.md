# ADR — Issue #473: DTO ブランド型を廃止しプリミティブ string に置き換える

## ADR-001: 一括置換ではなく import 元判定でファイル単位置換する

### Status
Proposed

### Context
DTO ブランド（`UserId`/`NoteId`/`DirectoryId`/`TagId`/`MediaAssetId`/`NoteRevisionId`/`ExportJobId`/`IngestionJobId` 等）は domain 層にも**同名・同構造**（`string & {…}`）のブランドが存在する。`as <Brand>` 単発は 352 件中 338 が domain・14 が DTO、`as unknown as <Brand>` は 100 件中 75 が domain・25 が DTO。`sed` などのテキスト一括置換では両者を区別できず、domain ブランドキャスト（値検証の足場）を破壊する。

### Decision
codemod を書くなら import ブロックを解析し「その識別子が `@/core/application/dto/*` 由来のときだけ置換」する import-aware 方式にする。安全のため本リファクタでは**ファイル単位の手当て＋各ステップ後の `pnpm typecheck` ループ**で進める。`as unknown as string` の剥がしキャストも、対象がDTOフィールドか domain entity かを参照元で判定する（例外: `loaders.ts:444` は domain entity 剥がしなので据え置き）。

注意: 同名 domain ブランドは**値 import**（VO 構築子）でも入ってくる。例 `getEffectiveIngestionPrompts.ts` / `updateProfile.ts` の `import { UserId as ... }`（`import type` ではない）。名前ベース codemod が誤マッチする典型なので、import 元判定では値 import も対象に含めて除外する。

### Consequences
- 良い点: domain 層の型安全・値検証を一切壊さずに DTO 側だけを純減できる
- トレードオフ: 機械一括より手間がかかる。typecheck を細かく回すことで漏れを担保する

---

## ADR-002: 移行中の透過エイリアスは許容、最終成果物に残さない

### Status
Proposed

### Context
ブランド定義をいきなり削除すると参照側（~24 ファイルの型注釈・エイリアス）が未解決になり、typecheck が大量に壊れて段階的検証ができない。一方 Issue は透過エイリアス（`type UserId = string`）の**常設**を「守られているフリで読み手を欺く」として却下している。

### Decision
移行の足場として、まず定義を `type XId = string`（透過エイリアス）に変えて typecheck を green に保ちつつ参照側を畳む。すべて畳み終えたらエイリアス定義自体を削除し、DTO フィールドを直接 `string` に書き換える。エイリアスは最終成果物には一切残さない。

### Consequences
- 良い点: 各段階で型が壊れず、安全に段階的検証できる
- トレードオフ: 中間状態で string→string の冗長キャストが一時的に残る。一連完了後に `lint:fix` で掃除する

---

## ADR-003: `Parameters<typeof X>[0]["input"][...]` 経由の間接キャストは解決先の input が domain か DTO かで扱いが割れる（実装時に判明）

### Status
Accepted

### Context
Step 4 で `as unknown as Parameters<typeof usecase>[0]["input"]["xId"]` 型インデックス経由の間接キャストを素代入に畳む方針だったが、解決先の usecase input が **DTO 型（string 化済み）とは限らない**ことが実装中に判明した。`renameTag`/`mergeTags`/`deleteTag`/`commitIngestionPreview` 等は input id が `../dto/*`（DTO=string）だが、`getNoteDetail`/`listShareLinks` は input id が `@/core/domain/*`（domain VO ブランド）だった。後者まで一律に素代入すると `string` → domain ブランドの代入で typecheck が割れる。

### Decision
型インデックスキャストを一律 grep で剥がしたうえで、typecheck の代入エラーを頼りに **domain input へ渡している箇所だけ** presentation→domain inbound の単発キャスト（`as unknown as DomainUserId` / `DomainNoteId`）に**復元**した。具体的には `components/note/loaders.ts` の `loadNoteDetail` / `listShareLinks` ローダ（および後者内の `publicationStateRepository.findById`）。これは既存の同ファイル内 inbound キャスト（ADR-001 の「presentation→domain inbound は据え置き」）と同じ扱い。

### Consequences
- 良い点: DTO 入力の冗長キャストは純減しつつ、domain 入力の値検証境界は維持される
- トレードオフ: 型インデックスは name-based では domain/DTO を判別できないため、typecheck の代入エラーを判別シグナルとして使う必要がある

---

## ADR-004: 射影の冗長 identity map `.map((id) => id)` は配列ごと素代入に畳む

### Status
Accepted

### Context
ブランドキャストを剥がした結果 `note.tagIds.map((id) => id)` のような恒等 map が残った。Biome はこれをエラー扱いしないため `lint:fix` では消えない。domain ブランド配列（`readonly TagId[]` 等）は readonly かつ要素が string サブタイプなので `readonly string[]` の DTO フィールドへ配列ごと直接代入できる。

### Decision
`x.map((id) => id)` を `x` に畳んだ（dto/note・view・export・ingestion、note/view、directory/deleteDirectory、components の listSelectors・wire）。typecheck で代入互換を確認済み。

### Consequences
- 良い点: 射影コードがさらに簡潔になる（Issue の「純減」目的に合致）
- トレードオフ: なし（ランタイム不変）

---
