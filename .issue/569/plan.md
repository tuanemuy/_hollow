# 実装計画 — Issue #569: 領域3 P18 タグ管理の未追従機能（検索・ソート・最終使用列）

**Issue:** #569
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

P18 タグ一覧画面（`spec/design/pages/P18-tags.html`）が「別Issue引き渡し」として見送った未追従機能のうち、本PRでは **A. 検索 / B. ソート / C. 最終使用日時の列（＋最終使用ソート軸）** を追従する。

## スコープ

### 含まれるもの

- **A. タグ一覧の検索** — URL 検索パラメータ `q` を `validateSearch` → loader → `listTags(query)` に配線し、検索フォーム UI を追加。backend（`listTags` / `tagRepository.findByOwner` の LIKE 検索）は実装済みのためフロント配線中心。
- **B. タグ一覧のソート** — URL パラメータ `sort` / `order` を配線し、ソート切替 UI を追加。backend のソートも実装済み。
- **C. 最終使用日時の列（＋最終使用ソート軸）** — `note_tags` 経由の `MAX(notes.updatedAt)` を read-time 集約で導出し、`TagWithNoteCount` → `TagDTO` に `lastUsedAt` を載せ、列表示とソート軸 `lastUsedAt` を追加。**列追加 + migration ではなく集約クエリ拡張**で実現（ADR-001）。

### 含まれないもの

- **D. タグ統合のバックグラウンド進捗バナー** — 非同期ジョブ基盤（outbox + relay worker + 進捗ポーリング/SSE）を要する大規模項目。ユーザー合意のもと本PRスコープ外とし、Phase 4 で別Issueへ切り出す。`styles.ts` の `progressTrack` / `progressBarIndeterminate` は触らない。
- スコープ外のリファクタ・他画面への波及。

## 前提（デザインモックの扱い）

`P18-tags.html` の L400 注記のとおり、モックは検索・ソート・最終使用列の **UI を持たない**（別Issue引き渡しとして意図的に省略）。よって本PRの A/B/C の UI は新規だが、モック内に既存定義のあるデザイン言語（ヘッダ `.search`、汎用 `.segmented`、`.tag-count` のレスポンシブ規約）とデザイントークンに整合させて作る。リテラル px の新規持ち込みは避け、繰り返すクラスは `app/components/tag/styles.ts` に定数化する。

## 実装ステップ

### A. タグ一覧の検索

#### A-1. タグ一覧の検索/ソート schema を定義

- **対象ファイル:** `app/components/tag/schema.ts`（**既存ファイルに追記** — `createTagSchema`/`renameTagSchema`/`mergeTagsSchema`/`deleteTagSchema`/`TAG_NAME_MAX_LENGTH` を持つ。上書きせず追記する）
- **変更内容:** `app/core/presentation/pagination.ts` の二段構えに倣い、フィールドバリデータを SSOT に、strict RPC schema（server fn 用）と URL search schema（`validateSearch` 用）を導出する。
  - `q` 検索語: フィールド上限は既存 `TAG_NAME_MAX_LENGTH`（=64）を再利用（タグ名検索なので上限が一致）。strict 版 `z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH)`、URL 版 `z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH).optional().catch(undefined)`（`?q=` のような空文字も `min(1)` reject → `.catch(undefined)` で undefined に正規化）。
  - `sort`: `z.enum(["name","noteCount","createdAt","lastUsedAt"])`、`order`: `z.enum(["asc","desc"])`。URL 版は各 `.optional().catch(undefined)`。
  - まとめて `tagListParamsSchema`（strict）と `tagListSearchSchema`（URL）として定義し、`pagination.ts` 同様の型レベル整合ガード（`_…Matches`）を付ける。
- **理由:** transport境界バリデーションを CLAUDE.md の方針通り `validateSearch`（URL）と `inputValidator`（RPC）の両方で行う。不正パラメータでもルートを壊さない。フィールドバリデータ SSOT で strict/URL の min/max ドリフトを防ぐ。

#### A-2. ルートに `validateSearch` + `loaderDeps` + server fn 引数を追加

- **対象ファイル:** `app/routes/_app/tags/index.tsx`
- **変更内容:** `trash/index.tsx` を範に `validateSearch: (s) => tagListSearchSchema.parse(s)` / `loaderDeps: ({ search }) => search` を追加。`renderTags` に `.inputValidator(validateInput(tagListParamsSchema))` を付け、`handler` で `data`（`q`/`sort`/`order`）を `TagManager` の props に渡す。`loader` は trash の `?? PAGINATION_DEFAULT_*` と対称に、URL schema が `.optional()` で落とした値をここで補完する: `sort: deps.sort ?? "name"` / `order: deps.order ?? "asc"`（backend デフォルトと一致）/ `q: deps.q`（未指定は undefined のまま）。
- **理由:** URL パラメータを RSC へ橋渡しし、二点バリデーションを満たす。デフォルト補完をルート loader で行うことで trash パターンと対称になり、ソート初期軸/方向が UI でも一貫する。

