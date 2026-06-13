# ADR — Issue #654: 公開ページ(P30)の「タグを追加(＋)」UI（公開面タグサジェスト）

## ADR-001: 公開タグ母集合の列挙は tag ドメインポートに置き、publication 集約には足さない

### Status
Proposed

### Context
「このユーザーの公開ノートに付与された全タグ（母集合）」を列挙する読み取り経路が必要。配置候補は (a) tag ドメイン `TagRepository` に owner-scoped メソッドを追加、(b) publication ドメイン `PublicationStateRepository` に追加、の2つ。公開可視性 gate は publication 集約が握る不変条件である一方、列挙対象は **tag 名** であり、`publicationStateRepository` の JSDoc は「読み取り listing は plain **id-shaped** projection を返し、クロス集約 join は application 層か adapter の read-only SQL に置く」と宣言している（publication 集約に Note/Tag データを引きずり込まない設計）。tag ドメインには既に `searchPublicByNamePrefix` が「`note_tags` × `notes(active)` × `publication_states(public)`」の公開 gate JOIN を read-only SQL でアダプターに閉じて distinct tag 名を返す前例がある。

### Decision
tag ドメインポート `TagRepository` に owner-scoped・prefix なしの `listPublicTagNamesByOwner(ownerId, limit)` を追加する。公開可視性 gate は `searchPublicByNamePrefix` と同型の JOIN（`publication_states.visibility = 'public'` ＋ `notes.status = 'active'`）でアダプターの read-only SQL に閉じる。publication 集約には足さない。

### Consequences
- 良い点: tag 名列挙という責務を tag ドメインに集約でき、`searchPublicByNamePrefix` の確立済み公開 gate パターンを雛形に最小差分（owner 条件追加・prefix 除去）で実装できる。publication 集約の「id-shaped projection only」契約を守る。
- トレードオフ: 公開可視性 gate が publication 集約の不変条件であるにもかかわらず、その JOIN が tag アダプターの SQL に現れる（既に `searchPublicByNamePrefix` で同じ構図があり一貫している）。gate 条件が将来変わると両メソッドを揃えて直す必要がある。

---

## ADR-002: 母集合の件数上限はユースケース層が定める定数（PUBLIC_TAG_MASTER_CAP）とし、アダプター SQL の LIMIT で表現する

### Status
Proposed

### Context
Issue は「件数上限を設ける」ことを要件とする。上限の責務をどこに置くか（ポート契約／ユースケース／アダプター）と、具体値が問題になる。既存に2つの作法がある: `listUserPublicNotes` の `TAG_CANDIDATE_CAP = 1000`（ユースケース層が定数を持ち「現実的な単一オーナー公開ノート数を大きく上回る」とコメント）、`getPublicProfile` の `findPublicByOwner(ownerId, {limit: 1000})`（ユースケースが limit を渡す）。

### Decision
上限値はユースケース層の定数 `PUBLIC_TAG_MASTER_CAP` が定め、ポートメソッドの `limit` 引数として渡し、アダプターは SQL の `LIMIT` で表現する。値は **1000**（タグは1オーナーあたりノート数より少なく、`TAG_CANDIDATE_CAP` と同じ桁で十分に余裕がある）。ポートの JSDoc に「master-set bound」として cap の存在を明記する。

### Consequences
- 良い点: 既存 cap の作法（ユースケース定数＋ポート limit 引数）と一貫。現実的なタグ数を大きく上回る値なので実運用で切られない。
- トレードオフ: 万一 1000 を超える公開タグを持つオーナーでは母集合の一部が欠ける（モック構造一致は維持、選択肢の網羅性のみ劣化）。タグ数がノート数より少ない性質上、発生可能性は極めて低い。必要なら将来ページング／検索式 UI へ拡張する余地を残す。

---

## ADR-003: 母集合は ＋chip の選択肢としてのみ供給し、既存 `tagOptions`／`mergeTagChips`（chips 行）には合流させない

### Status
Proposed

