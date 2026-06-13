# 実装計画 — Issue #654: 公開ページ(P30)の「タグを追加(＋)」UI（公開面タグサジェスト）を実装する

**Issue:** #654
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

P30 ユーザー公開ページの `filter-row` に「＋ タグを追加」chip を実装し、このユーザーの公開ノートに付与された全タグ（母集合）から選んで `tags` フィルターに追加できるようにする。#619 ADR-004 で意図的に残したモック未達分（＋chip 欠落）を解消する。

## 受け入れ基準

各 AC の対応ステップは **実装**（その AC を満たすコードを供給するステップ）と **検証**（テスト／手動でその AC を確認するステップ）を分けて記す。

| # | 基準（検証可能な形で） | 由来 | 実装ステップ | 検証 |
|---|---|---|---|---|
| AC-1 | `/u/$username` の `filter-row` に「＋ タグを追加」chip が表示され、モック（`P30-user-public-top.html` **570-573行**＝Plus アイコン 11px・stroke 2.2 ＋「タグを追加」）の構造・見た目に一致する。トリガーの見た目は公開面 `CHIP` クラス（実線 pill）であり auth 側の破線 `filterChipGhost` ではない | Issue 本文「完了でモックの filter-row が完全一致」 | 6 | 手動 |
| AC-2 | ＋chip を開くと、このユーザーの**公開ノートに付与された全タグ名**（母集合）が選択肢として列挙される。現ページ一覧に出現していないタグも含む | Issue 本文「全タグ（母集合）を列挙する読み取り経路」 | 1, 2, 3, 5, 6 | 手動（integration: step 3 の SQL） |
| AC-3 | 母集合は**公開可視性で gate** される。非公開のみに付いたタグは選択肢に出ない | Issue 本文「公開可視性で gate」 | 1, 3 | integration（step 3） |
| AC-4 | 母集合の列挙には**件数上限**がかかる（上限超過時も破綻しない） | Issue 本文「件数上限を設ける」 | 2, 3 | integration（step 3 の SQL LIMIT） |
| AC-5 | ＋chip からタグを選択すると `tags` フィルターに追加され、既存タグ chips・期間フィルターと同じ楽観更新／URL 反映の作法で即時反映される。**選択タグ数が transport cap（route schema `tags.max(8)`）に達したら ＋chip 側で以降の追加を抑止し、サイレント全消失（`.catch(undefined)`）を起こさない** | Issue 本文「既存と同じ楽観更新/URL 反映の作法」 | 6 | UI 配線ユニット＋手動 |
| AC-6 | 既存のタグ chips（サーバー発見タグ＋選択中タグのマージ）と整合し、**chips 行内**で選択中タグの欠落や二重表示が起きない（chips 行と ＋chip 選択肢に同一タグが両方出る重複は ADR-003 で意図的に許容する） | Issue 本文「既存のタグ chips との整合」 | 6 | 手動 |

## スコープ

### 含まれないもの
- **タグの自由入力（テキスト検索／前方一致サジェスト）** — モックの「＋ タグを追加」は母集合からの選択 UI であり、auth 側 `TagPickerPopover` も listbox 選択型。公開検索画面用の `searchPublicByNamePrefix`（前方一致）はクロスオーナーの別サーフェスであり本 Issue の対象外。母集合は「このユーザーの公開タグ全件（上限内）」を列挙する。
- **タグの noteCount 表示** — auth 側 `TagPickerPopover` は `noteCount` を併記するが、公開面の母集合読み取り経路は tag 名のみを返す軽量経路とする（noteCount は別集計が要りスコープ拡大になる。モックにも件数表記は無い）。
- **期間／ソート／表示モードの挙動変更** — #619 で実装済み。本 Issue は filter-row へ chip を1つ足すだけで既存挙動は変えない。
- **クロスオーナーのタグ列挙／owner 露出** — 本 Issue の母集合は **owner-scoped（このユーザーの公開タグのみ）・tag 名のみ**を返す。`searchPublicByNamePrefix`（クロスオーナー・前方一致・名前のみで owner を秘匿）とはサーフェスが異なり、owner を露出する経路も他オーナーのタグを混ぜる経路も作らない（差分は ADR-001 参照）。
- **選択タグ数の transport cap 自体の引き上げ** — route schema の `tags.max(8)` は #619 で確定済みの境界。本 Issue では cap 値は変えず、＋chip 側で cap 到達時の追加を抑止する（ADR-004）。`.max(8)` を引き上げる案は AND フィルタの実用上限を別途検討する必要があり対象外。