#### A-3. RSC → loader へ配線（検索/ソート共通）

- **対象ファイル:** `app/components/tag/TagManager.tsx`, `app/components/tag/loaders.ts`
- **変更内容:** `TagManager` に `q?`/`sort?`/`order?` props を追加。`loaders.ts` に **`TagManager` 専用 loader を新設**（例 `loadTagsForManager`）し `listTags` に `query`/`sort`/`order` を透過。RSC から1回しか呼ばれないため `cache()` で包む必要はない（包むと検索引数全体がメモ化キーになるだけ）。既存 `loadTagsForOwner`（`cache` 済み・`resolveTagNamesToIds` が依存する全件取得用）には引数を足さない（ADR-002）。`TagList`（→ `TagListToolbar`）に現在の検索語/ソート状態と tag リストを渡す。
- **理由:** `cache` キー汚染と全件取得経路の挙動変化を避けつつ配線する。

#### A-4. 検索フォーム UI を追加

- **対象ファイル:** `app/components/tag/TagListToolbar.tsx`（新規 client コンポーネント）, `app/components/tag/styles.ts`
- **変更内容:** `useRouter()` + `router.navigate({ to: "/tags", search: (prev) => ({ ...prev, q }) })` を `useTransition` で囲む検索フォーム（`<form onSubmit>`）。`defaultValue={q}` で現在値を反映。空文字 submit は `q` を URL から外す（`search: ({ q: _drop, ...rest }) => rest`）。モックヘッダ `.search` のトークン（surface 背景・focus shadow）に整合したクラスを `styles.ts` に定数追加。検索/ソート UI は `TagList` の `useOptimistic` 状態と独立させるため別コンポーネントに切り出す。
- **理由:** モックは本文内検索 UI を持たないため、デザイントークン整合で新規作成。`useOptimistic` のベースラインと干渉させない。

#### A-5. 検索ヒット0件の空状態を分岐

- **対象ファイル:** `app/components/tag/TagList.tsx`, `app/components/layout/styles.ts`（既存 `EMPTY_STATE` 流用）
- **変更内容:** 現状の空状態（`TagList.tsx:97`「タグがまだありません / 本文中で #tagname と…」）はタグ未作成向けの文言。検索語あり（`q` が非 undefined）かつヒット0件のときは「『{q}』に一致するタグが見つかりません」等の別文言に分岐させる。タグ総数0件（検索なし）は従来文言を維持。
- **理由:** 検索を入れると「0件ヒット」は通常フロー。タグが存在するのに「ありません」と出るのを避ける（要件 A の受け入れ挙動）。

### B. タグ一覧のソート

#### B-1. ソート schema（A-1 に統合済み）

- A-1 の `tagListParamsSchema` / `tagListSearchSchema` に `sort` / `order` を含める。`lastUsedAt` 軸は C で有効化。

#### B-2. RSC → loader へソート配線（A-3 と共通）

- A-3 の `loadTagsForManager` が `sort`/`order` を透過済みであることを担保。`listTags` 入力にそのまま渡す（usecase 受理値拡張は C-4）。

#### B-3. ソート切替 UI を追加

- **対象ファイル:** `app/components/tag/TagListToolbar.tsx`, `app/components/tag/styles.ts`
- **変更内容:** ソート軸切替（名前/ノート数/作成日時/最終使用）＋方向トグル（asc/desc）を `NoteListToolbar` の `router.navigate` パターンで実装。`value={sort}` / `value={order}` で現在値反映。モックの `.segmented` を参考にトークン整合のクラスを `styles.ts` に定義（リテラル px 不使用）。
- **理由:** モックは持たないため、デザイントークン整合で新規追加。

### C. 最終使用日時の列（＋最終使用ソート軸）

#### C-1. ポート型を拡張

- **対象ファイル:** `app/core/domain/tag/ports/tagRepository.ts`
- **変更内容:** `TagListOpts.sort` の union に `"lastUsedAt"` を追加。`TagWithNoteCount` に `lastUsedAt: Date | null`（未使用タグは null）を追加し JSDoc で「read-time 集約、`Tag` 集約のフィールドではない（`noteCount` と同系譜）」を明記。
- **理由:** 最終使用日時を `noteCount` と同じ read-time 集約として運ぶ。`Tag` エンティティは変更しない。

#### C-2. アダプタ `findByOwner` に集約と sort軸を追加

