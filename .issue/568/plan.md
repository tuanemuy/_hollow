# 実装計画 — Issue #568: 領域5（P30/P31/P32）モックの未追従機能

**Issue:** #568
**作成日:** 2026-06-08
**複雑度:** 中〜大規模

---

## 目的

#544 で領域5「公開・共有で読まれる体験」(P30/P31/P32) の見た目をモックに追従させた際、ドメインポート/usecase の新設を伴う（=バックエンド変更が前提の）機能をスコープ外とした。本Issueはそれら未追従機能を、いずれも「ドメインポート → usecase → DTO → ルート transport → コンポーネント」の順でバックエンドを先に新設してから UI を配線して実装する。

## スコープ

### 含まれるもの

- **P31 公開バックリンク**（公開な参照元のみに絞る公開専用 usecase の新設 + 2 セクションの UI 配線）
- **P31 関連ノート**（同じ著者の他の公開ノートを当該ノート除外・件数制限で引く usecase + UI）
- **P32 検索フィルタードロワー**（ユーザー/タグ combobox サジェスト + 期間 radio + 期間別件数 + active-chips + filter-bar）
- **P30 公開トップ chip・表示モード・ソート**（`listUserPublicNotes` のタグフィルタ・ソート拡張 + list/tile/calendar 表示モード）

### 含まれないもの

- P30 hero 文言の仮置き解消 → #533 所有
- 公開側空状態（EMPTY_LIST / SEARCH_EMPTY）のアイコン付与 → #284 所有
- P32 レート制限のトースト化 → グローバルトースト基盤の別Issue
- 共有リンク失敗カウンタの永続化バグ → #560
- **P32 `<mark>` ヒット語ハイライト**（`SearchHitDTO.snippet` がプレーン文字列。span/offset 化は SearchService/adapter の広範な変更が要る。優先度低・原則含めない）

## 実装ステップ

### P31 公開バックリンク・関連ノート（backend → frontend）

#### 1. 公開バックリンクの可視性フィルタ経路

- **対象ファイル:** `app/core/application/publication/`（usecase）、可視性判定は `app/core/domain/publication/ports/publicationStateRepository.ts` の既存 `findByNoteIds` を再利用
- **変更内容:** 既存 `noteRepository.findReferrers(targetNoteId, opts?)` の戻り（参照元 `Note[]`）を活かし、可視性は usecase 側で `publicationStateRepository.findByNoteIds(referrerIds)` を使い `visibility === 'public'` の id 集合で絞る。ポート追加なし。
- **理由:** 「可視性で絞る」関心は publication 集約が持つ。`findReferrers` に `visibility` 引数を足すと note 集約に publication 概念が漏れる。既存 bulk 公開判定を再利用すれば新ポートを増やさず集約境界を守れる。

#### 2. 公開バックリンク usecase 新設

- **対象ファイル:** `app/core/application/publication/listPublicBacklinks.ts`（新規）、`index.ts`
- **変更内容:** `ListPublicBacklinksInput = { noteId }`。`unitOfWorkProvider.run` 内で対象ノートの公開ゲート（`getPublicNote` と同じ active + visibility==='public' 判定）を確認 → `findReferrers` → 参照元 id を `findByNoteIds`（戻りは `PublicationState[]`）で公開のみに絞る → 各参照元の著者 username/slug を解決して射影。`actorUserId` は受けない（公開専用）。
- **directorySegments の扱い（P-002）:** 既存 `view.ts` の `toBacklink` は `directorySegments: readonly {id,name}[]` を必須に取り、認証側 `getBacklinks` は `DirectoryService.computeSegmentsForMany` でフォルダツリーを解決して埋めている。公開面で参照元ノートのフォルダ名を出すと情報漏洩になり得るため、モック `P31:689-701` の backlink 表示要素を確認した上で、**ディレクトリを出さない方針なら `directorySegments: []` 固定で `toBacklink` を流用**、出すなら公開用 DTO/射影を `application/publication/view.ts` に新設する。`computeSegmentsForMany` を公開面で安易に呼ばない（ADR-006 参照）。
- **理由:** 認証専用 `getBacklinks`（`actorUserId` 必須・所有者一致強制）と関心が異なるため別 usecase に分離。改造は認可境界を曖昧にする。

#### 3. 関連ノート usecase 新設