## 調査結果

- 関連ファイル:
  - `app/components/public/PublicTopControls.tsx` — filter-row の client island。タグ chips・期間 Popover・ソート・表示モードを楽観 state（`useOptimistic`+`useTransition`）で扱う。`mergeTagChips(tagOptions, active)` が「サーバー発見タグ＋選択中タグ」をマージ。`run(action, patch)` が楽観 patch＋URL navigation を1 transition でラップ。`toggleTagSet` でタグ集合をトグル。
  - `app/components/public/UserPublicTop.tsx` — server component。`tagOptions` を「現ページ一覧に出現したタグ」から `notes.flatMap(n => n.tagNames)` で算出し（8件 cap）`PublicTopControls` に渡す。`loadProfile`/`loadNotes` を `cache(serverData(...))` で並列ロード。
  - `app/routes/u/$username/index.tsx` — ルート。`tags`（loader dep, AND フィルタ）/`sort`/`from`/`to`/`display` の search schema・loader 配線。母集合は loader dep に依存しない（URL で変わらない）。**transport cap に注意**: `validateSearch` の `publicTopSearchSchema`（37行）は `tags: z.array(z.string().min(1).max(64)).max(8).optional().catch(undefined)`、server-fn 側 `renderInputSchema`（52行）も `tags: ...max(8)`。つまり選択タグが**9件以上**になると `validateSearch` / server-fn 入力検証が**配列全体を弾き `undefined` に落ちる**（＝それまでの絞り込みがサイレントに全消失）。現状の chips 行は「現ページ発見タグ（8件 cap）＋選択中」で8件超過に到達しにくかったが、母集合追加で容易に9件目に届くため ＋chip 側で cap 内に閉じる必要がある（ADR-004・リスク欄・step 6）。
  - `app/core/application/publication/listUserPublicNotes.ts` — 公開ノート一覧ユースケース。publication state を gate に使い、tag AND フィルタを id 解決して候補集合で渡す。`PublicNoteListItem` projection。
  - `app/core/application/publication/getPublicProfile.ts` — 公開プロフィール読み取り。`publicationStateRepository.findPublicByOwner(ownerId, {limit:1000})` で公開ノート件数を出す。母集合の供給元として親和性が高い。
  - `app/core/domain/tag/ports/tagRepository.ts` — `searchPublicByNamePrefix(prefix, limit)` が既に「`note_tags` × `notes(active)` × `publication_states(public)`」の公開 gate JOIN で**クロスオーナー**の distinct tag 名を返す。本 Issue で要るのは**owner-scoped・prefix なし**の母集合列挙であり、同型の JOIN を owner 条件付きで足せばよい。
  - `app/core/adapters/d1/repositories/tagRepository.ts:245-282` — `searchPublicByNamePrefix` の実装（`selectDistinct({name}).from(tags).innerJoin(noteTags).innerJoin(notes,active).innerJoin(publicationStates,public)`）。新メソッドはこの JOIN を雛形に owner 条件を追加・prefix を除去するだけ。
  - `app/components/note/list/FilterBar.tsx:463-562` — auth 側 `TagPickerPopover`。「＋ タグ」ghost-chip トリガー＋ multi-select listbox（`Popover haspopup="listbox" multiselectable` ＋ `useRovingMenu(itemRole:"option")`）。各 option クリックで `onToggle` → 既存の楽観 `toggleTag`。公開面 ＋chip の手本。
  - `spec/design/pages/P30-user-public-top.html:564-578` — filter-row モック全体。＋chip 本体は **570-573行**：`chip` クラス（既存タグ chip と同じ実線 pill。auth 側の破線 `filterChipGhost` ではない）＋ plus アイコン（11px, stroke 2.2）＋「タグを追加」ラベル。