- **対象ファイル:** `app/core/adapters/d1/repositories/tagRepository.ts`
- **変更内容:** `select` に `lastUsedAt: sql\`MAX(${notes.updatedAt})\`.as("lastUsedAt")` を追加（既存の owner-scoped/active JOIN をそのまま利用、追加 JOIN 不要）。`sortExpr` に `sortKey === "lastUsedAt"` 分岐を追加。`MAX()` が NULL/同値時に順序が不定にならないよう既存の `.orderBy(direction(sortExpr), asc(tags.id))` のタイブレークを踏襲。戻り値 `lastUsedAt` は `notes.updatedAt`（ISO8601 text）を `new Date()` で復元、未使用は `null`。`noteCount` の `Number()` coercion と対称に扱う。
- **理由:** ADR-001（集約クエリ）の核心。データモデル不変で整合性自動。

#### C-3. DTO/view に `lastUsedAt` を載せる

- **対象ファイル:** `app/core/application/dto/tag.ts`, `app/core/application/tag/view.ts`
- **変更内容:** `TagDTO` に `lastUsedAt: string | null`（ISO 文字列）を追加。`toTagDTO(tag, noteCount, lastUsedAt)` に引数追加（`view.ts` の `toTagView = toTagDTO` エイリアスは無変更で追従）。波及先は確定済みの3箇所のみ:
  - `listTags.ts:58` — `toTagView(entry.tag, entry.noteCount, entry.lastUsedAt)` に更新（実データ）。
  - `createTag.ts:40` — `toTagView(tag, 0, null)`。
  - `renameTag.ts:99` — `toTagView(result.tag, 0, null)`。
  `createTag`/`renameTag` の戻り値はフロント未読である既存コメントに従い `null` を渡す。
- **理由:** フロントに最終使用日時を供給する。

#### C-4. usecase 入力のソート受理値を拡張

- **対象ファイル:** `app/core/application/tag/listTags.ts`
- **変更内容:** `ListTagsInput.sort` の union に `"lastUsedAt"` を追加（`opts` への透過は既存 spread で自動）。
- **理由:** 「最終使用」ソート軸を usecase 経由で受け付ける。

#### C-5. 最終使用列の表示を追加

- **対象ファイル:** `app/components/tag/TagList.tsx`, `app/components/tag/TagManager.tsx`, `app/components/tag/styles.ts`
- **変更内容:** `TagManager` の map に `lastUsedAt` を含め、`TagList` の `Tag` 型・`reduceTags` のリネーム保持（`{ ...tag, name }` で `lastUsedAt` を保持）に `lastUsedAt` を追加。行内に最終使用日時を表示する。日時整形は共有ヘルパが存在しない（`TrashList.tsx:22` / `NoteMetaPanel.tsx:36` がそれぞれローカル `formatDate` を持つだけ）ため、スコープ肥大を避けて **tag 側にローカルな整形関数**を置き、`TrashList` と同じ `d.toLocaleDateString("ja-JP", { … })` の日付フォーマットに揃える（時刻は出さない）。`TAG_COUNT` と同じく狭幅（`max-lg`）では畳むレスポンシブ規約に合わせ `styles.ts` に定数追加。未使用（`lastUsedAt === null`）は「未使用」フォールバック表示。
- **理由:** モックに無い列のため、`noteCount` 行に準じてトークン整合で追加。共有ヘルパ新設は本Issueのスコープ外なので既存の per-component パターンに合わせる。

## 設計判断

詳細は `.issue/569/adr.md` を参照。

- **ADR-001:** C の最終使用日時は read-time 集約（`MAX(notes.updatedAt)`）で導出し、`tags` 列追加・`Tag` 集約変更・migration を行わない。`0013_drop_tags_note_count.sql` で確立した「使用量は read-time 集約」の設計判断と一貫。
- **ADR-002:** `TagManager` 専用の検索/ソート loader を新設し、`cache` 済み全件取得 `loadTagsForOwner` には引数を足さない。
- **ADR-003:** `q`/`sort`/`order` を `pagination.ts` 規範の二段構え（strict RPC + URL search、フィールドバリデータ SSOT）で定義。URL 版は `.optional().catch(undefined)`。

## 「最終使用」の定義

本Issueでは **最終使用日時 = そのタグが紐づく active ノートの最終更新日時（`MAX(notes.updatedAt)`）** と定義する。`note_tags` にタグ付与時刻の列が無く「タグが最後に付与された日時」は導出不能なため、`noteCount`（active ノート数）と同じ active-notes JOIN を集約源とする。ノート本文編集でも `updatedAt` は動くため厳密な「タグ付け日時」ではないが、`noteCount` と整合する唯一の供給可能な定義として採用する（ADR-001 に明記）。

