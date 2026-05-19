# ADR — Issue #13: PR #7 残 Warning まとめ

## ADR-001: validateSearch を `(search) => schema.parse(search)` に統一する（D）

### Status
Proposed

### Context

Issue #1 の ADR-026 で「ホームルート (`/`) のみ `validateInput(noteListSearchSchema)` を残す」という意図的 divergence を採用していた。理由は:
1. `<Link to="/">` で `search` プロパティを省略可能にする UX を維持するため（`validateInput` は `unknown` に広げて受ける）
2. `router.navigate({ to: "/", search: (prev) => ... })` updater 関数の型整合のため
3. 統一すると `<Link to="/">` / `redirect({ to: "/" })` を呼ぶ 8〜10 ファイルで型エラー (`MakeRequiredSearchParams`) が発生する

Issue #13 のスコープ D は「長期的には統一が望ましい」と明示しており、今回の Issue で divergence を解消する判断が必要。

### 選択肢

- **A**: 統一を実施（`(search) => noteListSearchSchema.parse(search)` に揃え、`<Link>` / `redirect` 側に `HOME_SEARCH` を網羅追加）
- **B**: 維持（ADR-026 のまま）

### Decision

選択肢 A を採用。`HOME_SEARCH` 定数経由で `<Link to="/">` / `redirect({ to: "/" })` 全箇所に `search={HOME_SEARCH}` を付与し、ADR-026 の divergence を解消する。

### Consequences

- 良い点:
  - コード規約が完全統一され、`validateSearch` の divergence が「意図的な例外」を維持する負担が消える
  - `HOME_SEARCH` に集約することで「ホームへのデフォルト遷移」のセマンティクスがコードレベルで明示される
  - エラーフローが `ZodError` 一本化（`validateInput` 経由の `AppServerError` ラップが解消）
- トレードオフ:
  - 10〜15 ファイルの修正が必要（grep 確認済み）
  - `<Link to="/">` で `search` を毎回明示する規約になる（Sidebar の「フィルタリセット遷移」など意図的に `search={{ directoryId }}` を渡す箇所は維持）
  - 将来 `noteListSearchSchema` にフィールド追加した場合、`HOME_SEARCH` も追従更新が必要
- 関連 ADR 更新:
  - Issue #1 ADR-026 の Status を「Superseded by Issue #13 — ADR-001」に変更する
- ZodError serialization: `schema.parse(search)` で投げられる素の `ZodError` は `CodedError` を継承していないため、`extractSerializedError` → `serializeError` で `kind: "unknown"` にフォールバックする。これは既存の他 9 ルート（`search.tsx`, `views/index.tsx` 等）も同じ挙動。`validateInput` のような `kind: "validation"` への変換が必要になった場合は、別 Issue で `validateSearch` 用ユーティリティを追加する。

---

## ADR-002: bulkVisibilitySchema は publication 側に移動する（E）

### Status
Proposed

### Context

`bulkVisibilitySchema` は `app/components/note/schema.ts` で定義されているが、唯一の利用箇所は `app/components/publication/PublishSettings/action.ts` の `bulkChangeVisibilityFn`。schema の物理位置と server-fn の所在が食い違っており、規約として不整合。

### 選択肢

- **A**: `publication/schema.ts` に移動（server-fn と同居）
- **B**: `note/schema.ts` のまま、handler 側で cross-domain import を続ける

### Decision

選択肢 A を採用。`bulkVisibilitySchema` は publication ドメインのアクション schema として `publication/schema.ts` に移動する。

### Consequences

- 良い点:
  - 「schema は server-fn と同居」の規約が一貫する（`bulkMoveSchema` / `bulkTrashSchema` / `bulkExportSchema` は note/actions.ts と同居しているので note に残る）
  - `publication` ドメインで完結することで、機能追加時に「schema どこ?」と迷わない
- トレードオフ:
  - テストファイルも同時移動が必要（`publication/__tests__/` ディレクトリの新規作成を伴う）