- あるべきアーキテクチャ:
  - ヘキサゴナル + DDD。依存方向は presentation → application → domain。母集合列挙は**読み取り経路**であり、公開可視性 gate は publication 集約が握る不変条件。tag 名の列挙責務は tag ドメインが持ち、公開 gate JOIN は read-only SQL としてアダプターに置く（`searchPublicByNamePrefix` と同じ作法 — owner はクロスオーナーでは秘匿だが本 Issue は owner-scoped なので tag 名のみ返せば足りる）。
  - Input validation は transport 境界（route の `validateSearch` / server-fn の `inputValidator`）と VO 構築の2点のみ。母集合は username だけを入力に取る読み取りなので追加の transport 入力は不要。
  - 件数上限（cap）はアダプター SQL の `LIMIT` で表現し、ポート契約（JSDoc）に明記する（`searchPublicByNamePrefix` の `limit` 引数、`findPublicByOwner` の `{limit:1000}` と同じ作法）。
- 既存実装の状態:
  - `tagOptions` は「現ページ一覧の出現タグ（8件 cap）」のみで母集合を持たない（#619 ADR-004 が指摘した通り）。本 Issue で母集合の読み取り経路を新設し、`tagOptions`（発見タグ）と**別の prop**として供給する。`mergeTagChips` は現状「発見タグ＋選択中タグ」をマージしており、母集合は ＋chip の選択肢として渡すので chips 行のマージ対象には足さない（filter-row が母集合全件で膨らむのを防ぐ）。整合方針は ADR 参照。
- 依存関係:
  - tag ドメインポート `TagRepository` に新メソッド追加 → D1 アダプター実装 → ユースケース（または既存ユースケース拡張）→ `UserPublicTop` ローダー → `PublicTopControls` の新 prop。tag ポート実装は D1 が唯一（`find /core/adapters` で確認済み）なので影響アダプターは1つ。**ただしポート追加で typecheck が壊れるフル実装ダブルがもう1つある**: テストの `FakeTagRepo`（`app/core/domain/tag/__tests__/service.test.ts:27` の `implements TagRepository`）。`grep -rn "implements TagRepository"` でフル実装は `D1TagRepository` と `FakeTagRepo` の2つのみで、後者に新メソッドの空スタブが必須（step 4）。

## 設計

### ドメインモデルへの影響

- **`TagRepository` ポートに owner-scoped 公開タグ母集合の列挙メソッドを1つ追加**する。

  ```ts
  /**
   * Owner-scoped distinct tag names linked to at least one public + active
   * note (`note_tags` × `notes(active)` × `publication_states(public)`).
   * The public gate is the enumeration guard: a tag attached only to
   * private/trashed notes never surfaces. Ordered by name asc. Capped at
   * `limit` (the master-set bound for the public filter-row's "+タグ" picker).
   */
  listPublicTagNamesByOwner(
    ownerId: UserId,
    limit: number,
  ): Promise<readonly string[]>;
  ```

  - エンティティ・VO・不変条件の新規追加はなし（既存の公開可視性 gate を read-only 列挙で再利用するだけ）。`searchPublicByNamePrefix` と同じ「クロスドメイン JOIN を read-only SQL でアダプターに閉じる」方針に従う。tag 名の列挙責務は tag ドメインが持つのが自然（publication 集約は note id しか返さない設計 — `publicationStateRepository` の JSDoc が「plain id-shaped projection」を宣言）。

  - 配置の別案（publication ドメインに置く）と不採用理由は ADR-001 参照。

### ユースケース / アプリケーションロジック

- 母集合の供給は**新規ユースケース `listUserPublicTags` を追加**する。`getPublicProfile` への相乗りは避ける（profile 読み取りの責務肥大化を防ぐ。`UserPublicTop` は既に `loadProfile`/`loadNotes` を**並列**実行しており、母集合ロードを3本目として並列に足すのが自然）。

  ```ts
  export type ListUserPublicTagsInput = Readonly<{ username: string }>;
  export type ListUserPublicTagsOutput = Readonly<{ tagNames: readonly string[] }>;
  ```

  - `Username.create(input.username)` で VO 構築 → UoW 内で `userRepository.findByUsername` →（deleted/suspended は `NotFoundError`、`listUserPublicNotes`/`getPublicProfile` と同じ guard）→ `tagRepository.listPublicTagNamesByOwner(user.id, PUBLIC_TAG_MASTER_CAP)` を呼び `{ tagNames }` を返す。
  - cap 定数 `PUBLIC_TAG_MASTER_CAP` をユースケースに置く（`listUserPublicNotes` の `TAG_CANDIDATE_CAP=1000` と同じ作法でユースケース層が上限を決める）。値は ADR-002 参照。
  - `app/core/application/publication/index.ts` に re-export を追加。

