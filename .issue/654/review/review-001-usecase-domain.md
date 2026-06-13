# PR #691 レビュー — Use Case / Domain 観点

対象: Issue #654 公開ページ(P30)「タグを追加(＋)」UI（公開面タグ母集合列挙）
レビュー範囲: ドメインポート追加 / ユースケース新設 / 配置・契約・cap・エラー契約・依存方向

## 検証サマリ（受け入れ基準 AC-2/AC-3/AC-4）

| AC | 内容 | 判定 | 根拠 |
|---|---|---|---|
| AC-2 | 公開ノート母集合の全タグ列挙経路 | 満たす | `tagRepository.listPublicTagNamesByOwner` を `listUserPublicTags` が呼ぶ owner-scoped 読み取り経路。現ページ一覧に依存しない |
| AC-3 | 公開可視性で gate（private-only タグ非出現） | 満たす | アダプター JOIN が `publication_states.visibility='public'` ＋ `notes.status='active'` で gate。integration test で private/unlisted/trashed/orphan の非出現を検証 |
| AC-4 | 件数上限（上限超過でも破綻しない） | 満たす | `PUBLIC_TAG_MASTER_CAP=1000` をユースケースが渡し、アダプター SQL の `.limit(limit)` で表現。integration test で `limit=2`／`limit<=0` を検証 |

`pnpm typecheck` グリーン（`FakeTagRepo` への空スタブ追加で `implements TagRepository` の型エラー回避済み）。

---

## Use Case / Domain

### Blockers
なし

### Warnings

- **[W-001]** owner-scope 述語を `notes` の JOIN 条件に置く設計の脆さ（防御不足ではないが将来リスク） / 場所: `app/core/adapters/d1/repositories/tagRepository.ts:300-307` / 理由: `eq(notes.ownerId, ownerId)` を `notes` の innerJoin 条件に含めており、owner-scope の正しさは「`note_tags`→`notes` のFK整合」と「JOIN 条件の `ownerId` 一致」の両方に依存する。雛形の `searchPublicByNamePrefix` はクロスオーナーなのでこの述語が無く、本メソッドが唯一 owner 条件を持つ。integration test の "cross-owner public note" ケース（他オーナーの公開ノートに本オーナーのタグが note_tags レベルで紐づくケース）で `[]` が返ることを確認済みなので**実害はない**が、ADR-001 が指摘する通り「gate 条件が将来変わると両メソッドを揃えて直す必要がある」点に加え、owner 述語が `tags.ownerId` ではなく `notes.ownerId` に乗っている前提（=「このオーナーの公開ノートに紐づくタグ名」であって「このオーナー所有のタグ」ではない）は JSDoc から明示的に読み取りにくい。提案: ポート JSDoc に「owner-scope は `notes.owner_id` を gate にする（タグの所有者ではなく『このオーナーの公開ノートに付いたタグ名』）」を一文足すと、将来の gate 変更時の取り違えを防げる。コード変更は不要。

### Notes

- **[N-001]** ポート配置（ADR-001）は妥当。`searchPublicByNamePrefix` と同型の公開 gate JOIN を read-only SQL でアダプターに閉じ、publication 集約の「id-shaped projection only」契約を侵していない。tag 名列挙責務を tag ドメインに集約する判断は前例と一貫。JSDoc（`tagRepository.ts:91-104`）も公開 gate・owner-scope・cap（master-set bound）・順序（name asc）を全て明記しており契約と実装が整合。

- **[N-002]** ユースケース `listUserPublicTags`（`listUserPublicTags.ts`）は `listUserPublicNotes`/`getPublicProfile` と完全に同じ作法: `Username.create` で VO 構築 → UoW 内 `userRepository.findByUsername` → `null`／`deleted`／`suspended` を `NotFoundError("user", ...)` に落とす guard → `tagRepository` へ委譲。ドメインロジックの漏出なし。薄いオーケストレーションに徹しており責務分離（profile 読み取りへの相乗り回避＝ADR-005）も計画通り。

- **[N-003]** cap 定数 `PUBLIC_TAG_MASTER_CAP=1000` の置き場所（ADR-002）は適切。ユースケース層がモジュールスコープ定数で上限を持ち、ポートの `limit` 引数として渡し、アダプター SQL の `LIMIT` で表現する三層分担は `listUserPublicNotes` の `TAG_CANDIDATE_CAP=1000`／`getPublicProfile` の `findPublicByOwner(ownerId,{limit:1000})` と一貫。コメントで ADR-002 と桁の根拠を明示。

- **[N-004]** エラー契約・入力検証境界の遵守。`listUserPublicTags` は `NotFoundError`（既存 application エラー kind）のみを送出し、`BusinessRuleError` は `Username.create` の VO 構築境界に委ねる。transport 入力は `username` のみで、母集合は URL/loader dep に依存しないため追加の transport 検証を設けていない（計画通り「入力検証は2点境界のみ」を侵していない）。`serverData` 経路で母集合を供給する設計も schemaless 内部経路の用途に合致。

- **[N-005]** 依存方向は遵守。domain ポート（内側）→ application ユースケース → adapter 実装、の順で依存が内向き。ユースケースはドメイン VO（`Username`）とポート（`tagRepository`）にのみ依存し、アダプター具象を知らない。`index.ts` の re-export も既存 publication 群と同列に追加（`listUserPublicTags.ts` 19行）。

- **[N-006]** アダプター実装（`tagRepository.ts:284-319`）は `searchPublicByNamePrefix` の雛形に忠実: (1) prefix の `trim`/空文字 return／`LIKE` 条件を除去、(2) `eq(notes.ownerId, ownerId)` を追加、(3) `selectDistinct({name})`＋`orderBy(asc(tags.name))`＋`.limit(limit)` を維持、(4) `if (limit <= 0) return []` 防御ガードを踏襲、(5) `mapDbError` でドライバエラーを共有契約へ翻訳。adapter→application のエラー翻訳契約も守られている。

- **[N-007]** テスト方針は計画（step 4）と整合。gate 検証の本体を D1 integration test に一本化（distinct／public gate／owner-scope／cross-owner note 除外／limit／limit<=0／公開ノート無しで空）。`FakeTagRepo` には空スタブのみ追加し、ユースケースのフェイクユニットは新設せず（view fakes container は user repo 不在で流用不可という計画の判断通り）。`listUserPublicTags` 自体の integration test（deleted/suspended guard）は ADR/plan で「任意」とされた範囲で未追加 — 薄いオーケストレーションであり既存の `listUserPublicNotes` 等と同じ guard コードの再利用なので許容範囲だが、deleted/suspended guard の回帰が将来 1 箇所だけ崩れても検出されない点は留意（Warning 化はしない。計画が明示的に optional と判断済みのため）。
