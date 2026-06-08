# ADR — Issue #568: 領域5（P30/P31/P32）モックの未追従機能

## ADR-001: 公開バックリンクの可視性フィルタを usecase 合成で行う

### Status
Proposed

### Context
公開バックリンクは「参照元のうち公開ノートだけ」を出す必要がある。選択肢は (a) `noteRepository.findReferrers` に `visibility` 引数を足す、(b) usecase 側で `findReferrers` の結果を `publicationStateRepository.findByNoteIds` で公開のみに絞る、の 2 つ。

### Decision
(b) を採る。可視性（公開/非公開）の概念は publication 集約が持つ責務であり、note 集約のポートに `visibility` を持ち込むと集約境界が崩れる。既存の bulk 公開判定 `findByNoteIds` を再利用すれば新ポートを増やさずに済む。

### Consequences
- 良い点: 集約境界を保持。新ポート追加なし。既存資産の再利用。
- トレードオフ: usecase 内で 2 回のリポジトリ呼び出し（referrers → 公開判定）。件数が多い場合は N 件の id 一括判定になるが、参照元は通常少数のため許容。

---

## ADR-002: 公開サジェスト・ファセット集計用に新ポートメソッドを追加する

### Status
Proposed

### Context
P32 ドロワーの combobox は公開横断のタグ/ユーザーサジェストを要するが、既存 `tagRepository.searchByNamePrefix` は owner-scoped、`userRepository` に username プレフィックス検索が無い。期間別 facet 件数も集計 API が無い。

### Decision
公開横断の読み取り専用メソッドを各ポートに新設する（`tagRepository.searchPublicByNamePrefix` / `userRepository.searchPublicByUsernamePrefix` / `searchIndex.countByDateRanges`）。いずれも「公開ノートに紐づく」ことを SQL レベルの JOIN/EXISTS で保証し、列挙対策（live ユーザー・公開ノート保有のみ）を効かせる。

### Consequences
- 良い点: 公開面の検索体験をモックに忠実に追従。列挙対策が一貫。
- トレードオフ: d1 adapter と stub adapter の両方に実装が要る。公開横断 SQL は走査コストがあり、プレフィックスインデックス + EXISTS で絞る必要がある。

---

## ADR-003: 公開用の表示モードビューを新規実装する（認証側を流用しない）

### Status
Proposed

### Context
P30 のタイル/カレンダー表示は認証側 `TileView`/`CalendarView`/`ListView` に同等実装があるが、これらは `getRouteApi("/_app/")` に束縛され、選択/編集 affordance に密結合している。

### Decision
公開用 read-only ビュー（`PublicNoteViews.tsx`）を新規実装する。編集 affordance を持たず公開ルートのデータ・リンクに配線する。共通化（design `extract` 観点）は将来に委ね、本 Issue では別実装とする。

### Consequences
- 良い点: 公開ルートの制約に合った read-only 実装。認証側への影響なし。
- トレードオフ: ビューロジックの一部重複。将来の共通コンポーネント抽出余地を残す。

---

## ADR-004: 表示モードは loaderDeps から除外し、tags/sort はローダ依存とする

### Status
Proposed

### Context
P30 の chip（タグ絞り込み）・sort はサーバ再取得が要るが、表示モード（list/tile/calendar）は同一データのクライアント側レイアウト切替で済む。すべてを `loaderDeps` に入れると `display` 切替でも RSC 再ストリームが走り体感が劣化する。

### Decision
`display` を `loaderDeps` から除外しクライアント切替（Issue #219 の `DisplayModeSwitch` 手法を踏襲）、`tags`/`sort` はローダ依存にしてサーバ再取得する。

### Consequences
- 良い点: 表示モード切替が即時。タグ/ソートは正確なサーバ結果。
- トレードオフ: ローダ依存と非依存のパラメタが混在し、ルート設計がやや複雑になる。

---

## ADR-005: 期間ファセット件数集計は段階的着地を許容する

### Status
Proposed