### Context
filter-row には2系統のタグ表示がある: (1) 常時表示の chips 行（現状 `mergeTagChips(tagOptions, activeTags)` ＝「現ページ発見タグ ＋ 選択中タグ」）、(2) 本 Issue で足す ＋chip の選択肢（母集合）。母集合（全公開タグ）を chips 行のマージにも足すと、filter-row が全公開タグで膨らみモックの「数件の chip ＋ ＋chip」構造から外れる。一方、母集合は ＋chip 経由でしか到達しないと、現ページに出ない公開タグも選択できるようになり Issue の目的（母集合からの追加）を満たす。

### Decision
母集合は `PublicTopControls` の新 prop `allTags` として ＋chip（`TagAddPopover`）の選択肢にのみ渡す。chips 行の `mergeTagChips(tagOptions, active)` は変更しない（従来通り「発見タグ＋選択中タグ」）。＋chip で母集合からタグを選ぶと既存 `toggleTag` が走り、選択中タグとして chips 行に合流する（整合は既存の楽観更新フローが取る）。＋chip 選択肢側は `aria-selected = optimisticTags.has(tag)` で選択済みを示す。

### Consequences
- 良い点: chips 行はモック通りコンパクトに保たれ、母集合は ＋chip という専用入口から到達する。発見タグ・母集合・選択中タグの三者が「選択 → `toggleTag` → chips 行」の単一フローに収束し、状態の二重ソースを作らない。auth `TagPickerPopover`（listbox 選択 → 既存 `toggleTag`）と同じ作法。
- トレードオフ: 同一タグが chips 行と ＋chip 選択肢の両方に現れうる（選択肢側は `aria-selected` で区別）。これは auth 側 FilterBar でも同じ挙動であり、ユーザー混乱は最小と判断する。

---

## ADR-004: transport cap（`tags.max(8)`）到達時は ＋chip 側で追加を抑止し、`.catch(undefined)` のサイレント全消失を防ぐ

### Status
Proposed

### Context
route の `validateSearch`（`publicTopSearchSchema`）と server-fn の `renderInputSchema` はいずれも `tags: z.array(...).max(8)` を持ち、`validateSearch` 側は `.catch(undefined)` 付き。選択中タグが**9件以上**になると配列全体が検証で弾かれ `undefined` に落ち、それまでの絞り込みが**無言で全消失**する。現状の chips 行は「現ページ発見タグ（8件 cap）＋選択中」で8件超過に到達しにくかったが、本 Issue で母集合（cap 1000）から自由追加できるようにすると9件目に容易に届く。この `.max(8)` は #619 で確定済みの境界で、引き上げると AND フィルタの実用上限を別途根拠づける必要があり本 Issue のスコープを超える。

### Decision
`tags.max(8)` の値は変えず、UI 側で cap 内に閉じる。＋chip（`TagAddPopover`）で選択中タグが8件に達したら、**未選択 option を `aria-disabled`／非活性化**して9件目の追加を起こさない（既選択 option はトグル解除のため有効のまま）。完了基準に「8件超過でフィルターがサイレント消失しないこと」を含める。

### Consequences
- 良い点: transport 境界の `.max(8)` を尊重したまま、サイレント全消失という最悪の UX を構造的に防げる。schema 変更を伴わず影響範囲が UI に閉じる。
- トレードオフ: 8件選択中はそれ以上タグを足せない（auth 側にも同種の上限思想がある）。AND フィルタは件数が増えるほど結果が絞られるため実用上の制約は小さい。将来 cap を上げたくなった場合は schema と本抑止ロジックの両方を揃えて見直す。

---

## ADR-005: `listUserPublicTags` ユースケースは `application/publication/` に置く（`suggestPublicTags` の `search/` とは住み分ける）

### Status
Proposed

### Context
既存の「公開面タグ列挙」ユースケース `suggestPublicTags` は `app/core/application/search/` に在り、`tagRepository.searchPublicByNamePrefix`（**クロスオーナー・前方一致**）を呼ぶ唯一の usecase。本計画の `listUserPublicTags` は別ディレクトリ `application/publication/` に新設する。「公開タグ列挙は search/ にある」という前例と割れるため、住み分けの理由を残す必要がある。