### アダプター / 永続化 / 外部連携

- `app/core/adapters/d1/repositories/tagRepository.ts` に `listPublicTagNamesByOwner` を実装。`searchPublicByNamePrefix`（245-282行）の JOIN を雛形に、(1) prefix の `LIKE` 条件を除去、(2) `eq(notes.ownerId, ownerId)`（owner-scope）を追加、(3) `selectDistinct({name})` ＋ `orderBy(asc(tags.name))` ＋ `.limit(limit)` を維持。
- スキーマ変更・マイグレーションは**なし**（既存の `tags` / `note_tags` / `notes` / `publication_states` で完結）。
- フェイク／テスト用リポジトリ（`tagRepository` のインメモリ実装があれば）にも同メソッドを実装する（テスト方針参照）。

### UI / プレゼンテーション

- `app/components/public/UserPublicTop.tsx`:
  - `loadPublicTags = cache(serverData(() => import(".../listUserPublicTags"), ...))` を追加し、`Promise.all` に3本目として並列実行。`isNotFoundError` は `loadNotes`/`loadProfile` と同じく `notFound()` に変換。
  - 取得した `tagNames`（母集合）を `PublicTopControls` の**新 prop `allTags`** として渡す。既存の `tagOptions`（発見タグ）はそのまま維持。
- `app/components/public/PublicTopControls.tsx`:
  - props に `allTags: readonly string[]` を追加。
  - filter-row の期間 Popover の手前（モックの並び：タグ chips → ＋chip → 期間）に `TagAddPopover` を追加。**借用元は2つで別物**: 構造・挙動（listbox 選択ロジック＝`Popover haspopup="listbox" multiselectable` ＋ `useRovingMenu(itemRole:"option", restoreFocusOnCommit:true)`、各 option クリックで既存 `toggleTag(tag)` → `run` 経由の楽観更新）は auth `TagPickerPopover`（FilterBar.tsx 463-562）を**手本にする**。一方トリガー chip の**見た目は公開面 `CHIP` クラス**（`app/components/public/styles.ts:105`、実線 pill）であり、auth の破線 `filterChipGhost`（`note/list/styles.ts:80`）は流用しない。
  - 選択肢の `aria-selected`/`data-active` は `optimisticTags.has(tag)` で表現（chips と同じ楽観 state を共有）。
  - chip トリガーはモック構造（`CHIP` クラス＋ Plus アイコン 11px・stroke 2.2 ＋「タグを追加」、`P30-user-public-top.html` 570-573）に合わせる。
  - **transport cap（`tags.max(8)`）の抑止**: 選択中タグが8件に達したら、未選択 option を無効化（`aria-disabled`／非活性化）して9件目の追加を起こさない（既選択 option はトグル解除のため有効のまま）。これにより `.catch(undefined)` によるフィルターのサイレント全消失を防ぐ（ADR-004）。
  - `mergeTagChips` は変更しない（chips 行は従来通り「発見タグ＋選択中タグ」のまま）。母集合は ＋chip の選択肢としてのみ使い、整合は「選択すると `toggleTag` → 選択中タグとして chips 行に出る」既存フローで取る（ADR-003）。
  - **母集合 option の文字列同一性**: ＋chip の選択判定は「母集合 option の文字列 ＝ `toggleTag` に渡す引数 ＝ URL `tags` 値」で閉じる。母集合は `tags.name` を distinct で返すため、option を選ぶと同一の表示名文字列が `toggleTag`→URL `tags` に流れ、`optimisticTags.has(tag)` の選択判定が崩れない（`tagOptions` と `allTags` が別経路でも表記揺れで `aria-selected` がズレない）。

## 実装ステップ

### 1. tag ポートに母集合列挙メソッドを追加

