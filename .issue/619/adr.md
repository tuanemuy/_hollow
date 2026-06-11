# ADR — Issue #619: ユーザー公開ページ（P30）のデザインモック整合

## ADR-001: 公開日は `NoteListItemDTO` を拡張せず、ユースケース専用の出力型で返す

### Status
Proposed

### Context
モックのノート行は「公開日（published_at）」を表示する（メタ行「YYYY年M月D日 公開」＋右列相対表現）。現状 `listUserPublicNotes` は `NoteListItemDTO`（`updatedAt` のみ保持）を返す。公開日を出すには projection の拡張が必要。`NoteListItemDTO` は owner-scoped 一覧（管理画面）でも共用される汎用型で、`publishedAt` は公開ドメイン（`PublicationState`）固有の概念。

### Decision
`NoteListItemDTO` は変更しない。`listUserPublicNotes` 専用の出力要素型 `PublicNoteListItem`（`NoteListItemDTO & { publishedAt: string | null }`）を定義し、それを返す。公開日は UoW 内で既に保持している `publicationStateRepository.findByNoteIds(noteIds)` で bulk 取得し（N+1 回避）、id→公開日の Map を引いて projection に載せる。

### Consequences
- 良い点: 汎用 projection を公開ドメイン固有の概念で汚さず、管理画面側に波及しない。公開日の取得は既存の bulk read ポートで賄え、新規 SQL を増やさない。
- トレードオフ: 公開日取得のため publication state の追加読み出しが1回入る（既存 bulk ポートなので N+1 にはならない）。

---

## ADR-002: 楽観的更新・ソートメニュー・期間 Popover は auth 側パターンを踏襲する

### Status
Proposed

### Context
タグ/ソート/表示モードの楽観的即時反映、ソートのドロップダウン化、期間フィルターの実装が必要。auth 側ノート一覧 `app/components/note/list/FilterBar.tsx` に、共有 `Popover`（`role="menu"`/`role="dialog"`）＋ `useRovingMenu` ＋ `useOptimistic` + `useTransition` の確立済みパターンがある（期間プリセット・範囲解決は `listSelectors` の純粋関数）。

### Decision
public 面に専用の UI 機構を新設せず、`Popover` / `useRovingMenu` / `useOptimistic` / `listSelectors` の期間関数を再利用する。ソートメニューは `VisibilityPopover`（menuitemradio）を、期間 Popover は `DatePopover` を手本にする。楽観反映は `FilterBar` の `run(action, nav)`（patch ＋ navigation を1 transition でラップし navigation を await）を踏襲する。

### Consequences
- 良い点: プロジェクトに確立済みのアクセシブルなパターン（roving tabindex / 楽観同期）をそのまま使え、品質と一貫性が担保される。期間ロジックの重複実装を避けられる。
- トレードオフ: `FilterBar` は auth ルート（`/`）にバインドされ search schema も異なるため、コンポーネント自体は再利用できず P30 用に書く必要がある（ロジック関数と汎用 `Popover` は共有）。スタイルは public の `CHIP` 系へ寄せる。

---

## ADR-003: カレンダービューの日付グルーピングを公開日へ揃える

### Status
Proposed

### Context
`PublicNoteViews` のカレンダービューは `groupNotesByDay<T extends { updatedAt: string }>` で日次集計している。日付表示全体を公開日基準に変える本 Issue では、カレンダーの集計軸が `updatedAt` のままだとリスト/タイルの「公開日」表示と軸が食い違う。

### Decision
カレンダーの集計軸も公開日（`publishedAt`）へ揃える。`groupNotesByDay` のキー抽出（現状 `note.updatedAt` 直参照）を、キー取得関数を引数で受ける形に小さく一般化するか、public 用の薄いラッパで公開日キーを渡す。auth 側の既存呼び出し挙動は変えない。

### Consequences
- 良い点: リスト/タイル/カレンダーの3ビューで日付軸が公開日に統一され、モックと一貫する。
- トレードオフ: `groupNotesByDay` のシグネチャ微変更が auth 側呼び出しにも及ぶ（デフォルトで `updatedAt` を引く後方互換にすれば影響は無い）。`publishedAt` が `null` のレコードは「日付不明」バケットに落ちる（公開ノートのみなので実質発生しない）。

