# ADR — Issue #496: loader が domain repository を直接叩いている箇所を読み取り usecase 経由に整理する

## ADR-001: publication state 読み取り usecase `getPublicationState` の新設

### Status

Accepted

### Context

`loadPublishStateForNote`（`app/components/note/loaders.ts`）は publication state を `publicationStateRepository.findById(args.noteId as Parameters<typeof publicationStateRepository.findById>[0])` で domain repository から直読みしており、presentation → domain の直接結合と `string → ブランド` 橋渡しキャストが presentation 層に残っていた（#489 ADR-003 でフォローアップ対象として記録）。

選択肢:
- (A) publication state 読み取り usecase を新設し、id 橋渡しを usecase 内に閉じ込める
- (B) loader 側の `Parameters<>` キャストを `.create()` 検証へ置換（不正 id 時の挙動が変わりうる）

### Decision

(A) を採用。`getPublicationState` を `app/core/application/publication/` に新設する。

- Input: `Readonly<{ actorUserId: string; noteId: string }>`（id 入力は string、#489 ADR-002 の方針に整合）
- Output: `Readonly<{ publicationState: PublicationStateDTO | null }>`（既存 `PublicationStateDTO` を再利用、`./view` から import）
- usecase 内で `as UserId` / `as NoteId` 橋渡し。所有権ゲートは `listShareLinks` と完全に同一にする: `loadOwnedNote`（**exists + owner のみ検証**）→ 後段で `if (note.status !== "active") throw new BusinessRuleError(NoteErrorCode.Trashed, ...)` → `publicationStateRepository.findById(noteId)` で取得。

**`loadOwnedNote` の実際の検証範囲（重要）:** `app/core/application/publication/internal.ts` の `loadOwnedNote` は JSDoc に "active" と書いてあるが、実コード（L16-32）は exists + owner の2点しか検証せず status を見ない。trashed の throw は `listShareLinks`（L35-40）が `loadOwnedNote` の戻り値に対して別途行っている。`getPublicationState` でも trashed を扱うにはこの後段チェックを明示的に置く必要がある。

**挙動変更ゼロの担保:** 現状 `loadPublishStateForNote` は publication state を所有権・trashed チェックなしで直読みしているが、trashed への到達ガードは「直前に必ず `listShareLinks` を逐次実行しており、それが先に throw する」ことに依存している。`NoteDetail.tsx`（L54-62）は `loadPublishStateForNote` 全体（= `listShareLinks` + state 読み取り）を catch し `NoteErrorCode.Trashed` のみ吸収する。リファクタ後も loader が `listShareLinks` → `getPublicationState` の**逐次順序**を保つ限り、forbidden/notfound/trashed が NG なら `getPublicationState` 到達前に `listShareLinks` が throw 済み。よって `NoteDetail.tsx` から見た外部挙動（throw / 値）は不変。挙動変更ゼロの本質的根拠は「新 usecase が同じ throw を行うから」ではなく、この**逐次順序**にある。

### Consequences

- 良い点: presentation → domain repository の直接結合とブランドキャストを解消。読み取り usecase の確立パターン（`getNoteDetail` / `listShareLinks`）に統一。
- トレードオフ: 同一 UoW 内で note の findById が1回増える（読み取りコストのみ、挙動変更なし）。

---

## ADR-002: `loadReferencingNoteTitle` は現状維持

### Status

Accepted

### Context

`loadReferencingNoteTitle` も loader 内で `noteRepository.findById` を直接叩く同種パターン。ただし `DomainNoteId.create()` で transport-boundary 検証してから検証済みブランドを渡しており、`string → ブランド` の `as` キャストは残っていない。Issue 本文は「方針を定める」とのみ要求。

### Decision

現状維持。usecase 化しない。

### Consequences

- 良い点: 挙動変更ゼロ。本 loader が依存する graceful fallback（不正 id → `{ title: null }`、not found → `{ title: null }`、他人の note → `{ title: null }`、空 title → `{ title: null }`）を完全に保てる。これは FilterBar チップを UUID 断片ラベルにフォールバックさせる transport-boundary degradation であり、loader の JSDoc と #489 ADR-002（URL 由来の検証・fallback は loader に残す）に整合。
- トレードオフ: loader 内の UoW repo アクセスは残るが、本 Issue の主目的（presentation 層のブランドキャスト除去）には非該当。usecase 化すると「NG を throw せず null を返す fallback usecase」という非標準契約か、loader 側で driver-level エラーまで握り潰す挙動変更を招くため、現状維持が最も整合する。

---