- **対象ファイル:** `app/core/application/publication/listRelatedPublicNotes.ts`（新規）、`index.ts`
- **変更内容:** `ListRelatedPublicNotesInput = { ownerId | username, excludeNoteId, limit }`。`listUserPublicNotes` のロジックを流用しつつ `excludeNoteId` を除外し `limit`（モックは 4 枚）で打ち切る。モック `related-meta`（708/712/716/720行）は**公開日（例: 2026年5月8日）とタグ 1 個**を出すため、DTO に `publishedAt` を確実に運ぶ（`listUserPublicNotes` 同様 publication 側の値を解決する必要がある点に注意）。
- **理由:** `listUserPublicNotes` をそのまま使うと当該ノートが混ざり件数も合わない。除外・件数の関心を独立 usecase に切り出す。

#### 4. PublicNoteDetail に 2 セクション配線

- **対象ファイル:** `app/components/public/PublicNoteDetail.tsx`、`app/components/public/styles.ts`
- **変更内容:** `loadPublicNote` に続けて新 usecase 2 本を `serverData` で並列ロード（`cache(serverData(...))` + `Promise.all`）。article 後ろに `section-block`（バックリンク）と `related-grid`（関連カード）を追加。既存 `BACKLINKS` 定数を土台に `section-title` / `backlink-item` / `related-card` 定数を `styles.ts` に追加。リンク先は `/notes/public/$noteId`。空時はセクションごと非表示。
- **理由:** モック `P31-public-note.html:689-723` に忠実。

### P32 検索フィルタードロワー（backend → frontend）

#### 5. 公開タグサジェスト usecase 新設

- **対象ファイル:** `app/core/domain/tag/ports/tagRepository.ts`（`searchPublicByNamePrefix(prefix, limit)` 追加）、`app/core/adapters/d1/repositories/tagRepository.ts`、`app/core/application/search/suggestPublicTags.ts`（新規）、`index.ts`、d1 integration test
- **変更内容:** ポートに公開横断プレフィックス検索を追加（公開ノートに 1 件以上紐づくタグのみ＝`note_tags` × `notes(active)` × `publication_states(public)` の JOIN・distinct）。usecase は candidate 名のリスト `{ name }[]` を返す。`prefix` トリム・`limit` クランプ、adapter で LIKE エスケープ。
- **理由:** 既存 `searchByNamePrefix` は owner-scoped で公開横断に使えない。

#### 6. 公開ユーザーサジェスト usecase 新設

- **対象ファイル:** `app/core/domain/identity/ports/userRepository.ts`（`searchPublicByUsernamePrefix(prefix, limit)` 追加）、`app/core/adapters/d1/repositories/userRepository.ts`、`app/core/application/search/suggestPublicUsers.ts`（新規）、`index.ts`、d1 integration test
- **変更内容:** ポートに username プレフィックス検索を追加（`status not in (deleted,suspended)` かつ公開ノートを 1 件以上持つユーザー = `publication_states(public)` との EXISTS）。usecase は `{ username, displayName }[]` を返す。
- **理由:** username プレフィックス検索が皆無。列挙対策として「公開ノートを持つ live ユーザー」のみに絞る。

#### 7. 期間別ファセット件数の集計経路

- **対象ファイル:** `app/core/domain/search/ports/searchIndex.ts`（`countByDateRanges` 追加）、`app/core/adapters/d1/searchIndex.ts`、`app/core/application/search/countPublicSearchFacets.ts`（新規）、`index.ts`、`SearchService`、d1 integration test
- **変更内容:** `SearchIndex` に `countByDateRanges(query, ranges): Promise<number[]>`（可視性=public 固定）を追加。usecase は keyword/既存フィルタ + 各期間（過去 7 日/30 日/1 年/すべて）でヒット件数を返す。
- **実現可能性（S-004）:** `searchIndex.ts` の `buildSharedFilters` は既に `dateRange` を `sd.date_for_calendar >= ? AND <= ?` でフィルタ済み。`countByDateRanges` は同じ where に各期間境界を当てて `COUNT(*)`（FTS の場合 `MATCH` サブクエリに被せる）を期間分 or `CASE` 集計1回で出せる構造があり、SQL 上は実装可能。
- **理由:** モックの `facet-count`（3/12/28/31）追従に集計が必須。集計は検索インデックスの責務なのでポートに置く。
- **段階的着地（ADR-005）:** 集計が想定外に高コストと判明した場合のみ、「件数なしで radio + combobox + active-chip 配線」を先行させ件数は後続に切る。

