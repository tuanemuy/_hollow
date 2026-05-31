# ADR — Issue #380: ノート詳細の DTO 拡張

## ADR-001: 構造化パスは DTO 追加で表現する（置換しない）

### Status
Proposed

### Context
パンくず中間セグメントをリンク化するには各セグメントの `id` が要る。現状 `getNoteDetail` は `directoryPath: string`（slug 連結のフラット文字列）のみを返す。選択肢: (A) `directoryPath` を `{id,name}[]` に置換、(B) `directoryPath` を残し `directorySegments: {id,name}[]` を追加。

### Decision
(B) を採用。`directoryPath`（slug パス）は将来の URL 生成・表示など別用途で意味が異なるため残す。`directorySegments` を新設し、presentation（`NoteBreadcrumb`）は構造化データのみ使う。

### Consequences
- 良い点: 非 UI consumer へのゼロ影響。slug パスと表示用構造化パスの役割分離が明確。
- トレードオフ: DTO にフィールドが1つ増える。`NoteBreadcrumb` は `directoryPath`/`directoryId` props を捨て `segments` に一本化する。

---

## ADR-002: 構造化パス生成は `DirectoryService.computeSegments` を新設する

### Status
Proposed

### Context
`DirectoryService.computePath` は `findAncestors` を辿り slug を連結して `DirectoryPath`（文字列）を返す。構造化パス `{id,name}[]` を得る方法として、(A) `computePath` の戻りを構造化に変更、(B) 別メソッド `computeSegments` を追加、がある。

### Decision
(B) を採用。`computePath` の戻り型を変えると slug パスの全 consumer（`buildNoteSnapshot` 等）に破壊的に波及する。`computeSegments` を追加し、`findAncestors`（root-first・自身除外）の `isChild` 祖先 + `dir` 自身を root→leaf 順に `{ id, name }` で返す。root の除外は **`isChild` ガード（`parentId !== null`）** で行う — `DirectoryName.forRoot()` は空文字とは限らないため name の空判定では判別できない。root 直下ノートは祖先に `isChild` が無く `dir` 自身が root なので空配列になる。

### Consequences
- 良い点: `computePath` を非破壊に保ちつつ構造化パスを供給。クエリは `findAncestors` 1 回で N+1 なし。
- トレードオフ: `computePath` と `computeSegments` で findAncestors 走査ロジックが一部重複する（戻り値が slug 文字列 vs 構造化で別物のため許容）。

---

## ADR-003: バックリンク抜粋は本文先頭スライスで生成する

### Status
Proposed

### Context
Issue は「参照箇所周辺のプレーンテキスト」を理想として挙げる。厳密に参照箇所周辺を狙うには referrer 本文 HTML 内の `[[...]]` トークン位置を特定する必要があるが、`toPlainText` 後はトークン位置が失われ、HTML 側でのオフセット計算はサニタイズ済み構造に依存して脆い。

### Decision
本文先頭スライス `container.htmlSanitizer.toPlainText(referrer.contentHtml).slice(0, 200)` を採用し、長さは既存 excerpt（`listNotesByOwner` / `listNotesInDirectory` の `slice(0, 200)`）に揃える（一貫性優先）。slice 結果が空文字のときは `.length > 0 ? snippet : null` で明示的に `null` に畳む（`toPlainText` は空本文で `""` を返しうる）。`NoteMetaPanel` 側も「非 null かつ非空」で出し分け、二重防御とする。「参照箇所周辺」は本 Issue のスコープに対し過剰実装でありフォローアップ余地として割り切る。

### Consequences
- 良い点: 既存パターンと一貫。実装が単純で脆くない。追加 I/O なし（referrer は本文込みで取得済み）。
- トレードオフ: 参照箇所そのものを抜粋に含められない場合がある。理想には一歩届かないが Issue 範囲内の妥当な落とし所。

---

## ADR-004: `getBacklinks` でも同じ snippet 生成を行う

### Status
Proposed

### Context
`BacklinkDTO` は `getNoteDetail` と `getBacklinks` で共有される。`toBacklink` に snippet を足すと両者が追従する。`getBacklinks` で snippet を生成するか `null` 固定にするか判断が要る。

### Decision
`getBacklinks` でも `getNoteDetail` と同じ snippet 生成を行う。referrer は本文込みの `Note` で取得済みのため追加クエリは発生しない。`null` 固定にすると同一 DTO が呼び元で挙動差を持ち混乱を招く。

### Consequences
- 良い点: 同一 DTO の意味が呼び元に依存しない。一貫性が保たれる。
- トレードオフ: `getBacklinks` の現 consumer が snippet を使わない場合でも生成コスト（CPU のみ）がかかるが軽微。