### Context
ステップ 7 の `searchIndex.countByDateRanges` は adapter 実装が本 Issue 最大コスト。D1/SQLite FTS が期間 facet を効率に集計できるか不確実。

### Decision
ドロワーのコア価値（combobox 絞り込み・active-chip・期間 radio による絞り込み）は本 Issue で完成させる。期間別件数表示（`facet-count`）の集計が高コストと判明した場合は、件数表示のみ後続 Issue に切り出す段階的着地を許容する。

### Consequences
- 良い点: ドロワーの絞り込み機能を確実に出荷。集計コストでドロワー全体が止まらない。
- トレードオフ: モックの `facet-count`（3/12/28/31）が暫定的に出ない可能性。切り出す場合は progress.md / 新 Issue に明記。
- 補足: `searchIndex.ts` の `buildSharedFilters` が `dateRange` を既にフィルタしているため、SQL 構造上は `COUNT` を被せれば実装可能。「実現困難」ではなく「コスト次第で段階化」という位置づけ。

---

## ADR-006: 公開バックリンクではディレクトリセグメントを露出しない

### Status
Proposed

### Context
`view.ts` の `toBacklink` は `directorySegments`（フォルダ id/name）を必須引数に取り、認証側 `getBacklinks` は `DirectoryService.computeSegmentsForMany` でフォルダツリーを解決して埋めている。公開バックリンクで参照元ノートのフォルダ名を出すと、著者のフォルダ構成が公開面に漏れる。

### Decision
公開バックリンク usecase ではフォルダ名を露出しない。モックの backlink 表示要素を確認し、ディレクトリを出さない方針なら `directorySegments: []` 固定で `toBacklink` を流用、出さないことが明確なら公開用の軽量 DTO を `application/publication/view.ts` に新設する。`computeSegmentsForMany` を公開面で呼ばない。

### Consequences
- 良い点: フォルダ構成の情報漏洩を防ぐ。`getPublicNote` の最小露出方針と一貫。
- トレードオフ: `toBacklink` 流用時に `directorySegments: []` というダミー引数が必要、または公開用 DTO の追加。

### 実装時の決定（P31）
- モック `P31:689-701` の backlink 表示は **アイコン + タイトルのみ**でフォルダ名を出さないため、公開用 DTO は新設せず `toBacklink` を流用し `directorySegments: []` 固定とした。`DirectoryService.computeSegmentsForMany` は公開面で呼んでいない。
- 公開バックリンク usecase は対象ノートの公開ゲート（active + owner live + `visibility==='public'`）を `getPublicNote` と同じく確認し、非公開/不在は一律 `NotFoundError`（列挙対策）。参照元は `findReferrers` → active のみ → `findByNoteIds` で `visibility==='public'` の id 集合に絞る（ADR-001）。

---

## ADR-007: 関連ノート usecase は専用の軽量 DTO を返す（`NoteListItemDTO` を流用しない）

### Status
Accepted（P31 実装時）

### Context
モック `P31:703-723` の `related-card` は「タイトル + 先頭タグ 1 個 + 公開日」だけを出す。既存 `NoteListItemDTO` は `excerpt` / `tagIds` / `directoryId` / `ownerId` などを抱え、かつ `publishedAt`（publication 集約の値）を持たない。

### Decision
`RelatedPublicNoteDTO = { id, slug, title, tagNames, publishedAt }` を `listRelatedPublicNotes.ts` 内に新設した。`publishedAt` は `publicationStateRepository.findByNoteIds` の結果から解決する。リンク先は plan に従い `/notes/public/$noteId`（モック HTML の `/u/$username/$slug` 形式ではなく、ルート実装に存在する id ルートに合わせる）。

### Consequences
- 良い点: 公開面に必要な最小フィールドだけを運ぶ。`publishedAt` を確実に載せられる。
- トレードオフ: DTO がひとつ増える。owner 解決は `{ kind: 'byUsername' | 'byOwnerId' }` の両方を受け、コンポーネントは `getPublicNote` が返す `owner.id` を使うため `byOwnerId` 経路で 1 回のユーザー解決を省く。