## リスクと注意点

- `lastUsedAt` ソートは集約式ソートでインデックスが効かない（`noteCount` ソートと同条件）。タグ目録は有界なので実害は小さいが、`asc(tags.id)` の安定タイブレークを必ず付与する。
- NULL 順序: 未使用タグ（`lastUsedAt = NULL`）の desc/asc 並び順を仕様化しテストで固定する（SQLite は NULL を最小扱い）。
- `loadTagsForOwner` に引数追加すると `cache` メモ化キーが変わり `resolveTagNamesToIds` 等の全件取得が検索条件付き結果を引く事故が起きうる。loader 分離を徹底。
- `toTagDTO` シグネチャ変更は `createTag`/`renameTag` の DTO 生成箇所に波及。全呼び出し箇所に `null` を渡す。
- 検索/ソート UI は `TagList` の `useOptimistic`（リネーム/削除）と併存。URL ナビ後に props が差し替わるため、UI は別 client コンポーネント（`TagListToolbar`）に切り出して楽観状態と独立させる。
- 検索ヒット0件時の空状態は A-5 で実装タスク化済み（タグ未作成とは別文言に分岐）。

## テスト方針

- **アダプタ統合テスト**（`app/core/adapters/d1/__tests__/tagRepository.*`）: (1) `lastUsedAt = MAX(active notes.updatedAt)`、(2) 未使用タグは `null`、(3) trashed/物理削除ノートを集約から除外、(4) `sort: "lastUsedAt"` の desc/asc と `tags.id` タイブレーク、(5) NULL 並び順。既存 `findByOwner` テストは API 後方互換（`lastUsedAt` 追加のみ）。
- **usecase 統合テスト**（`app/core/application/tag/__tests__/tag.*`）: `listTags` が `sort: "lastUsedAt"` を受理し DTO に `lastUsedAt` を載せること、`query`/`sort`/`order` の透過。
- **schema 単体テスト**: 不正な `sort`/`q` でも URL schema が `.catch(undefined)` でデフォルトに落ちること。型レベル整合ガード。
- **手動/ブラウザ**: `/tags?q=...&sort=lastUsedAt&order=desc` で検索・ソート・最終使用列がモック整合で動くこと、空検索・ヒット0件、狭幅レスポンシブ畳み込み、リネーム/削除の楽観反映が検索/ソート状態を壊さないこと。
- 最後に `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクの2視点並列）

**修正した点**:
- **[P-001 アーキ]** `schema.ts` は新規ではなく既存ファイル（`createTagSchema` 等を保持）。A-1 を「既存に追記」へ修正し、`q` の上限を既存 `TAG_NAME_MAX_LENGTH`（=64）再利用に確定。
- **[P-002 アーキ]** URL `q` schema を `z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH).optional().catch(undefined)` に確定（空文字→undefined 正規化）。フィールドバリデータ SSOT で strict/URL のドリフト防止を明記。
- **[P-001 要件]** 「最終使用」の語義（= active ノートの `MAX(updatedAt)`）を plan.md 新セクション・ADR-001 に明文化。タグ付与時刻列が無く導出不能な点も記載。
- **[S-001 要件]** 検索ヒット0件の空状態を「検討事項」から実装タスク A-5 に格上げ（タグ未作成とは別文言に分岐）。
- **[S-003 要件]** ソート/検索の loader デフォルト補完を A-2 のルート loader に明示（trash の `?? DEFAULT` と対称、`sort ?? "name"` / `order ?? "asc"`）。
- **[S-001/S-002 両視点]** 最終使用列の日時整形を C-5 で確定: 共有ヘルパは無いため tag ローカルに `toLocaleDateString("ja-JP")`（`TrashList` と同形式、時刻なし）。共有化はスコープ外。
- **[S-002 アーキ]** `loadTagsForManager` は `cache()` で包まない（RSC 単発呼び出し）旨を A-3・ADR-002 に明記。

**取り込んだ改善提案**:
- `toTagView`（= `toTagDTO` エイリアス）の波及先を確定3箇所（`listTags.ts:58` 実データ / `createTag.ts:40` null / `renameTag.ts:99` null）として C-3 に明記。

**確認のみ（修正不要）**:
- NULL 並び順: SQLite は NULL 最小扱い → desc（新しい順）で未使用タグが末尾になり UX と一致。`NULLS LAST` 制御は不要、`asc(tags.id)` タイブレークで十分（テストで両方向固定）。
- `notes.updatedAt` は `text`（ISO8601）で `new Date()` 復元が健全（`toTag` の `createdAt` 復元と同パターン）。

**2周目以降**: 1周目で両視点とも P 級の未解決なし（修正反映で解消）と判断し、レビューループを終了。