### Decision
`listUserPublicTags` は `application/publication/` に置く。理由: `suggestPublicTags`(search/) は**クロスオーナーの検索サーフェス**（前方一致サジェスト・owner 秘匿）用であるのに対し、本ユースケースは `/u/$username` profile サーフェスの **owner-scoped 母集合**であり、同サーフェスの兄弟 `listUserPublicNotes`/`getPublicProfile` と並ぶ。`UserPublicTop` で `loadProfile`/`loadNotes` と `Promise.all` の第3レーンとして並列ロードする以上、兄弟群と同居させるのが自然。

### Consequences
- 良い点: サーフェス（クロスオーナー検索 vs 単一オーナー公開ページ）でディレクトリが分かれ、scope の住み分けが明文化される。並列ロードする兄弟ユースケースと近接配置できる。
- トレードオフ: 「公開タグ列挙」という字面が search/ と publication/ に分散する。サーフェスの違い（クロスオーナー／owner-scoped）を判断軸とすれば曖昧さはない。

---

## ADR-006: ＋chip の cap 抑止判定を純関数 `isTagAddSuppressed` に切り出し、ユニットテストする

### コンテキスト
ADR-004 の「選択 8 件到達時に未選択 option を抑止」ロジックは `TagAddPopover` 内のレンダー条件として実装できるが、計画のテスト方針（「純粋関数部を検証」）に従うと、抑止判定をテストするには Popover を開いた状態の DOM を組み立てる必要がある。しかし `Popover` の本体（option 群）は `open` のときだけレンダーされ、`renderToStaticMarkup` の SSR では既存テスト同様 `open=false`（内部 `useState`）になるため、閉じた panel の option markup は出力されず、aria-disabled をマークアップで検証できない。

### 決定
抑止判定を `isTagAddSuppressed(selectedCount, isSelected): boolean`（`selectedCount >= TAGS_MAX && !isSelected`）として export し、`nextFilterSearch` / `toggleTagSet` と同じ作法でユニットテストする。`TagAddPopover` はこの関数を呼んで `aria-disabled` と click ガードを駆動する。マークアップテストは常時レンダーされる要素（トリガー chip ラベル「タグを追加」、chips 行に母集合が漏れないこと）のみを検証する。

### 理由
- 既存の「純関数を直接テスト＋SSR マークアップは常時可視部のみ」というこのファイルのテスト作法と一致する。
- 閉じた Popover の panel をテストのために無理に開く（router/Popover の挙動モック追加）必要がなく、テストの脆さを避けられる。
- cap 境界（8 で抑止／7 以下は通す／選択済みはトグル解除のため抑止しない）を 1 関数で網羅検証できる。

### トレードオフ
判定ロジックとそれを使う JSX が分離するが、関数名と JSDoc で意図（ADR-004 の cap 抑止）を明示しているため追跡可能。

---

## ADR-007: ＋chip の listbox panel は左アンカー（`left-0`）にする

### コンテキスト
auth `TagPickerPopover` は FilterBar 内で `FILTER_POPOVER_PANEL` を使うが、公開面の sort panel は右アンカー（`SORT_MENU_PANEL` の `right-0`）。＋chip は filter-row の先頭側（タグ chips の直後、期間 chip の手前）に座るため、トリガー位置に合わせて panel のアンカーを決める必要がある。

### 決定
＋chip の panel `TAG_ADD_PANEL` は `left-0`（左アンカー）にする。sort panel の chrome（角丸・border・shadow・モバイル時の bottom-sheet 化）は流用しつつ、水平アンカーのみ左に変える。max-height ＋ overflow-y で母集合が大きい場合もスクロールに収める。

### 理由
トリガーが行の左寄りにあるため、panel を左アンカーにするとトリガー直下に開いて視線移動が最小。右アンカーだと行幅次第でトリガーから離れた位置に開きうる。

### トレードオフ
sort（右）と ＋タグ（左）で panel のアンカーが割れるが、それぞれのトリガー位置に従った結果であり一貫した原則（トリガー直下に開く）に沿う。

---