---

## ADR-004: 「タグを追加(＋)」UI はスコープ外とする

### Status
Proposed

### Context
モック `filter-row` には「すべて」「タグ chips」のほかに「＋ タグを追加」chip と「期間」chip がある。Issue 本文は期間フィルターは完了条件に含める一方、「タグ追加 UI の扱いは要判断」としている。タグ追加 UI を実装すると、公開面向けのタグサジェスト/発見の入力 UI とそのデータ供給（このユーザーの全公開タグ列挙など）が必要になり、バックエンドの新規クエリを含むスコープ拡大になる。現状 `tagOptions` は「現ページの一覧に出現したタグ」をサーバー発見しているだけで、全公開タグの母集合は持っていない。

### Decision
「タグを追加(＋)」UI は本 Issue のスコープ外とする。完了条件に明記されていない（「期間フィルター実装」のみ必須）こと、装飾的な追加入力でありデータ供給を含むと影響範囲が大きいことが理由。既存のタグ chips（サーバー発見タグ＋選択中タグのマージ）は維持する。必要なら別 Issue で「公開面のタグサジェスト」として切り出す。

### Consequences
- 良い点: スコープを Issue 完了条件に集中させ、肥大化を防ぐ。
- トレードオフ: モックの `filter-row` と完全一致はしない（＋ chip が無い）。これは意図的なスコープ判断。Issue 冒頭ゴール（レスポンシブ差分を除き完全一致）に対する**意図的な未達分**なので、**Phase 4 で「公開面のタグサジェスト／タグ追加 UI」として別 Issue を起票**して追跡先を残す（将来の整合性監査で「なぜ＋chipが無いか」が自明になる）。

---

## ADR-005: 期間フィルター時の note 列ソート path への公開日範囲適用方式

### Status
Proposed

### Context
期間は公開日（`published_at`）範囲でフィルタする。`publishedAt` ソート時は publication aggregate を直接見るので範囲条件を SQL に足せる。しかし `updatedAt` / `createdAt` / `title` ソート時（`listByNoteColumn`）は `noteRepository.listWithCount`（note 列ソート）で取得しており publication の公開日を見ていない。

**重要な調査結果:** `NoteOwnerFilters` には既に `dateRange?: DateRange` フィルタがあるが、アダプター（`noteRepository.ts:585-589`）はこれを **`notes.updatedAt`** に対して適用している（公開日ではない）。したがって既存の `dateRange` をそのまま流用すると「更新日」基準の絞り込みになり、モックが意図する「公開日」基準とズレる。公開日基準で一貫させるには publication 側で範囲解決する必要がある。期間を全ソート軸で一貫させるには、note 列 path でも公開日範囲で絞る必要がある。

### Decision
公開日範囲の解決は publication 側に集約する。`publicationStateRepository.listPublicNoteIdsByOwnerSorted` の `PublicNoteSortedOpts` に `publishedRange?: DateRange`（既存 VO 再利用、ADR-006）を追加し、`publishedAt` path はこれをそのまま使う。

`noteColumn` path（updatedAt/createdAt/title ソート時）は publication の公開日を見ないので、期間指定がある場合は事前に「owner ＋ 公開日範囲（＋タグ候補があればその交差）」に合致する note id 群を publication 側で解決し（既存の公開 id 列挙クエリに範囲条件を足すか、専用列挙メソッドを追加。`TAG_CANDIDATE_CAP` 相当の上限）、それを `noteRepository.listWithCount` の候補集合として渡す。

**実装方針（既存 `candidateSets` 機構への合流）:** `buildOwnerListWhere`（`noteRepository.ts:569-671`）は既に `tagIds`/`visibility`/`directoryIds`/`referencingNoteId` を `candidateSets` に集めて `intersectIdSets` で交差し、`SAFE_CHUNK_SIZE=90` で `IN` をチャンクする機構を持つ。`noteIds` フィルタは「即値の候補集合を `candidateSets` に push する」だけで `idScope` 経由のチャンク・`items.length <= total` 不変条件（`noteRepository.ts:546-552` のコメントが保証）・D1 host-var 上限（`selectInChunks` が吸収）に自動的に乗る。これにより本方式は実現可能性が高い。