#### 8. searchPublicNotes 配線拡張 + ドロワー UI 実装

- **対象ファイル:** `app/routes/search.tsx`（`validateSearch`/`renderInputSchema` に `tags`(配列)・`period`(enum) 追加）、`app/components/public/PublicSearch.tsx`、`app/components/public/styles.ts`、新規 `app/components/public/SearchFilterDrawer.tsx`（`"use client"`）
- **変更内容:** `runSearch` の `tagNames`/`dateRange` を URL 由来値に差し替え。filter-bar（件数 + フィルターボタン + ソート）、active-chips 列（×解除＝URL から該当パラメタ除去）、`role="dialog" aria-modal` の右スライドドロワー。combobox は `role="combobox"` + listbox にサジェスト候補を表示。footer の「N 件を表示」は集計 usecase の合計を反映。寸法・色はトークン経由。`app/components/note/list/FilterBar.tsx`・`styles.ts` の drawer/chip 実装を参照しつつ公開用に再定義。
- **client island の配線（S-002）:** `PublicSearch.tsx` は server component で、ルートは `renderServerComponent` の結果をストリームする。`SearchFilterDrawer.tsx` は `"use client"` とし、公開ルート用に `getRouteApi("/search")` を新たに束縛して URL 駆動する（認証側 `DisplayModeSwitch` の `getRouteApi("/_app/")` は流用不可）。サジェスト候補は `createServerFn` + `inputValidator`（プレフィックス文字列を検証）を debounce して client から呼ぶ。確定値（選択タグ/ユーザー）は URL に載せ `searchPublicNotes` の `tagNames`/`username` に流す。候補サジェストは URL に載せない。
- **ソートラベル（S-002 req）:** モック P32 のソートは「関連度順」（885-887行）。現行 `searchPublicNotes` は score 順がデフォルトで切替軸を持たないため、本 Issue では**「関連度順」固定表示**とし切替トグルは置かない（飾りボタン回避）。並び替え軸の追加は本 Issue スコープ外。
- **理由:** モック `P32-public-search.html:873-1116` に忠実。`searchPublicNotes` は既に `tagNames`/`dateRange`/`username` を受けるので combobox 確定値はそのまま流せる。

### P30 公開トップ chip・表示モード・ソート（backend → frontend）

#### 9. listUserPublicNotes をタグフィルタ・ソート対応に拡張

- **対象ファイル:** `app/core/application/publication/listUserPublicNotes.ts`、`noteRepository.ts` の `listWithCount` 利用、回帰固定用 integration test（新規）
- **回帰担保を先に置く（P-004）:** 現行 `listUserPublicNotes` を参照するテストは存在しない。現行実装は `findPublicByOwner`（limit:1000 固定取得）→ メモリ内 slice → `total = publicNoteIds.length` 方式で、`findByOwner(visibility:['public'])` 系への切替はセマンティクスが変わる（`NoteOwnerFilters` の visibility IN は「publication 行なし=private 扱い」で `findPublicByOwner` と結合方向が逆）。**リファクタ前に現行挙動（items 順・total）を固定する integration test を新規作成する**。`getPublicNote.integration.test.ts` のシード関数群を雛形にする。
- **変更内容:** `ListUserPublicNotesInput` に `tagNames?` と `sort?` / `order?` を追加。実装は `noteRepository.findByOwner`+`countByOwner` を別々に呼ぶのではなく、**`listWithCount`（`noteRepository.ts:323-366`、items+count を単一フィルタ解決で返し `items.length <= count` を構造的に保証。PR #170 / Issue #30 由来）を使う**（S-001）。`{ visibility:['public'], tagIds, sort, order, limit, offset }` を渡す。`tagNames` → `tagId` 解決は `tagRepository.findByOwnerAndName`。
- **理由:** `listWithCount` は公開可視性 + タグ + ソートを単一パスで満たし、現行のメモリ内スライス方式より正確かつ total/visible 不一致を防ぐ。新ポート追加を避けつつあるべき姿に寄せる。

#### 10. P30 フィルター chip・表示モード・ソート配線