- **対象ファイル:** `app/core/domain/tag/ports/tagRepository.ts`
- **変更内容:** `listPublicTagNamesByOwner(ownerId: UserId, limit: number): Promise<readonly string[]>` を interface に追加し、公開 gate・owner-scope・cap・順序を JSDoc で明記。
- **理由:** 母集合列挙はレイヤー内側の契約。tag 名の列挙責務を tag ドメインに置き、公開可視性 gate を契約として宣言する。

### 2. ユースケース `listUserPublicTags` を追加

- **対象ファイル:** `app/core/application/publication/listUserPublicTags.ts`（新規）、`app/core/application/publication/index.ts`
- **変更内容:** username → user 解決（deleted/suspended guard）→ `listPublicTagNamesByOwner(user.id, PUBLIC_TAG_MASTER_CAP)` → `{ tagNames }`。cap 定数を定義。index に re-export。
- **理由:** プレゼンテーションへ母集合を供給する読み取りユースケース。profile 読み取りと責務分離し並列ロード可能にする。

### 3. D1 アダプターに `listPublicTagNamesByOwner` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/tagRepository.ts`
- **変更内容:** `searchPublicByNamePrefix` の JOIN を雛形に、owner-scope 条件追加・prefix 除去・`selectDistinct({name})`/`orderBy(asc(name))`/`limit` で実装。`mapDbError` でラップ。雛形にある `if (limit <= 0) return []` 早期 return ガード（`tagRepository.ts:252`）は**踏襲して残す**（防御。`PUBLIC_TAG_MASTER_CAP` 固定渡しで 0 にはならないが雛形の作法を揃える）。prefix の `trim`/空文字 return／`LIKE` 条件は除去する。
- **理由:** 公開 gate JOIN は read-only SQL としてアダプターに閉じる（既存作法）。

### 4. ポート追加で壊れる既存テストダブルへスタブを追加し、ユースケース検証を整える

- **対象ファイル（typecheck 修復・必須）:**
  - `app/core/domain/tag/__tests__/service.test.ts` の `FakeTagRepo`（27行〜）。これは `class FakeTagRepo implements TagRepository` の**フル実装**で、`searchPublicByNamePrefix`（47行）まで全メソッドをスタブしている。ポートに `listPublicTagNamesByOwner` を足すと `implements` が新メソッド不足で**必ず型エラー**になる。`async listPublicTagNamesByOwner() { return []; }` の空スタブを足す（`TagService` は本メソッドを使わないので空で十分）。
  - **フル実装ダブルはこの `FakeTagRepo` と本番の `D1TagRepository` の2つのみ**（`grep -rn "implements TagRepository" app/` で確認済み。インメモリ tag アダプターは存在しない）。`app/core/application/view/__tests__/fakes/container.ts` の `makeTagRepoStub` は `as unknown as TagRepository` の**部分スタブ**なのでポート追加では壊れず、ここは触らない。
- **ユースケース `listUserPublicTags` の検証方針（既存作法に合わせて修正）:**
  - 既存の publication 読み取りユースケース `listUserPublicNotes` は**ユニットテストを持たず integration test（`setupTestContainer` の実 DB）のみ**で検証している（`__tests__/listUserPublicNotes.integration.test.ts`）。`view/__tests__/fakes/container.ts` は **view 層 savedViews 専用**のミニ UoW で `userRepository` スタブを持たないため、`userRepository.findByUsername` を呼ぶ `listUserPublicTags` のユニットテストには流用できない（user repo スタブ＋context 拡張が要り「ポート追加だけでは壊れない」前提とは別問題）。
  - したがって母集合 gate の本質（公開のみ／private-only 非出現／別オーナー混入なし／cap／orderBy）の検証は **step 3 の D1 アダプター integration test に一本化**する。`listUserPublicTags` 自体は「username 解決 → deleted/suspended guard → 委譲」の薄いオーケストレーションなので、ユースケースのテストを書く場合は `listUserPublicNotes` と同じ integration test（実 DB ＋ `setupTestContainer`）で deleted/suspended guard を1〜2ケース足す形にする。フェイクでのユニットテストは新設しない。
- **理由:** ポート拡張で必ず壊れる `FakeTagRepo` を typecheck グリーンに保ち（`CLAUDE.md` の「変更後 `pnpm typecheck` が通ること」）、gate 検証を実 DB に寄せる publication 既存作法と整合させる。

### 5. ローダーで母集合を供給

