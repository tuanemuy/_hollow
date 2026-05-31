# ADR — Issue #379: ゴミ箱(trashed)ノートの詳細ページがエラーになり表示できない

## ADR-001: trashed 由来の share-link エラーを presentation 層で吸収する

### Status
Accepted

### Context

`NoteDetail` の `Promise.all` 内で呼ぶ `loadPublishStateForNote` → `listShareLinks` が trashed ノートに対し `BusinessRuleError(NoteErrorCode.Trashed)` を throw し、ページ全体がエラー境界に落ちる。

修正方針の候補:

1. **application 層の `listShareLinks` を trashed でも空リストを返すよう変更する。** ただし `issueShareLink` / `changePublicationVisibility` と同じ trashed ガード（`NoteErrorCode.Trashed`）を一貫して持つ設計を崩す。owner 向けの share-link 一覧を trashed で出さないのは意図的な application 仕様であり、変更は契約変更になる。
2. **`NoteDetail` で note.status を先に取得し、trashed なら `loadPublishStateForNote` をスキップする。** status を得るために `loadNoteDetail` を先に await する必要があり、active ノート（ホットパス）で `loadPublishStateForNote` が detail 完了まで直列化され、詳細ページのレイテンシが回帰する。
3. **`NoteDetail` で `loadPublishStateForNote` の promise 単体に `.catch` を付け、trashed 由来の `BusinessRuleError` だけを安全なデフォルトに吸収する。**

### Decision

候補 3 を採用する。

- application 層 `listShareLinks` の throw は仕様として維持する（候補 1 を退ける）。
- `Promise.all` 全体を `try/catch` で包むと他のローダー結果も失うため、`loadPublishStateForNote(...)` の promise 単体に `.catch` を付ける。`isBusinessRuleError(e) && e.code === NoteErrorCode.Trashed` のときのみ `{ visibility: "private", publishedAt: null, links: [] }` を返し、それ以外は再 throw する。
- active ノートの並列ロードは完全に維持される（候補 2 のレイテンシ回帰を回避）。
- フォールバック値は `handleNoteTrashedEvent` が trashed 化時に publication を `private`・share link を失効させる実データと一致する。

前例として `app/components/export/ExportJobDetail/Page.tsx` が `isBusinessRuleError(error) && error.code === ...` で特定の `BusinessRuleError` を presentation 層でハンドリングしており、本パターンはプロジェクトの確立済みの作法に沿う。

### Consequences

- 良い点: application 層の契約を変えずに presentation 層の表示責務として閉じる。active ノートのホットパスを犠牲にしない。trashed の実データと表示が一致する。
- トレードオフ: presentation 層で error の `code` に依存した分岐が1箇所増える。ただし吸収対象を `NoteErrorCode.Trashed` のコード一致に厳格に限定するため、他の障害を握りつぶすリスクはない。
