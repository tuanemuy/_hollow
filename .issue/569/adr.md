# ADR — Issue #569: 領域3 P18 タグ管理の未追従機能（検索・ソート・最終使用列）

## ADR-001: 最終使用日時は read-time 集約（`MAX(notes.updatedAt)`）で導出する

### Status
Proposed

### Context
C「最終使用日時の列」を実現するには表示用データの供給経路が要る。導出方式に2案ある:

- **案1 集約クエリ拡張**: `findByOwner` の既存 JOIN に `MAX(notes.updatedAt)` を足し read-time に算出。
- **案2 列追加 + migration**: `tags.last_used_at` 列を新設し書き込みパスで更新。

Issue 本文は C を「domain / DB / DTO 変更が必要」と見積もっている。一方、`0013_drop_tags_note_count.sql` は denormalized な `tags.note_count` 列を意図的に削除し、「使用量は read-time 集約」という設計判断を既に確立している（`tagRepository.findByOwner` の JSDoc・`dto/tag.ts` のコメントが明示）。

### Decision
**案1（集約クエリ拡張）を採用する。** `tags` への列追加・`Tag` 集約変更・migration は行わない。`findByOwner` の既存 owner-scoped/active JOIN に `MAX(notes.updatedAt)` 集約を1つ足し、`TagWithNoteCount.lastUsedAt: Date | null` として `noteCount` と並列に運ぶ。ソート軸 `lastUsedAt` も同集約式を orderBy に再利用する。

**語義の確定:** 「最終使用日時」= **そのタグが紐づく active ノートの最終更新日時**（`MAX(notes.updatedAt)`）。`note_tags` にタグ付与時刻の列が存在せず「タグが最後に付与された日時」は導出不能なため、`noteCount` と同じ active-notes JOIN を集約源とする。本文編集でも `updatedAt` が動くので厳密な「タグ付け日時」ではないが、現状のデータモデルで供給可能かつ `noteCount` と整合する唯一の定義である。未使用タグ（active ノート0件）は `NULL` → `lastUsedAt: null`。

### Consequences
- 良い点: データモデル不変。整合性が書き込みパスのフック無しに自動で保たれる（ノート更新/タグ付け変更/物理削除の cascade が即反映）。`0013` / read-time `noteCount` の設計判断と一貫。追加 JOIN 不要でコスト増は軽微。`Tag` 集約も migration も不要で、C を「DTO + ポート型 + アダプタ + usecase 入力のみ」に収められる。
- トレードオフ: `lastUsedAt` ソートは集約式ソートでインデックスが効かない（`noteCount` ソートと同条件）。タグ目録は有界なので実害は小さい。NULL（未使用タグ）の並び順を仕様化しテストで固定する必要がある。

---

## ADR-002: `TagManager` 専用の検索/ソート loader を新設し全件取得 loader を温存する

### Status
Proposed

### Context
タグ管理ルートの RSC `TagManager` は `loadTagsForOwner(user.id)` で一覧を得ている。この loader は `cache()` でメモ化され、`resolveTagNamesToIds` など「URL のタグ名 → TagId 解決」のための全件取得用途からも参照される。検索/ソート対応で `loadTagsForOwner` に `query`/`sort`/`order` 引数を足すと、`cache` のメモ化キーが変わり、全件取得経路が検索条件付きの結果を引く事故が起きうる。

### Decision
`TagManager` 専用の検索/ソート対応 loader（例 `loadTagsForManager`）を `loaders.ts` に新設し、`listTags` に `query`/`sort`/`order` を透過させる。既存 `loadTagsForOwner`（全件取得・`resolveTagNamesToIds` 依存）には引数を足さず温存する。新 loader は RSC から1回しか呼ばれないため `cache()` で包まない（包んでも検索引数全体がキーになるだけで実益が無い）。

### Consequences
- 良い点: `cache` キー汚染と全件取得経路の挙動変化を回避。各 loader の責務（一覧表示用 vs 名前解決用）が明確に分かれる。
- トレードオフ: タグ取得経路が2つに増える。用途が異なるため許容範囲。

---

## ADR-003: 検索/ソートのURLパラメータは `pagination.ts` 規範の二段構え schema で検証する

### Status
Proposed

### Context
`q`/`sort`/`order` は URL 検索パラメータ（`validateSearch`）と server fn ペイロード（`inputValidator`）の両方を通る。CLAUDE.md の Input validation 方針は「transport境界で検証、usecase は static type を信頼」。`pagination.ts` は strict RPC schema と URL search schema をフィールドバリデータ SSOT から導出する規範を確立している。

### Decision
`app/components/tag/schema.ts` に、フィールドバリデータを SSOT として `tagListParamsSchema`（strict RPC、`inputValidator` 用）と `tagListSearchSchema`（URL search、`validateSearch` 用、各フィールド `.optional().catch(undefined)`）を定義する。`pagination.ts` 同様の型レベル整合ガードを付ける。

### Consequences
- 良い点: 不正な URL パラメータ（`?sort=bogus`）でもルートを壊さずデフォルトに落ちる。strict/URL 版の制約がドリフトしない。既存規範と一貫。
- トレードオフ: schema ファイルが1つ増えるが、`pagination.ts` と対称で学習コストは低い。

---

## ADR-004: 検索ボックスは `<search>` 要素でラップする（`role="search"` を form に直書きしない）

### Status
Accepted

### Context
モックのツールバー検索は `<div class="search" role="search">` で表現されている。実装では submit を取るため `<form>` が要るが、`<form role="search">` は Biome の `lint/a11y/useSemanticElements` に抵触する（「`role` を持つ要素はネイティブ要素に置換できる」）。本リポジトリの公開側検索（`public/PublicSearch.tsx` ほか）はすべてネイティブ `<search>` 要素を使っている。

### Decision
`TagListToolbar` の検索を `<search><form onSubmit>…</form></search>` 構成にする。視覚トークン（surface 背景・`search-icon`・focus shadow）はモックの `.search` と共有し、leading icon のオフセット親となる `relative` は内側の `<form>` に置く（`<search>` ラッパは幅/flex のみ担当）。

### Consequences
- 良い点: 既存の公開側検索と a11y パターンが揃い、lint も通る。`role` 属性の手書きを避けられる。
- トレードオフ: ラッパ要素が1階層増えるが、`TAG_SEARCH`（幅/flex）と `relative`（アイコン基準）で責務が分かれて明快。

---

## ADR-005: 検索/ソート/最終使用の任意 props は明示的に `| undefined` 型にする

### Status
Accepted

### Context
本リポジトリは `exactOptionalPropertyTypes: true`。`q`/`sort`/`order` は URL schema（`.optional().catch(undefined)`）から `string | undefined` として降ってくるため、これを `?:` 省略可能プロパティに渡すと「`undefined` は省略と非互換」で型エラーになる（`TagManager` / `TagList` / `TagListToolbar` / `loadTagsForManager`）。

### Decision
これらの貫通プロパティは `q?: string` ではなく `q: string | undefined` のように **明示的に `| undefined` を含む必須プロパティ**として宣言する。値は常に親（route loader / RSC）が `undefined` 込みで供給するので、呼び出し側で省略する余地はなく、必須化しても実害がない。

### Consequences
- 良い点: `exactOptionalPropertyTypes` と整合し、`undefined` を素直に渡せる。プロパティが必ず渡されることが型で保証される。
- トレードオフ: 呼び出し側で常に明示する必要があるが、貫通する3プロパティのみで局所的。