- **対象ファイル:** `app/components/public/UserPublicTop.tsx`
- **変更内容:** `loadPublicTags` を `cache(serverData(...))` で追加し `Promise.all` に並列で足す。取得 `tagNames` を `PublicTopControls` の `allTags` prop へ渡す。
- **理由:** 母集合は loader dep に依らない（URL で変わらない）読み取り。並列ロードで追加レイテンシを最小化。

### 6. ＋chip（TagAddPopover）を実装

- **対象ファイル:** `app/components/public/PublicTopControls.tsx`
- **変更内容:** `allTags` prop 追加。`TagAddPopover`（**挙動＝listbox＋roving 選択ロジックのみ** auth `TagPickerPopover` を手本に、**見た目＝公開面 `CHIP` クラス**で auth の破線 `filterChipGhost` は使わない）を filter-row のタグ chips と 期間 Popover の間に追加。option クリックで既存 `toggleTag` を呼び楽観更新。トリガー chip をモック構造（`CHIP` ＋ Plus 11px/stroke 2.2、570-573行）に合わせる。**選択中タグが8件に達したら未選択 option を `aria-disabled` で抑止**し、`tags.max(8)` 超過による `.catch(undefined)` のサイレント全消失を防ぐ（ADR-004）。
- **option の列挙ソースと選択判定の分離（ADR-003 の実装手順化）:** ＋chip の option は `allTags` を**直接 map** し、選択判定だけ `optimisticTags.has(tag)` を共有する。chips 行が描く `mergeTagChips(tagOptions, [...optimisticTags])` の派生配列（`chips`）は **＋chip に流用しない**。「列挙ソースは別（chips 行＝発見＋選択中／＋chip＝母集合）、選択判定 state のみ共有」を守ることで、母集合が chips 行へ漏れて filter-row が膨張するのを防ぐ（ADR-003）。
- **理由:** モック filter-row の ＋chip を完成させ、既存の楽観更新／URL 反映フローに合流させる。transport cap との衝突を UI 側で閉じる。

## 設計判断

母集合列挙の配置（tag ドメイン）、件数上限の値、既存 `tagOptions`／`mergeTagChips` との整合方針、transport cap 到達時の UI 抑止、ユースケース配置の住み分けにトレードオフがあるため `adr.md` に記録（ADR-001〜005）。

## リスクと注意点

- **公開可視性 gate の取り違え** — 母集合は「公開ノートに付いたタグ」のみ。private/trash のみに付いたタグが漏れると情報漏洩。JOIN を `searchPublicByNamePrefix` の公開 gate と完全一致させ、owner 条件を必ず付ける（クロスオーナー漏れ防止）。テストで private-only タグの非出現を検証。
- **件数上限超過時の挙動** — cap で切られた場合、母集合が一部欠ける（モック完全一致は維持されるが選択肢が一部出ない）。現実的な単一オーナー公開タグ数を大きく上回る cap を取り破綻を防ぐ（ADR-002）。
- **発見タグ／母集合／選択中タグの三者整合** — chips 行（発見＋選択中）と ＋chip 選択肢（母集合）で同じタグが両方に出る。選択肢側は `aria-selected` で選択済みを示し、選択すると chips 行に合流する（二重の URL 反映や状態不整合が起きないこと）。`mergeTagChips` は変更しないことで chips 行の膨張を防ぐ。
- **追加ロードのレイテンシ** — 母集合ロードを `Promise.all` の3本目として並列化し、直列追加を避ける。
- **ソート軸が `publishedAt` 以外でも母集合は不変** — 母集合は sort/period/page に依存しない。loader dep に含めず、URL 変化で再フェッチしない（`tagOptions` と性質が異なる点に注意）。
- **transport cap（`tags.max(8)`）超過によるフィルターのサイレント全消失** — route `validateSearch`／server-fn `renderInputSchema` の `tags` は `.max(8)` で、9件目が入ると配列全体が `.catch(undefined)` で落ち、それまでの絞り込みが**無言で全消失**する。母集合（cap 1000）から自由追加できるようになると現実的に到達する。＋chip 側で選択数が8に達したら未選択 option を抑止して cap 内に閉じる（step 6・ADR-004）。完了基準として「8件超過時にフィルターがサイレント消失しないこと」を手動検証に含める。
- **＋chip listbox の DOM 件数（cap=1000 規模）** — 母集合が cap 上限まで膨らむと `useRovingMenu({ itemCount: allTags.length })` の option が最大 1000 件になる。auth `TagPickerPopover` は owner の全タグ listbox を既に同じ作法で許容しており、公開オーナーの公開タグ数は通常十数件オーダーなので実運用上問題ない。仮想スクロール等の最適化はスコープ外（ADR-002 のトレードオフと整合）。