- **対象ファイル:** `app/routes/u/$username/index.tsx`（`validateSearch` に `tags`・`sort`・`display` 追加）、`app/components/public/UserPublicTop.tsx`、新規 `app/components/public/PublicNoteViews.tsx`（list/tile/calendar 切替）、`app/components/public/styles.ts`
- **変更内容:** filter-row の chip（すべて/各タグ/期間）を URL の `tags` に配線。選択中タグ chip の**解除（×）affordance** はモバイルモック `mobile/P30-user-public-top.html:363-364`（`.chip.active .remove`）に定義があるため、選択 chip クリック/×で URL から該当タグを除く形で実装する。segmented（リスト/タイル/カレンダー）は `display` を URL 駆動にし、認証側 `TileView`/`CalendarView`/`ListView` を参考に公開用 read-only ビューを実装（編集 affordance なし）。sort-btn（「公開日順」）は `sort` を切替。`display` は `loaderDeps` から除外して RSC 再ストリームを避ける（`DisplayModeSwitch` の Issue #219 手法）。`tags`/`sort` はローダ依存。
- **理由:** モック `P30-user-public-top.html:556-592` に忠実。chip/segmented/sort はすべてステップ 9 の usecase 拡張で裏打ちされ「飾り」にならない。

### 補足（優先度低）

#### 11. P31 bottom-meta 末尾再掲（680-687行）

- 軽微。ステップ 4 の 2 セクション追加時に既存 `NOTE_META_INLINE` の再掲ブロックを末尾に置くだけ。バックエンド不要なので余力があれば同時対応可。

## 設計判断

詳細は `.issue/568/adr.md` を参照。要点:

- 公開バックリンクの可視性フィルタは「ポート追加」ではなく「既存 `findReferrers` + `publicationStateRepository.findByNoteIds` を usecase で組合せ」（集約境界の保持）。
- 新 usecase の配置: バックリンク・関連ノートは `application/publication/`、サジェスト・ファセット集計は `application/search/`。
- サジェスト候補は「公開ノートを持つ live ユーザー / 公開ノートに紐づくタグ」限定（列挙対策）。
- combobox 確定値は URL に載せ `searchPublicNotes` に流す。候補サジェストのみ serverFn `inputValidator` 経由で都度取得（URL に載せない）。
- 表示モード（タイル/カレンダー）は認証側を参照しつつ公開用 read-only に新規実装（認証側は `/_app/` ルート束縛で流用不可）。
- 「公開日順」ソート: `publishedAt` は publication 側の値。`findByOwner`/`listWithCount` の sort は note 列のみ。厳密な公開日順は publication 側 listing 拡張が要るため、まず `updatedAt`/`createdAt` 系で配線しコスト判断。
- 期間ファセット件数集計が高コストの場合は「件数を後続に切り、ドロワーの絞り込み機能は本 Issue で完成」の段階的着地を許容。
- バックリンク射影でディレクトリセグメント（フォルダ名）を公開面に露出しない（ADR-006）。

## リスクと注意点

- `listUserPublicNotes` を `findPublicByOwner` ベースから `listWithCount(visibility:['public'])` ベースへ切り替えるリファクタは、既存 `total` 計算・ページング・`UserPublicTop` の挙動に回帰を生みうる。`visibility` IN セマンティクス（publication 行なし=private 扱い、`findPublicByOwner` と結合方向が逆）を確認し、**リファクタ前に回帰固定 integration test を作ってから**着手する。
- 公開横断のタグ/ユーザーサジェスト SQL は全テーブル走査になりやすい。プレフィックスインデックス + 公開ノート存在 EXISTS で候補集合を絞る。
- ファセット件数集計は SQL 構造上は実装可能（`buildSharedFilters` の `dateRange` フィルタに COUNT を被せる）だが、4 期間分の集計コストに注意。想定外に高コストなら ADR-005 の段階的着地。
- combobox・ドロワーは client 挙動（`role="dialog"`/`aria-modal`/フォーカストラップ/Esc 閉じ/backdrop クリック）が要る。`"use client"` で RSC 境界をまたぐ。サジェストは serverFn を debounce、レースに注意。公開ルート用 `getRouteApi("/search")` の束縛が要る。
- 新ポートメソッドの実装先は **d1 adapter のみ**（`app/core/adapters/stub/` は外部サービススタブのみでリポジトリ/searchIndex stub は存在しない）。
- 表示モードを `loaderDeps` に入れると毎回 RSC 再ストリーム。`display` のみクライアント切替・`tags`/`sort` はローダ依存に分ける。
- **「公開日順」ソートの妥協:** `findByOwner`/`listWithCount` の `sort` は note 列（updatedAt/createdAt/title）のみで `publishedAt`（publication 集約の値）を持たない。本 Issue では暫定的に `updatedAt`/`createdAt` 系で配線する。厳密な公開日順が必須なら publication 側 listing 拡張が要る（コスト判断し、暫定なら progress.md / フォローアップ Issue に明記）。
- スコープ厳守: #533 / #284 / #560 / トースト基盤は触らない。`<mark>` は原則含めない。