**注意:** `NoteOwnerFilters.dateRange` は `notes.updatedAt` に効くため、公開日範囲フィルタとしては**使わない**。候補 id 集合（`noteIds IN (...)`）として渡す。`NoteOwnerListOpts`/`NoteOwnerFilters` に候補 id フィルタ（`noteIds`）が無ければ追加する（タグ AND が候補 id を解決して渡しているのと同じ機構を、note 列ソート path にも通す形）。

**経路マトリクス（実装者が path ごとの責務を取り違えないため固定）:**

| 解決対象 | `publishedAt` path | `noteColumn` path |
|---|---|---|
| タグ候補 | note 側で解決（`findByOwner` + `TAG_CANDIDATE_CAP`、既存191-203行）→ `noteIds` で publication へ | 同左（note 側で解決）→ `candidateSets` へ |
| 公開日範囲 | publication SQL に `gte/lt` を直接付与 | publication 側で id 解決 → `noteIds` 候補集合として `noteRepository` へ |

公開日範囲の入手経路が path で非対称（ADR-001 の公開日 projection と同型の非対称）である点に注意。タグ候補解決は両 path とも note 側で一貫する。

代替案として「期間指定中はソート軸を公開日順に制限/固定する」案も検討したが、ユーザーが期間で絞りつつタイトル順で見たいケースを潰すため不採用。最終判断は実装時のクエリ複雑度・候補集合サイズ（D1 host-variable 上限）を見て確定する。候補集合が大きすぎる懸念があれば、公開日範囲解決を `publicationStateRepository` 側の専用クエリ（範囲＋owner で id 列挙、`TAG_CANDIDATE_CAP` と同様の上限）にまとめる。

### Consequences
- 良い点: 全ソート軸で期間フィルターが一貫して効き、ユーザーの自由な組み合わせを許す。既存のタグ候補解決パターンと同型で実装でき、`items.length <= total` の不変条件も候補集合を両方に効かせれば維持できる。
- トレードオフ: note 列 path に id 解決の追加ラウンドトリップが入る。候補集合が D1 の host-variable 上限を超えないよう上限設計（`TAG_CANDIDATE_CAP` 相当）が要る。

---

## ADR-006: 期間フィルターは `DateRange` VO を使い、上限（`to`）は inclusive（終了日を含む）

### Status
Proposed

### Context
期間フィルターの境界意味論と型表現が問題になる。(1) 既存の期間表現は `DateRange = { from: Date | null; to: Date | null }`（`valueObject.ts:448`）で統一され、文字列（`YYYY-MM-DD`）→ Date 変換は presentation 層（`app/components/note/loaders.ts:136-147` の `normalizeListDateRange`）が担う規約。(2) auth 側は `to` を `new Date(to)`（その日 UTC 00:00）に変換し、アダプターで `lt(notes.updatedAt, to)` として**半開区間 `[from, to)`**＝終了日当日を除外する挙動になっている（`noteRepository.ts:589`）。P30 のカレンダー UI でユーザーが終了日を選ぶ場合、「その日を含めたい」のが自然な期待であり、半開のまま流用すると終了日当日の公開ノートが消える off-by-one バグになる。逆に素朴に `lte(publishedAt, to)` とすると `to` 当日 00:00 までしか入らず別方向にズレる。

