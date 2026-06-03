# ADR — Issue #178: tighten NoteRepository filter-sharing contract at the type level

## ADR-001: filter 共有 3 兄弟のフィルタ契約を名前付き型 `NoteOwnerFilters` として抽出し SSOT 化

### Status
Accepted

### Context

PR #176 (Issue #173) のレビュー指摘 **[A-W-003]** のフォローアップ。`NoteRepository` の filter 共有 3 兄弟 (`findByOwner` / `countByOwner` / `listWithCount`) は同じフィルタフィールド集合を扱う規約を持つが、現状この規約は **JSDoc 言及**と **`NoteOwnerCountOpts = Pick<NoteOwnerListOpts, ...>`** の Pick 型関係でしか保証されていない。

`Pick` はキーを手書き列挙するため、`NoteOwnerListOpts` に新フィルタを追加したとき Pick 側へ足し忘れると silent に通過しうる。実際 #392 で `directoryIds` が追加された際、`Pick` のキー列挙にも手で追加する必要があった（＝強制されていない証拠）。

選択肢:
- **(A) 型関係の反転**: `NoteOwnerListOpts = NoteOwnerCountOpts & PaginationOpts`
- **(B) 名前付き中間型の抽出**: `type NoteOwnerFilters = { status?; ... }` を SSOT とし、ListOpts/CountOpts 両方がこれを導出
- **(C) Branded type**: 「filter contract に従う opts」を型レベルで制約

### Decision

**(B) を採用**。具体的には:

1. フィルタフィールド集合を独立 export 型 `NoteOwnerFilters` として抽出。フィルタ意味論の JSDoc（`visibility` 3 状態 / `referencingNoteId` / `directoryIds` サブツリー等）もここに集約する。
2. `NoteOwnerListOpts = NoteListOpts & NoteOwnerFilters` で導出。
3. `NoteOwnerCountOpts = NoteOwnerFilters`（型エイリアス）で導出し、`Pick` のキー列挙を完全廃止。
4. 3 兄弟メソッドの JSDoc は手書きフィールド列挙をやめ `{@link NoteOwnerFilters}` 参照に統一。

これにより、フィルタ追加は `NoteOwnerFilters` 1 箇所への追記で list/count 両方へ自動反映され、漏れが構造的に発生不能になる。

### Consequences

- 良い点:
  - フィルタ契約に「`NoteOwnerFilters`」という名前と単一定義（SSOT）を与え、`Pick` のキー列挙（drift 源）を構造的に排除
  - フィルタ追加時の count 側手動同期が不要に（`directoryIds` で発生した実害を恒久解消）
  - JSDoc のフィルタ意味論を 1 箇所に集約。3 兄弟は `{@link NoteOwnerFilters}` を参照するだけになり、列挙漏れ（`listWithCount` JSDoc に `directoryIds` が無かった等）も解消
  - domain port 層の純粋性を保持（型定義のみ、ランタイムコードなし）
  - 実行時挙動ゼロ変更

- トレードオフ:
  - 型エイリアスが 1 つ増える（が、これは「フィルタ契約」という概念を型として可視化する正の効果）

### 却下した選択肢

- **(A) 型関係の反転**: 「count 用」と名のついた `NoteOwnerCountOpts` を「フィルタ契約の本体」に流用するのは命名と責務の逆転。`PaginationOpts` を切り出すと既存 `NoteListOpts`（`findByDirectory` / `findReferrers` も使う共有型）と二重定義になりかねない。
- **(C) Branded type**: brand は値の構築点でのタグ付けが必要だが、これらは純粋なデータ opts（VO ではない）で構築点が分散している（usecase / domain service / test）。ランタイムのタグ付けか `as` キャストを各構築点に強いるのは domain port 層への不要な儀式であり、フィールド集合共有という問題に対して過剰。

### 補足: `NoteOwnerCountOpts` をエイリアスとして残す理由

`NoteOwnerCountOpts` を消して `NoteOwnerFilters` に統一すると、`countByOwner` のシグネチャ・呼び出し側・テスト fake の import 名（6 ファイル）が波及変更される。エイリアスとして残せば**消費側ゼロ変更**で済み、変更を port 層に閉じ込められる。「count opts」という意味ラベルは `countByOwner` の JSDoc・シグネチャで生きている。

### 補足: `exactOptionalPropertyTypes` 制約

tsconfig で `exactOptionalPropertyTypes: true` が有効。中間型 `NoteOwnerFilters` でも各フィールドの `?:` optional 修飾をそのまま保持する必要がある（intersection が optional 性を保存することを前提に設計）。構造が崩れれば消費 6 ファイルのいずれかで型エラーになり、`pnpm typecheck` が検出する。

### Follow-up 候補

- 横展開は **現時点では不要**。実装時に他 port を精査した結果、「filter opts を共有する `findBy*` + `countBy*`（+ `listWithCount`）兄弟」パターンは現状 `NoteRepository` 固有であることを確認した:
  - `media` / `ingestion` / `tag` / `export` の各リポジトリは `findByOwner(opts: *ListOpts)` を持つが、filter opts を共有するペアの `countBy*` を持たない（単一 `ListOpts` のみ）
  - `shareLinkRepository.countByNoteId(noteId, includeRevoked)` / `noteRevisionRepository.countByNoteId(noteId)` の count は filter opts を取らない
  - したがって今回の `Pick` drift 問題に相当する重複は他 port に存在せず、横展開 Issue を起票しても対象がない（Issue #178 本文の「tag/media/ingestion にも類似パターンがある」は精査前の見立てで、実コードとは一致しなかった）
- 将来、他リポジトリで「filter opts を共有する list/count ペア」が新規に発生したら、同じ `*Filters` 中間型抽出パターンで対応する（条件付きフォローアップ）
