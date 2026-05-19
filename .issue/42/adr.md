# ADR — Issue #42: spec-sync follow-up

## ADR-001: DownloadMedia の access policy を domain service に集約する

### Status
Proposed

### Context
spec が要求する「unlisted ノートの media は viaShareLinkId 経由でのみアクセス可能」というルールを満たすには、現状の `MediaService.assertViewableBy` が unlisted を無条件 pass している状態を改修する必要がある。

候補:
1. `MediaService.assertViewableBy` のシグネチャを拡張し、share-link 経由かどうかを domain に教える
2. `downloadMedia.ts` 側で事前に `viaShareLinkId === null && relatedNoteVisibility === "unlisted"` を検査して reject

### Decision
案 1 を採用。`assertViewableBy` のシグネチャに `hasShareLink: boolean` を追加し、unlisted 分岐をその条件で絞る。

### Consequences
- 良い点: access policy が domain service に集約され SSOT。将来別 usecase から呼ばれてもガードが効く。pure function なので unit test で組合せ matrix を網羅可能
- トレードオフ: 既存の `assertViewableBy` の単体テスト群は新引数に追従する必要がある（呼び出し元は downloadMedia.ts 1 箇所のみのため影響範囲は小さい）

---

## ADR-002: assertViewableBy の引数は boolean とする

### Status
Proposed

### Context
案 1 を採るとして、引数の型に 2 案ある:
1. `hasShareLink: boolean`
2. `viaShareLinkId: ShareLinkId | null`

現状 domain 側で ShareLinkId そのものを使う必要はなく、「share-link 経由 access かどうか」の真偽値だけが必要。

### Decision
`hasShareLink: boolean` を採用。

### Consequences
- 良い点: 最小限の情報のみを domain に渡せる。将来 ShareLinkId 自体を使う処理（例: rate limit / 監査ログ）を追加するときに改めてシグネチャを拡張すれば良い
- トレードオフ: 後から ID が必要になった場合は二度手間。ただし YAGNI 原則に従う

---

## ADR-003: 復元先 slug 衝突は partial unique index と usecase 検証の両方で守る

### Status
Proposed

### Context
spec の `BusinessRuleError('slug_conflict')` を満たすには、

1. partial unique index のみ（DB 制約に任せる）
2. 事前検証のみ（DB は status を区別しない full unique index のまま）
3. 両方

現状の `uniqueIndex("uniq_notes_owner_slug")` は status を区別しないため、「trashed と active の同一 slug 共存」というテスト fixture すら作れない。

### Decision
案 3（両方）を採用。`schema.ts` で partial unique index 化（`WHERE status='active'`）し、`restoreNote.ts` 側でも事前検証を行う。

### Consequences
- 良い点:
  - partial index 化により fixture 可達性が確保され、テストが書ける
  - usecase 検証により、競合時に DB driver の `UNIQUE constraint failed` ではなく `BusinessRuleError('slug_conflict')` を返せる（spec 文言と一致）
  - DB 制約は race 時の最後の砦として機能
- トレードオフ: partial index のための新規 migration (0007) と schema 更新が必要。本番 D1 に既存重複データが無いことを apply 時に念のため確認

---

## ADR-004: assertSlugUnique のシグネチャ拡張 + findByOwnerAndSlug の active 限定化

### Status
Accepted（初版 Proposed を実現可能性レビューでの指摘を受けて改訂）

### Context
`NoteService.assertSlugUnique` は既に `restoreNote.ts:77` から呼ばれているが、衝突時に `NoteErrorCode.InvalidSlug` を投げる。spec は `'slug_conflict'` という別文言を要求している。

候補:
1. `assertSlugUnique` に「衝突時の error code」引数を追加（既定値 `InvalidSlug` で後方互換維持）
2. `assertSlugUnique` の挙動を変えて常に `SlugConflict` を投げる
3. `restoreNote` 内でインライン検査を行い、`assertSlugUnique` 呼び出しを削除する
4. `findByOwnerAndSlug` を `status='active'` 限定にする

初版では「他 usecase 波及を避けるため」案 3 を採用したが、実現可能性レビュー P-003 で `assertSlugUnique` の呼び出し元が `restoreNote.ts:77` の 1 箇所のみ（create / rename は `generateUniqueSlug` 経由）と判明し、波及の懸念は事実誤認だった。

加えて P-001 が指摘するように、partial unique index 化後は `findByOwnerAndSlug` が status を区別しないままだと「active と trashed が同 slug で共存する」状況で SQLite が非決定的にどちらかを返し、インライン検査のロジック `collision.id !== found.entity.id` が自分自身（trashed）の取得で偶発的に false になり衝突取りこぼしが発生する。

### Decision
案 1 と 案 4 の併用を採用。

- 案 1: `assertSlugUnique` のシグネチャに任意引数 `code: NoteErrorCode = NoteErrorCode.InvalidSlug` を追加。`restoreNote.ts` から `NoteErrorCode.SlugConflict` を渡して呼び出す。
- 案 4: `findByOwnerAndSlug` のクエリに `eq(notes.status, "active")` を追加し active 限定化。`domain/note/ports/noteRepository.ts:84` の JSDoc にも明記。

### Consequences
- 良い点:
  - `findByOwnerAndSlug` の active 限定化により partial unique index と API のセマンティクスが対称になる
  - `getPublicNote.ts:73`（公開ルート）も意味的に正しくなる（trashed は公開対象でない）
  - `NoteService.generateUniqueSlug`（`service.ts:182, 239, 247`）も active のみ衝突対象になり、trashed slug を新規 active で再利用できる（UX としても望ましい挙動変化）
  - `assertSlugUnique` の任意引数化により後方互換を保ちつつ restoreNote だけが `SlugConflict` を返す