## テスト方針

- **インテグレーション（D1 アダプター `listPublicTagNamesByOwner`）— gate 検証の本体:** 実 DB で public+active note に付いたタグだけ distinct で返る／private・trashed note のタグが除外される（private-only 非出現）／別オーナーのタグが混ざらない（owner-scope）／`orderBy name asc`／`limit`（cap）が効く／公開ノートが無いオーナーで空配列。`pnpm test:integration`。母集合 gate の本質はここに一本化する。
- **インテグレーション（ユースケース `listUserPublicTags`）— 任意:** 書く場合は `listUserPublicNotes.integration.test.ts` と同じ実 DB ＋ `setupTestContainer` で、username 解決＋deleted/suspended guard で `NotFoundError` を1〜2ケース確認する。フェイクでのユニットテストは新設しない（view fakes container は user repo 不在で流用不可。step 4 参照）。
- **ユニット（UI 配線）:** `PublicTopControls` の ＋chip option クリックが `toggleTag`→`nextFilterSearch` の patch を生む／**選択8件到達時に未選択 option が抑止され9件目の patch が生まれない**（既存 `nextFilterSearch`/`toggleTagSet` のテスト作法に合わせ純粋関数部を検証）。
- **手動／ブラウザ:** `/u/<username>` の filter-row が `P30-user-public-top.html` の filter-row と一致（＋chip 表示・配置、`CHIP` 実線見た目）。＋chip を開き母集合が列挙され、選択すると即時に chips 行へ反映＆ URL `tags` 更新。private-only タグが選択肢に出ない。**選択を8件まで増やすと9件目の option が抑止され、フィルターがサイレント消失しない**ことを確認。`testing.md`（manual-test スキル）に詳細を委譲。

## レビュー履歴

### 1周目

**反映した指摘**: coverage [P-001]（`tags.max(8)` cap 超過のサイレント全消失）／arch [P-001]・coverage [P-002]（ポート追加で壊れる `FakeTagRepo` の列挙＋テスト方針を integration 一本化に修正）／arch [S-001]（ユースケース配置の住み分けを ADR-005 に追記）／arch [S-002]（＋chip は見た目＝公開面 `CHIP`・挙動のみ auth `TagPickerPopover` 参考と明確化）／arch [S-003]（cap=1000 規模 listbox の DOM 判断を一行追記）／arch [S-004]（`limit<=0` 早期 return ガードの踏襲を step 3 に明示）／coverage [S-001]（モック参照行を 570-573 に統一）／coverage [S-002]（AC 表を実装／検証ステップに分離）／coverage [S-003]（AC-6 を chips 行内の二重表示・欠落に限定し ADR-003 の重複許容と矛盾しない表現に）／coverage [S-004]（スコープ「含まれないもの」に owner-scoped・クロスオーナー秘匿差分を追加）。

**主な変更**:
- 受け入れ基準表を「実装ステップ」「検証」に分離し、AC-5 に cap 抑止条件、AC-6 を chips 行内に限定、AC-1 に CHIP 見た目を明記。
- 母集合追加が route schema `tags.max(8)` の `.catch(undefined)` 全消失に衝突する点を調査結果・リスク・step 6 に反映し、＋chip 側で8件到達時に未選択 option を抑止する方針を確定（ADR-004 新設）。
- step 4 を「`FakeTagRepo`（フル実装ダブル）に空スタブ必須＋ gate 検証は D1 integration に一本化、フェイクユニットは新設しない」に書き換え。`makeTagRepoStub`（部分スタブ）は無変更と明記。
- ユースケース配置の `publication/` vs `search/` 住み分け理由を ADR-005 に追記。

### 2周目

2周目: 両視点とも問題点ゼロで終了。arch-risk の改善提案 S-001/S-002（step6 の母集合option実装詳細）を反映。