- 追加メモ:
  - `visibilitySchema` は publication 側の既存定義（`schema.ts:5`）を流用するため再 import 不要
  - `BULK_NOTE_IDS_MAX` のみ `@/components/note/constants` から import するが、これはドメイン概念ではなく**フロントエンド共有の上限定数**のため、cross-domain import として許容範囲

---

## ADR-003: OwnedNotesResult は完全 discriminated union 化する（F）

### Status
Proposed

### Context

`OwnedNotesResult` は `mode: "filter" | "search"` フィールドで search/filter 両経路を表現するが、search 経路では以下のセンチネル値を返している (Issue #1 ADR-012〜014):
- `directoryId: ""`
- `slug: ""`
- `updatedAt: new Date(0).toISOString()`
- `visibility: "private"`（後に Issue #8 で実値化）

UI 側は `mode === "search"` で分岐しているが、型レベルではセンチネル値が「正常な値」として見えてしまうため、誤用の温床となる。

### 選択肢

- **A**: 完全 discriminated union 化 (`{ kind: "filter", ... } | { kind: "search", ... }`)、search 経路から sentinel フィールドを型レベルで除外
- **B**: 現状維持 + JSDoc で sentinel である旨を明示
- **C**: ADR-012 の本丸（`searchOwnNotes` projection 拡張で sentinel 廃止）まで先送り

### Decision

選択肢 A を採用。`presentation 層内に閉じる`変更として `OwnedNotesResult` を完全 discriminated union 化する。

domain / usecase / DTO は無変更（C の本丸対応とは独立に進められる）。

### Consequences

- 良い点:
  - 型システムで sentinel 誤用を防止できる（`note.updatedAt` を search 経路で参照しようとすると TypeScript エラー）
  - `mode` → `kind` リネームで、既存の `EditorState.autosave.kind` / `SerializedError.kind` と一貫
  - UI 側に「filter / search で扱いが違う」意図が型から明示される
- トレードオフ:
  - 消費側 5 ファイル（`NoteList`, `ListView`, `TileView`, `CalendarView`, `HomePage`）の型 narrowing 修正が必要
  - `ListView` / `TileView` の Props を「`OwnedNoteFilterItem | OwnedNoteSearchItem` を受けて `showDate` フラグで分岐」または「Props overload で kind 別に分岐」する必要がある
  - ADR-012 の本丸（search で `updatedAt` を実値化）は依然未対応。型レベルで「持たない」と表現するだけ

---

## ADR-004: discriminant フィールド名は `kind`（F）

### Status
Proposed

### Context

`OwnedNotesResult` の判別フィールド名として `mode` と `kind` のどちらを使うか。既存コードでは:
- `EditorState.autosave.kind` (`idle` / `saved` / `error` ...)
- `SerializedError.kind` (`validation` / `business-rule` ...)
- `OwnedNotesResult.mode` (`filter` / `search`) ← 既存

### Decision

`kind` に統一する。`mode` → `kind` リネーム。

### Consequences

- 良い点: discriminated union 標準慣習に揃い、「これは discriminated union である」シグナルが型コードから自明
- トレードオフ: 既存の `mode` 参照箇所をすべて更新する必要がある（grep で網羅）

---

## ADR-005: ConfirmDialog の配置先は `app/components/common/`（A）

### Status
Proposed

### Context

レビューによる事前 grep で `window.confirm` / `confirm()` の残存箇所は **5 ドメイン 6 ファイル** に及ぶことが判明:
- note 系 2 ファイル (`BulkActionBar`, `NoteActions`)
- view 系 1 ファイル (`SavedViewsList`)
- ingestion 系 1 ファイル (`IngestionJobRow`)
- trash 系 1 ファイル (`TrashRowActions`)
- tag 系 1 ファイル (`TagActions`)

配置候補:
- **A**: `app/components/note/list/ConfirmDialog.tsx`（note 主要利用箇所に置く）
- **B**: `app/components/common/ConfirmDialog.tsx`（共有 UI として切り出し）
- **C**: `app/components/ui/ConfirmDialog.tsx`（UI primitives として）

### Decision

選択肢 B を採用。`app/components/common/ConfirmDialog.tsx` に置く。

### Consequences

- 良い点:
  - 5 ドメインからの参照が cross-domain import を生まずに済む
  - `common/` 配下に置くことで、新ドメインで `confirm()` が発生した場合の追加コストが最小化される
  - `app/components/auth/` で既に `links.ts` 等の共有モジュールがあるため、`common/` という命名規約も既存パターンの延長
- トレードオフ:
  - `app/components/common/` ディレクトリの新規作成が必要（既存にない）
  - スタイルトークン (`dialogBackdrop` 等) は依然 `app/components/note/styles.ts` から import するため、common → note への import 方向が発生（styles.ts は実質「広域に使われている定数」なので将来別場所に切り出す候補だが、本 Issue では現状維持）

---

## ADR-006: useAutosave の `mountedRef` を AbortSignal で代替（B）

### Status
Proposed

### Context

`useAutosave.ts` は `mountedRef` で unmount 後の dispatch を防いでいるが、ref と「実際の取消し」が一致していない:
- `setTimeout` が走り続けている
- `await new Promise((r) => setTimeout(r, wait))` が abort できない
- in-flight な server-fn は中断できないが、結果の dispatch は防げる

### Decision

`AbortController` を `useEffect` スコープで生成し、`mountedRef` を完全に置き換える。`abortableSleep(ms, signal)` を導入して backoff 中もキャンセル可能にする。

### Consequences

- 良い点:
  - 「effect ライフサイクル」と「キャンセル可能性」が `AbortSignal` 一本に集約
  - React Strict Mode のダブル mount/unmount で古い effect が確実に死ぬ
  - backoff 中の `setTimeout` が宙に浮かない
- トレードオフ:
  - `DOMException("aborted", "AbortError")` を catch 内で握りつぶす必要がある（再 throw すると unhandled rejection）。catch 節の冒頭で `if (signal.aborted) return;` と `if (e instanceof DOMException && e.name === "AbortError") return;` の 2 つを置く（plan.md B-3 にコード例あり）
  - server-fn 自体は中断できない（TanStack Start の制約）— 「dispatch を呼ばない」レベルの中断にとどまる
- closure 関係の注意:
  - `controller` と `signal` は `useEffect` ローカル変数。`inFlightRef.current = p.finally(...)` の `.finally` callback が effect cleanup 後に走った場合、その時点で `signal.aborted === true` のため no-op になる（意図通り）
  - `schedule()` / `flush()` の関数定義も effect ローカルで、closure に古い `signal` を持つが、`signal.aborted` チェックで「古い chain」は確実に死ぬ

---

## ADR-007: useAutosave の hook シグネチャは変更しない（C）

### Status
Proposed

### Context

deps 最小化の手段として:
- **A**: `useEffect` deps を `[noteId, snapshot, state.dirtyKeys, ...]` のように個別フィールドに narrow し、`snapshot` のみ `useMemo` 化する
- **B**: hook の引数を `{ noteId, snapshot, canFlush, dispatch, saveDraft }` に再設計し、`EditorState` を hook から完全に切り離す

### Decision

選択肢 A を採用。hook シグネチャ (`UseAutosaveArgs`) は維持する。

### Consequences

- 良い点:
  - 変更面が `useAutosave.ts` 内に閉じる（呼び出し元 `NoteEditor.tsx` は無変更）
  - `shouldFlushAutosave(state, noteId)` の API 契約を維持できる
  - 既存テスト (`autosaveLogic.test.ts`) が破壊されない
- トレードオフ:
  - hook が依然 `EditorState` 構造を知る（テスタビリティは選択肢 B より低い）
  - deps の正確性をコードレビューで担保する必要がある（stale closure リスク）

---

## ADR-008: useEffect の `state` capture を `canFlush` ブール経由で切り離す（B/C 実装時）

### Status
Accepted（実装時の追加判断）

### Context

C-1/C-2 に従って `useEffect` の deps を `[noteId, snapshot, state.dirtyKeys, state.frontMatterJsonError, state.mode, state.wysiwygUnsupportedTags, state.wysiwygUnsupportedAck, dispatch, saveDraft]` に narrow したところ、Biome の `useExhaustiveDependencies` ルールが `shouldFlushAutosave(state, noteId)` 呼び出しを検出して「`state` が deps に含まれない」「個別フィールド指定は capture より specific」のエラーを 2 件出力。`biome-ignore` を当てても hook の意図とルールの厳密さが噛み合わなかった。

### Decision

`shouldFlushAutosave(state, noteId)` の結果を hook 本体の `const canFlush` に持ち上げ、effect 内では `if (!canFlush) return;` で参照する。これにより effect のキャプチャから `state` が完全に消え、deps は `[canFlush, noteId, snapshot, dispatch, saveDraft]` の 5 つだけになる。`canFlush` は毎レンダー再計算されるが pure な評価なので副作用はなく、値が変わったときだけ effect が re-run する従来挙動と一致する。

同様に `snapshotForSubmit(state)` も `state` を直接渡さず、destructure した個別フィールド (`title`, `contentHtml`, `frontMatter`, `tagInput`, `directoryId`) から `EditorState` 形のサブセットを組み立てて渡す。lint ルールは個別フィールドを正確に dep として認識でき、`biome-ignore` 不要になった。

### Consequences

- 良い点:
  - Lint エラーゼロで自然に書ける（`biome-ignore` 不要）
  - 「flush 可否」と「flush 内容」が hook 本体の 2 つの式で明示される
  - C-5（`shouldFlushAutosave` の pure 関数 API 契約）と完全互換
- トレードオフ:
  - `canFlush` 計算が毎レンダー走るが、内訳は早期 return の単純チェックなので無視できる
  - `snapshotForSubmit` に渡す形を組み立てる定型コードが増える（軽微）

---

## ADR-009: TanStack Router updater 関数で `prev: NoteListSearch` の annotation を外す（D-5 実装時）

### Status
Accepted（実装時の追加判断）

### Context

D-1 で `validateSearch` を `(search) => noteListSearchSchema.parse(search)` に統一した結果、`router.navigate({ to: "/", search: (prev) => ... })` の updater 関数で TypeScript エラーが発生。`ParamsReducerFn` は `prev` を「TanStack ルート全体の search union（広域型、`page`/`limit` が optional）」として要求するため、`(prev: NoteListSearch) => ...` と annotate すると引数型が contravariant 違反になる。

### Decision

`prev` の annotation を削除し、必要に応じて `prev as Partial<NoteListSearch>` でキャストする。updater の戻り値で `page` / `limit` が undefined にならないよう `prev.page ?? HOME_SEARCH.page`, `prev.limit ?? HOME_SEARCH.limit` で defaults を埋める。FilterBar / NoteListToolbar / DisplayModeSwitch の 3 ファイル合計 9 箇所が対象。

FilterBar には `withDefaults(prev: Partial<NoteListSearch>): NoteListSearch` ヘルパーを置いて重複を抑えた。

### Consequences

- 良い点:
  - 型エラー解消（plan.md D-5 で予告されていた具体的箇所をクローズ）
  - `prev.page` / `prev.limit` が undefined のときも home schema のデフォルトに収束するので runtime 挙動も安全
- トレードオフ:
  - `as Partial<NoteListSearch>` キャストが入る（TanStack 側が param 型を narrow できないための回避策）
  - `withDefaults` を増やすか defaults を inline で展開するかは関数ごとの判断（FilterBar は前者、NoteListToolbar/DisplayModeSwitch は後者を採用）

---

## ADR-010: TileView は filter / search を union props で受け、UI 差分は出さない（F-4 実装時）

### Status
Accepted（実装時の追加判断）

### Context

F-4 で ListView は kind 別に Props を分けて `updatedAt` 列表示を `—` プレースホルダで差し替えた。TileView は元々 `updatedAt` を描画しておらず、両 kind で UI 差分がないため、Props を discriminated union にする必要は薄い。

### Decision

TileView の Props は `notes: readonly (OwnedNoteFilterItem | OwnedNoteSearchItem)[]` の union で受け、`kind` discriminator は受け取らない。`note.title` / `excerpt` / `tagNames` / `thumbnailUrl` / `visibility` は OwnedNoteCommon の共通フィールドで両モード安全に参照できる。

### Consequences

- 良い点:
  - Props 型が単純（discriminated union の overload 不要）
  - 将来 search-mode 用の差別化（例: ヒット箇所ハイライト）を入れる際に Props を拡張する余地がある
- トレードオフ:
  - filter-kind 専用の `updatedAt` / `directoryId` / `slug` は TileView 側からは見えない（現状の TileView では参照しないので問題なし）

---

## ADR-011: CalendarView は `kind` を discriminant にし、useMemo を unconditional 呼び出しに揃える（F-5 実装時）

### Status
Accepted（実装時の追加判断）

### Context

F-5 では `kind === "search"` で早期 return するパターンを取ったが、Rules of Hooks に違反するため `useMemo` を条件式の前に置く必要がある。`search` 経路では空配列を渡して no-op にすると、`groupNotesByDay<T>` の generic が `T extends { id; updatedAt }` の制約に widening して bucket 内 `notes` から `title` 等が消失する型エラーが発生した。

### Decision

`groupNotesByDay<OwnedNoteFilterItem>(...)` で generic を明示的に固定する。`search` 経路では `groupNotesByDay<OwnedNoteFilterItem>([], tz)` を呼び、戻り値は空配列だが型は `OwnedNoteFilterItem[]` のまま保たれる。早期 return は `useMemo` 呼び出しの **後** に置く。

### Consequences

- 良い点:
  - Rules of Hooks 違反を回避
  - 型レベルで bucket の `notes` が `OwnedNoteFilterItem[]` のまま
- トレードオフ:
  - `search` 経路で空配列に対し formatter を 1 度 instantiate する（lightweight、影響なし）

---

## ADR-012: ConfirmDialog 内部 styles は note 配下の styles.ts を継続 import する（A-1 実装時）

### Status
Accepted（実装時の追加判断）

### Context

A-1 で `app/components/common/ConfirmDialog.tsx` を新規作成した際、`dialogBackdrop` / `dialog` / `dialogTitle` / `dialogActions` / `pillBtn` / `pillBtnPrimary` / `pillBtnDanger` は `app/components/note/styles.ts` に既存。共通コンポーネントが note ドメインから import する向きは多少気持ち悪いが、styles.ts 自体は「広域に使われている定数」で note 固有のものではない。

### Decision

ConfirmDialog は `@/components/note/styles` を import する。styles.ts の格上げ（例: `app/components/common/styles.ts` への移動）は別 Issue で扱う。ADR-005 Consequences にも同記述あり。

### Consequences

- 良い点: 本 Issue のスコープを膨らませない
- トレードオフ: common → note の import 方向が一時的に発生
- 関連: スタイル定数の格上げは将来の整理タスクとして残る

---

## 関連 ADR (Issue #1) の Status 更新

Issue #13 の決定により以下が Superseded となる:

- **Issue #1 ADR-012** (`OwnedNotesResult` sentinel フィールド方針) → **Superseded by Issue #13 ADR-003**: presentation 層内で discriminated union 化し、search 経路の sentinel を型から消した。本丸の `searchOwnNotes` projection 拡張は依然未着手。
- **Issue #1 ADR-013** (`OwnedNotesResult.mode` フィールド名) → **Superseded by Issue #13 ADR-004**: `mode` → `kind` へ rename した。
- **Issue #1 ADR-014** (`CalendarView` の search-mode fallback 文言) → **Superseded by Issue #13 ADR-003 / 011**: フォールバック挙動自体は維持（変更なし）。実装は `groupNotesByDay` を unconditional 呼び出しに変更し、search-mode は早期 return で文言に到達するパターン。
- **Issue #1 ADR-026** (`/` ルートの `validateSearch` divergence) → **Superseded by Issue #13 ADR-001**: 統一実施。`HOME_SEARCH` 経由で `<Link>` / `redirect` 全箇所に `search` を付与した。