- トレードオフ:
  - `findByOwnerAndSlug` のセマンティクス変更は API 利用者の前提を変える。JSDoc と既存呼び出し元（`getPublicNote`, `generateUniqueSlug`, `assertSlugUnique` 経由）を確認した上で「active 限定化が意味的に正しい」と判断した
  - `runExportJob.ts:197` の mock は何でも返せる関数として書かれているだけなので影響なし

---

## ADR-005: DuplicateNote の trashed 拒否は既存 `AlreadyTrashed` を流用する

### Status
Proposed

### Context
DuplicateNote の trashed 拒否で投げる error code を新規追加するか既存を流用するか。

候補:
1. 新規 `CannotDuplicateTrashed: "note_cannot_duplicate_trashed"` を追加
2. 既存 `AlreadyTrashed: "note_already_trashed"` を流用
3. 既存 `InvalidStatus`（or 類似）を流用

spec は具体的 code を要求していない（「動作対象外 / 拒否」のみ）。

### Decision
案 2（`AlreadyTrashed` 流用）を採用。`saveNote.ts:82-87` / `renameNote.ts:44` で全く同形のパターンが既に使われている。

### Consequences
- 良い点: 既存パターンと完全一致。新規 code 追加なしで YAGNI 原則を守れる
- トレードオフ: `AlreadyTrashed` の文字列が「duplicate できない」という意味も内包することになる。ただし「対象が trashed である」というドメイン状態を表す code として一貫しており、文字列が「duplicate 固有」を示唆していないので問題ない

---

## ADR-006: searchOwnNotes 側の integration test 追加は不要

### Status
Accepted

### Context
Issue #42 本文 #4 は「spec/testcases/note/index.md の ListNotesByOwner 表「keyword 指定」行を `searchOwnNotes` 表に移動、対応する integration test を search ドメイン側に追加」と書かれている。一方で実際に `spec/testcases/search/index.md` の `## SearchOwnNotes` 表を確認すると「キーワードあり / 0 件 / keyword 空 / tagNames / directoryId / SearchIndex 障害」の6行が既に網羅されており、移動は不要（重複追加になる）。さらに `searchOwnNotes` 側は unit test (`searchOwnNotes.test.ts`) で keyword → SearchQuery 構造への委譲を 9 ケース網羅済。

### Decision
本 Issue では:
- `spec/testcases/note/index.md` の keyword 行を**削除のみ**実施（search 表への追加は不要）
- `searchOwnNotes` 側の追加 integration test は実施しない

`searchOwnNotes.test.ts` の unit test は `SearchIndex` を mock しているため、 `keyword → SearchQuery` の委譲ロジック（9 ケース）を網羅しているという主張は keyword 整形・委譲ロジックに限定したものである。実 `D1SearchIndex` の検索結果検証（adapter level の挙動）は本 Issue スコープ外であり、必要なら別 Issue で検討推奨。

### Consequences
- 良い点: spec 文書のカバレッジは search 表で維持され、note 表は重複なくなる。`keyword → SearchQuery` の委譲ロジックは unit test で網羅済み。新規 integration test を追加してもテスト対象（SearchIndex は fake）が unit と同じになり情報量が増えないため、コスト無駄なし。
- トレードオフ: Issue 本文の「対応する integration test を search ドメイン側に追加」を文字通り実施しない判断。本 ADR で根拠を明示することで「漏れ」と誤読されないようにする。実 D1SearchIndex の挙動検証は別途検討推奨。

---

## ADR-007: findByOwnerAndSlug の API セマンティクス変更

### Status
Accepted

### Context
ADR-004 で `findByOwnerAndSlug` を active 限定化することを決定した。これは API の意味変更であり、ポートインターフェース (`domain/note/ports/noteRepository.ts:84`) の利用者に影響する。

候補:
1. クエリだけ active 限定化し、ポート名はそのまま (`findByOwnerAndSlug`)、JSDoc に明記
2. ポートをリネーム (`findActiveByOwnerAndSlug`) して全呼び出し元を機械的に追従
3. ポートを 2 種類用意 (`findByOwnerAndSlug` (全 status) と `findActiveByOwnerAndSlug` (active のみ)) し、用途に応じて使い分ける

### Decision
案 1 を採用。`findByOwnerAndSlug` の内部クエリに `eq(notes.status, "active")` を追加し、JSDoc に「returns active notes only; trashed notes are excluded」と明記する。

### Consequences
- 良い点:
  - 全呼び出し元（`getPublicNote`, `generateUniqueSlug`, `assertSlugUnique` 経由の restoreNote）が「active のみで衝突回避 / 公開対象を見たい」という意図と一致するため、リネームせず内部実装の変更で十分。
  - partial unique index と意味的に対称（DB 制約は active のみ、API も active のみ）。
  - `resolveInternalLinks`（`app/core/domain/note/service.ts:183` 付近）も `findByOwnerAndSlug` の利用箇所であり、`[[trashed-slug]]` 形式の内部リンクは unresolved（broken link）として描画されるようになる。意味的にも望ましい挙動変化（trashed なノートは編集者向けにも「壊れたリンク」として可視化される方が望ましい）。
- トレードオフ:
  - 既存利用者は API 名から「全 status を見る」と誤読する可能性がある。JSDoc で明示し、レビューラウンドで全呼び出し元を再確認することでカバーする。
  - 将来「trashed を含めて検索したい」要件が出た場合は新しいメソッド (`findAnyByOwnerAndSlug` 等) を追加する想定。本 Issue ではそのような要件はない（YAGNI）。