## テスト方針

**重要（P-001）:** このプロジェクトはリポジトリ系の fake を意図的に置いていない（`docs/test.md`）。in-memory fake では transaction/可視性結合を模倣しきれないため、**usecase のロジックテストは integration 層（実 SQLite, `setupTestContainer`）で行う**。fake で書けるのは clock/id/logger に閉じたロジックのみ。既存 `getPublicNote.integration.test.ts` のシード関数群を雛形にする。

- **usecase integration（real-DB）:** 公開バックリンクが「公開参照元のみ」を返し非公開/trashed を除外、対象ノート非公開で NotFound、関連ノートが当該ノート除外・件数上限遵守、サジェストが live + 公開ノート保有のみ、`listUserPublicNotes` のタグフィルタ・ソート・total 整合（`listWithCount` で items≤count）。
- **回帰固定（real-DB）:** `listUserPublicNotes` リファクタ前に現行挙動（items 順・total）を固定する integration test を先に作成する。
- **adapter integration（real-DB）:** 新ポートメソッド（公開横断プレフィックス検索・期間集計）の SQL が公開可視性・active・status を正しく絞る。
- **コンポーネント（`renderToStaticMarkup` 方式）:** PublicNoteDetail の 2 セクション描画/空時非表示、active-chips 解除リンクの URL、表示モード切替の `display` URL 反映。
- **ブラウザ動作確認（manual-test）:** P30 chip 絞り込み・segmented 切替、P32 ドロワー combobox サジェスト→選択→active-chip 反映→件数更新、P31 バックリンク/関連ノードのリンク遷移。
- 最後に `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 2視点並列）

**要件カバレッジ視点:** 問題点ゼロ。3機能群・各モック要素のカバレッジ・スコープ境界は良好と確認。改善提案を反映:
- P30 タグ chip の解除（×）affordance をステップ 10 に明記（モバイルモック `mobile/P30:363-364` 由来）
- P32 ソートラベルを「関連度順」固定表示と明記（切替軸なし・飾りボタン回避）
- 関連ノート DTO に `publishedAt` を運ぶ点をステップ 3 に明記

**アーキ・リスク視点:** 実コード照合で 4 件の要修正を検出、すべて反映:
- **[P-001]** テスト方針を fakes 前提から integration（real-DB, `setupTestContainer`）に全面修正（`docs/test.md` の戦略に整合）
- **[P-002]** バックリンク射影の `directorySegments`（フォルダ名漏洩）対策をステップ 2 + ADR-006 に追記
- **[P-003]** 「stub adapter にも実装」の事実誤認を訂正。実装先を d1 adapter のみに修正（リポジトリ/searchIndex stub は存在しない）
- **[P-004]** `listUserPublicNotes` リファクタの回帰固定 integration test を先に作る手順をステップ 9 + リスクに明記
- **[S-001]** ステップ 9 を `findByOwner`+`countByOwner` から `listWithCount`（items≤count 保証, PR #170）に変更
- **[S-002]** client island 配線（`getRouteApi("/search")` 束縛・serverFn `inputValidator` debounce）をステップ 8 に具体化
- **[S-004]** ADR-005 のトーンを「実現困難」から「SQL 上は実装可能、コスト次第で段階化」に緩和

**見送り:** なし（全提案を取り込み）。

両視点とも反映完了。要件視点は当初から問題点ゼロ、アーキ視点の指摘はすべて plan/adr に反映したため、ここで終了とする。