---

## ADR-008: P30 chip 候補は現在の listing 由来の tagNames から導出（新ポートを足さない）

### Status
Accepted（P30 実装時）

### Context
モック `P30:556-560` の filter-row は「すべて + 各タグ chip + 期間/追加」を並べる。chip の候補（著者の公開タグ集合）を厳密に出すなら「公開ノートに紐づくタグを著者単位で列挙する」新 usecase / ポートが要るが、これは P30 のスコープ（`listUserPublicNotes` 拡張 + UI 配線）外であり、plan のステップ 9〜10 にも含まれない。

### Decision
chip 候補は現在ロード済みの `listUserPublicNotes` 結果に現れる `tagNames` から重複排除して導出し（先頭 8 件にクランプ）、新ポートは追加しない。選択中タグは client 側で候補にマージするため、フィルタでページが絞られて候補から消えたタグも chip（× 解除付き）が残る。「タグを追加」「期間」chip（モック）は本 Issue では非配線（タグは既存候補のトグル、期間は P32 ドロワー側の関心）。

### Consequences
- 良い点: 新ポート/usecase を増やさず P30 のスコープ内で完結。chip は現に存在するタグだけを出すので「飾り」にならない。選択タグの × 解除はモバイルモック `mobile/P30:363-364` に忠実。
- トレードオフ: chip 候補は「現在のページに出ているタグ」に限られ、著者の全公開タグを網羅しない。網羅的なタグナビゲーションが要るなら別 Issue で「著者公開タグ列挙」ポートを新設する。

### sort トグルの扱い
モックの sort-btn は「公開日順」ラベルのみだが、`updatedAt` 軸の飾りにならないよう updatedAt（公開日順ラベル）→ createdAt（作成日順）→ title（タイトル順）の循環トグルとして配線した。`publishedAt` 厳密ソートは未対応（progress.md 参照）。

---

## ADR-009: 公開サジェストポートは Tag は名前文字列、User は User エンティティを返す（P32実装時）

### Status
Accepted（P32 実装時）

### Context
公開横断サジェスト（ADR-002）の戻り型を決める必要があった。Tag は owner-scoped 集約で、公開横断では owner が異なる複数 tag 行が同名で並びうる。User は既存の `User` エンティティ（status 派生・username/displayName を持つ）。

### Decision
- `tagRepository.searchPublicByNamePrefix` は `readonly string[]`（distinct な tag 名）を返す。`Tag` エンティティを返すと「他ユーザーの tag 集約の id/ownerId」を公開面に晒すうえ、同名 tag が owner ごとに重複する。combobox に必要なのは名前のみなので `selectDistinct(tags.name)` で十分。
- `userRepository.searchPublicByUsernamePrefix` は `readonly User[]` を返す（既存の find* と対称）。usecase 側で `{ username, displayName }` に射影。User は単一集約なので重複問題がなく、エンティティ再構築コストも軽微。

### Consequences
- 良い点: Tag は最小情報（名前）のみ公開面に出す。User は既存ポート規約と対称で adapter の `toUser` を再利用。
- トレードオフ: 2 ポートで戻り型の粒度が非対称（文字列 vs エンティティ）。usecase の射影で吸収。

---

## ADR-010: ファセット件数は期間ごとに逐次 COUNT（CASE ピボットを採らない）（P32実装時）

### Status
Accepted（P32 実装時）

### Context
ステップ7の `countByDateRanges` は 4 期間分の件数を返す。1 クエリの `CASE WHEN ... THEN 1 END` ピボット集計と、期間ごとに `COUNT(*)` を回す逐次集計の 2 択。

### Decision
逐次 COUNT を採る。FTS の MATCH 経路は contentless 仮想表を join するため、全期間を 1 本のピボット集計にまとめると sub-query 形状が繊細になる。ファセットは数件の期間に限られ（`SearchLimit` とは無関係）、round trip は安価。`buildSharedFilters` を `buildNonDateFilters` + `buildDateRangeClause` に分解し、各期間で where に当てる構造にした。