### Decision
- **型:** ユースケース入力・ポートともに `DateRange` VO を再利用する（`publishedFrom`/`publishedTo` の生スカラを足さない）。文字列→Date 変換は presentation 境界（P30 ルートの loader / server-fn）で行い、ユースケースには `DateRange` で渡す。auth 側 `normalizeListDateRange` 相当を public 用に薄く再利用/共有する。
- **境界:** 上限 `to` は inclusive（終了日を含む）。実装は `to` を**翌日 00:00 に正規化して `lt`**（= 終了日を含む半開区間）。`from` は `gte`。境界（from のみ / to のみ / 同日 from=to / 終了日当日が含まれること）はユニットテスト必須。
- **VO 契約は保つ:** `DateRange` の JSDoc は「半開 `[from, to)`」を型レベル契約として宣言（`valueObject.ts:444-446`、auth と共有）。本決定はこの契約を**変えない**。presentation 境界で `to` フィールドに「翌日 00:00（排他境界）」を詰めることで inclusive を達成する（VO の意味論を inclusive に書き換えない）。これにより auth 側との契約衝突を避ける。
- ルート schema は auth 側 `noteListSearchSchema` に合わせ `z.string().date().optional().catch(undefined)` を使う（独自 regex は使わない）。

### Consequences
- 良い点: 既存 VO・変換層の規約と一貫し、文字列→Date 変換がユースケースに漏れない。終了日 inclusive でユーザーの直感に合い、off-by-one を防ぐ。
- トレードオフ: auth 側（`to` 当日除外の半開）とは `to` の意味論が異なる。これは意図的な差分であり、本 ADR に明記して将来の混乱を防ぐ。public 用の正規化ヘルパ（翌日 00:00 化）を別途用意する必要がある。

---

## ADR-007: 実装時に下した補足的設計判断（#619 実装）

### Status
Accepted（実装時）

### Context
実装中に plan / ADR-001〜006 で完全には固定されていなかった細部の判断を下した。

### Decision
- **`noteColumn` path の公開日範囲解決は専用メソッド `listPublicNoteIdsByOwnerInRange` を新設**（ADR-005 が示唆した「専用列挙メソッド or `candidateSets` 合流」のうち、列挙メソッド側を採用）。`PublicNoteSortedOpts.publishedRange` は `publishedAt` path 用に追加し SQL に `gte/lt` を直接付与。`noteColumn` path は `listPublicNoteIdsByOwnerInRange(owner, range, cap=1000)` で id を解決し、`NoteOwnerFilters` に新設した `noteIds` 候補フィルタ経由で `buildOwnerListWhere` の `candidateSets` に push（ADR-005 の合流機構に乗る）。これにより両 path で公開日範囲が効き、`items.length <= total` 不変条件を維持する。
- **`NoteOwnerFilters.noteIds`** を新設（即値の note-id 候補集合）。空配列は `intersectIdSets` で「match nothing」に短絡する既存挙動に自然に乗る。
- **公開日 projection は文字列日付（`PublicationState.publishedAt.toISOString()`）で Map 化**し、両 path 確定後の `liveNotes` id 群に対し `findByNoteIds` を1回だけ呼ぶ（ADR-001 通り）。
- **公開日範囲の文字列→Date 変換は新規 presentation ヘルパ `normalizePublicDateRange`（`app/components/public/publicDateRange.ts`）に集約**。`to` を翌日 00:00（UTC）に正規化して inclusive を達成（ADR-006）。`UserPublicTop`（server component）が呼んでユースケースへ `DateRange` を渡す。
- **`PublicTopControls` の楽観 state はタグ・ソート・期間のみ**（`display` は除外、ADR-002 / S-004 通り）。ルートのラッパ `<div className="contents" aria-busy>` で `display: contents` を使い、filter-row / toolbar を `.user-tools` の直接 flex 子に保ったまま `aria-busy` を付与（既存のレイアウト gap を壊さない）。
- **`formatRelativeDate(date, now)` の相対ルール**: 今日／昨日／同年は「M月D日」／年跨ぎは「YYYY年M月D日」。モックには「今日」「M月D日」しか現れないが、昨日・年跨ぎも自然な拡張として実装（純粋関数・テスト済み）。「今日／昨日」判定はローカルカレンダー日で行う（client island なのでクライアント TZ）。

### Consequences
- 良い点: ADR-005 の方式を最小の新規 SQL（列挙1本）で実現。projection・期間の両方が path 差を吸収して1点に集約され、保守が容易。
- トレードオフ: `noteColumn` path に公開日 id 解決の追加ラウンドトリップが1回入る（`TAG_CANDIDATE_CAP` 相当の `cap=1000` で host-var 上限は `selectInChunks` が吸収）。

---