### Consequences
- 良い点: SQL が読みやすく MATCH/LIKE 両経路で同じ COUNT を使える。`query` 経路と同じフィルタ整形を共有。
- トレードオフ: 期間数ぶんの round trip。ADR-005 の段階的着地は発動せず（コスト問題なし、件数を表示している）。

---

## ADR-011: ドロワーの確定値は URL、候補サジェストは serverFn debounce（P32実装時）

### Status
Accepted（P32 実装時）

### Context
plan S-002 の方針を実装に落とすにあたり、combobox の「確定値」と「候補」の状態配置を明確化する必要があった。

### Decision
- 確定値（選択ユーザー単一・選択タグ複数・選択期間）は URL search params（`username`/`tags`/`period`）に載せ、route loader が `searchPublicNotes` / `countPublicSearchFacets` に流す。active-chip の × 解除は URL から該当パラメタを除去するだけ。
- 候補サジェストは `createServerFn`（GET, `inputValidator` で prefix を検証, 認証なし）を 200ms debounce + 単調 request-id レースガードで client から呼ぶ。候補は React state に閉じ URL に載せない。
- 公開ルート用に `getRouteApi("/search")` を束縛（認証側 `/_app/` 束縛は流用不可）。

### Consequences
- 良い点: 確定状態が URL 駆動で共有/履歴可能。候補は URL を汚さず軽量。レート制限はサジェスト serverFn 側に将来トースト化で被せられる（本 Issue 範囲外）。
- トレードオフ: combobox のキーボード矢印移動は未実装（クリック/タップ選択）。client 挙動の完全検証は manual-test に委ねる。

---

## ADR-012 (frontend): 公開面 dense アイコンの寸法方針（PR #604 review-001 W-FE-001）

### Status
Accepted（review-001 修正時）

### Context
`SearchFilterDrawer.tsx` / `PublicTopControls.tsx` の dense な chip / token / segmented control / drawer header に、lucide アイコンを `Icon` ラッパ非経由で `size-[11px]`/`[13px]`/`[14px]`/`[18px]` のリテラル px + 任意 `strokeWidth`（1.7〜2.2）で直書きしていた。これは CLAUDE.md「新規リテラル px 禁止」と `Icon.tsx` の契約（size 16|20|24・stroke 1.5 固定）に抵触する。

review-001 W-FE-001 は (a) `Icon` ラッパの最寄りサイズ（16）へ寄せて px を消す、(b) 真に sub-16px が要る箇所のみアイコン寸法トークンを追加して `var()` 参照、の 2 案を提示。

### Decision
(b) トークン追加を採る。対象はいずれも P32/P30 モックの高密度 UI（30px の chip、26px の token、segmented control 内の小グリフ）であり、(a) で 16px に拡大すると mock 忠実度が崩れる。加えてこれらのグリフは小サイズを補う重ね stroke（1.7〜2.2）をモックが指定しており、stroke 1.5 固定の `Icon` ラッパでは再現できない。よって `Icon` ラッパは流用せず、アイコン寸法トークンを `tokens.css` に新設し `size-[var(--icon-*)]` で参照する。

- 追加トークン（`tokens.css` Radius 直後・`spec/design/tokens.md` ミラーは §5.5 として追記）:
  - `--icon-2xs: 11px`（chip/token の × 解除、`ChevronDown`）
  - `--icon-xs: 13px`（segmented control の表示形式アイコン）
  - `--icon-sm: 14px`（フィルターボタンの `SlidersHorizontal`）
  - `--icon-md: 18px`（ドロワーヘッダの閉じる ×）
- `app/styles/index.css` の `@theme inline` に同名トークンをブリッジ（CLAUDE.md のトークン追加手順）。
- `size-3`（12px）は Tailwind の spacing トークン由来ユーティリティでありリテラル px ではないため据え置き（review が列挙した `[11px]/[13px]/[14px]/[18px]` のみが対象）。
- 手描き `<svg>`（lucide に無い形状・`PublicNoteDetail` の backlink 等）は `ShareLinkGate` パターンと同類で許容＝触らない。

### Consequences
- 良い点: 新規リテラル px をゼロにしつつ mock の dense 寸法を完全維持。`Icon` ラッパの size 制約（16|20|24）を緩めずに sub-16px をトークンで一元管理。
- トレードオフ: `Icon` ラッパを通さないため stroke/サイズの型保証は効かない（既存の `ShareLinkGate` / 手描き svg と同レベルの逸脱）。dense グリフ専用トークンが 4 つ増える。

---

## ADR-012 (backend): 公開サジェスト/検索の可視性ゲートと多層クランプ（PR #604 review-001 B-001/B-002/W-SEC-001）

### Status
Accepted（review-001 修正時）

### Context
review-001 が backend/SQL/security に 3 件のゲート不備を指摘した。

1. B-001: `userRepository.searchPublicByUsernamePrefix` の EXISTS が `publication_states.visibility='public'` のみで `notes.status='active'` を結合しておらず、タグ側 `searchPublicByNamePrefix`（active INNER JOIN）と非対称。ノートを trash しても `publication_states` 行は outbox リレー（at-least-once・順序なし）が消すまで残るため、「公開ノートが全 trashed＝実体 0 件」の著者が窓の間サジェストに漏れ、未認証クライアントに存在を推測させる（列挙の過渡的漏洩）。
2. B-002: 未認証の `tags` 配列に長さ上限がなく、各 tag が `searchPublicNotes`(1) + `countPublicSearchFacets`(4 期間) の計 5 クエリに `LIKE '%"<tag>"%'` 句として乗るため、要素数無制限だと 4 倍超の DoS 増幅面になる（main には無く本 PR で初めて未認証面に露出）。
3. W-SEC-001: `listPublicBacklinks` が `findReferrers(noteId)` を opts なしで呼び、公開判定で絞る前に全参照元を `contentHtml`+children でフルハイドレートしていた（人気公開ノート/自己参照増幅で重い materialization）。

### Decision
1. B-001: EXISTS を `publication_states JOIN notes ON notes.id = publication_states.note_id ... AND notes.status='active'` に変更し、タグ側と `getPublicNote`/`listRelatedPublicNotes` の active 再チェックに対称化。
2. B-002: 多層防御。(a) transport 境界 `search.tsx`（`validateSearch` / strict-RPC `renderInputSchema`）と `u/$username/index.tsx` の `tags` zod に `.max(8)`（P30 chip 上限と整合）を付与。zod の `.max()` は配列長制限、要素長の `min(1).max(64)` はそのまま。(b) 値オブジェクト構築でも `SearchQuery.create` が `tagNames` を `slice(0, 8)` でクランプ（transport をバイパスする呼び出しでも fan-out を抑える）。`SearchQuery` のクランプは「上限超過を弾く」のではなく既存規約に倣い静かに切り詰める（DateRange 等の throw とは別系統。タグ過多はビジネス不変条件違反ではなく DoS 防御のため）。
3. W-SEC-001: `findReferrers(noteId, { limit: 20, offset: 0 })` でハイドレート上限を設ける。20 はモック表示分 + ハイドレート後の active/public フィルタ余白。

### Consequences
- 良い点: 公開可視性ゲートが 3 経路（サジェスト/検索/バックリンク）で一貫。未認証面の増幅・列挙・重 materialization をいずれも閉塞。クランプは transport + 値オブジェクトの 2 層で、どちらか一方をすり抜けても防御が残る。
- トレードオフ: `SearchQuery.create` のサイレント slice は、9 個目以降のタグ指定が黙って落ちる（エラーにしない）。これは検索フィルタの過多を「弾く」より「丸める」方が UX 上自然との判断。B-001 の active JOIN は `searchPublicByUsernamePrefix` に notes 結合を増やすが、suggest は limit 付きの軽量クエリで実害小（W-ADP-001 の `LOWER()` 非効率は別途後続 Issue 候補として据え置き）。
