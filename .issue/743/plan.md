# 実装計画 — Issue #743: ノート一覧のディレクトリパンくず: 末尾 × を廃止し現在地を非リンク化、表示位置も詳細と揃える

**Issue:** #743
**作成日:** 2026-06-15
**複雑度:** 中〜大規模

---

## 目的

ノート一覧 (`DirectoryBreadcrumb`) のディレクトリパンくずを、ノート詳細 (`NoteBreadcrumb`) の語彙・配置に揃える。末尾の「フィルタ解除 ×」を廃止して現在地を `aria-current="page"` の非リンクテキストにし、表示位置をフィルタ群の下からヘッダ（見出しの上）へ移す。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `DirectoryBreadcrumb` の末尾セグメント（現在ディレクトリ）が `<Link>` ではなく `aria-current="page"` の非リンク `<span>`（`text-ink-secondary`）として描画される | 対応方針1 / `NoteBreadcrumb` パターン | S1 |
| AC-2 | 祖先セグメント（末尾以外）は従来どおり `{ ...HOME_SEARCH, directoryId }` の `<Link>` として描画される | 対応方針1 | S1 |
| AC-3 | `DirectoryBreadcrumb` から末尾「ディレクトリフィルタを解除」× ボタン（`CLEAR_BUTTON` / `onClear`）が消える | 対応方針1 | S1 |
| AC-4 | ディレクトリパンくずがフィルタ群（チップ列）の下ではなく、ページ見出し (`<h1>`) の上に表示される。具体的には `DirectoryBreadcrumb` の `nav` 自身が `mb-6` を持ち、`HeaderSection` 内で `ViewSwitcher`（h1 を内包）の**直前**に描画される（詳細 `NoteDetail` の `<header><NoteBreadcrumb mb-6/><h1/>` と対称） | 対応方針2 | S2 |
| AC-5 | 「全ノートに戻る」フルリセット導線が既存のグローバル clear-all（`NoteListToolbar` の「フィルタをすべてクリア」）で担保される（不変）。`directoryId` 設定時は `hasAnyHomeFilter(search)` が true なので clear-all が必ず表示される。root crumb「すべてのノート」は**追加しない** | 対応方針3 / ADR-001 | （既存挙動の不変確認）|
| AC-6 | フォールバックチップ（id 解決不能＝削除済み等）は従来どおり `×` 付きチップとして `FilterBar`（フィルタ行）に残る | 対応方針4 | S3 |
| AC-7a | `DirectoryBreadcrumb.test.tsx`（新規）で、祖先=リンク / 末尾=`aria-current="page"` 非リンク / × 不在 / 区切りが要素間のみ / 累積 id key / 先頭 Folder アイコン無し、を検証 | 影響範囲 | S4 |
| AC-7b | `FilterBar.test.tsx`（改修）で、segments があっても FilterBar 側に nav（`aria-label="現在のディレクトリ"`）が描画されない（パンくず移設の回帰）を検証 | 影響範囲 | S4 |
| AC-7c | HeaderSection 経由でパンくずが見出しの上に出ること（テスト可能な範囲で）を検証 | 影響範囲 | S4 |
| AC-8 | `#710` ADR-001 / ADR-002 の該当部分を supersede する追補が記録される | 備考 | S5 |

## スコープ

### 含まれないもの

- `NoteBreadcrumb`（詳細側）の変更 — 揃える「先」であり不変。
- `directoryAncestorSegments` / `BreadcrumbSegment` 型・`flat` ツリーロジックの変更 — 末尾判定はインデックスで足り、データ供給ロジックは不変。
- ドメイン・ユースケース・アダプター層 — 本変更は純粋にフロントエンド表示の再構成。
- パンくず描画ロジックの `NoteBreadcrumb` との共通化（`Separator`/`CRUMB_LINK` 抽出）— #710 ADR-001 がフォローアップ余地として残した論点で、本 Issue の要件外。
- root crumb「すべてのノート」の追加 — 揃える先 `NoteBreadcrumb` に root crumb は無く、フルリセットは既存 clear-all で担保済み（ADR-001 参照）。

## 調査結果

- 関連ファイル:
  - `app/components/note/list/DirectoryBreadcrumb.tsx` — 変更対象本体。`nav` + 先頭 Folder アイコン + 全セグメント `<Link>` + 末尾 `CLEAR_BUTTON`(×)。`onClear` を props で受ける。
  - `app/components/note/detail/NoteBreadcrumb.tsx` — 揃える先。root crumb は**無い**。末尾は `aria-current="page"` の `text-ink-secondary` 非リンク `<span>`。`nav` 自体が `mb-6` を持つ。先頭アイコンは無い。`Separator` を内部関数化。
  - `app/components/note/detail/NoteDetail.tsx`(127行) — `<article><header><NoteBreadcrumb …/><h1>…</h1>` の順。パンくずが見出しの直上。
  - `app/components/note/list/FilterBar.tsx` — 現在 `DirectoryBreadcrumb` の呼び出し側。`clearDirectory`(optimistic + navigate) を持ち、パンくず or フォールバックチップを `<div className="mb-5">` 行で描画（443–464行）。`optimisticDirectoryId` を持つのは optimistic フィルタ状態の一部だから。
  - `app/components/note/HomePage.tsx` — ページ合成。`HeaderSection`（見出し + 件数 + ツールバー、saved views と owned notes を await）／`FilterSection`（tags + tree + referencing、`directoryAncestorSegments` でセグメント算出して `FilterBar` に渡す、181–184行）／`NotesSection` の3つの `<Suspense>` + `SectionErrorBoundary` 境界。冒頭 JSDoc が「React `cache` keys by argument **reference identity**」と明記し、`notesQuery` を1箇所で生成して `HeaderSection`/`NotesSection` に**同一参照**で渡している。
  - `app/components/note/directoryTree.ts` — `BreadcrumbSegment`, `directoryAncestorSegments`(flat ツリーから root→current の鎖を再構成、解決不能で空配列)。不変。
  - `app/components/note/loaders.ts` — `loadDirectoryTreeFlat` は `cache()` 済み。**ただし `cache()` は引数の参照同一性でキー化される**ため、構造同値の別リテラルは dedup されず二重 I/O になる（HomePage JSDoc 参照）。dedup させるには同一参照を配る必要がある。
  - `app/components/note/list/styles.ts` — `filterChip` / `filterChipRemove`（フォールバックチップ用）。
  - `app/components/auth/links.ts` — `HOME_SEARCH = {}`（祖先リンクの search ベース）。
  - `app/components/note/list/__tests__/FilterBar.test.tsx` — 709–827行が #710 のパンくずテスト群。`Link` をモックして `data-directory-id` を出す。`clearDirBtnInNav` / segments / separator / 行配置 / クリア navigate を検証。
  - `.issue/710/adr.md` — ADR-001（DirectoryBreadcrumb 新設、末尾 × 前提）/ ADR-002（チップ→パンくず、別行配置）/ ADR-003（異常データ縮退）。

- あるべきアーキテクチャ:
  - hexagonal + DDD だが本変更は presentation 層内の再構成のみ。ドメイン/ユースケース/アダプターへの影響なし（データ供給は既存 `directoryAncestorSegments` のまま）。
  - スタイルは utility-first、`data-*` 状態属性、繰り返し文字列はモジュール定数（`styles.ts`）。`aria-current` は属性で表現。
  - 「現在地」は location 語彙（nav + aria-current）で表し、filter 語彙（チップ + ×）と混ぜない（#710 ADR-002 の方向性）。本 Issue はその方向性をさらに徹底する（末尾 × もチップ語彙の名残として除去）。
  - `cache()` ラップされた loader の同一レンダー dedup は**引数の参照同一性**で成立する（HomePage JSDoc 明記）。構造同値の別リテラルでは dedup されない。よって「同一参照を1箇所で作って配る」（`notesQuery` パターン）が tree 共有の正しい機構。

- 既存実装の状態:
  - `DirectoryBreadcrumb` は #710 で「末尾 × + 全セグメントリンク + フィルタ行内別行配置」として実装された。これは ADR-001/002 が明示的に選んだ過渡的形。本 Issue は同じ ADR が「フィルタ語彙とナビ語彙の同居はトレードオフ」と認めた点を解消する後続変更で、**過去の意図的判断を上書きする**（盲目的模倣ではなく ADR supersede を伴う）。
  - フォールバックチップ（`segments.length === 0`）はチップ語彙として妥当なので残す（AC-6）。

- 依存関係:
  - 位置移動が最大の難所。現状 `directorySegments` は `FilterSection`（tree を await する境界）でのみ算出され `FilterBar` に渡る。パンくずを見出し上＝`HeaderSection` の領域へ動かすには、**そこでもセグメントが必要**。`HeaderSection` は tree を読んでいない。
  - tree を `HeaderSection` でも使うには、二重 I/O を避けるため **`HomePage` で `treeQuery = { actorUserId: userId }` を1回だけ作り、`HeaderSection` と `FilterSection` の双方に同一参照で渡す**（`notesQuery` と完全に同じパターン）。両セクションが同一参照で `loadDirectoryTreeFlat(treeQuery)` を呼べば `cache()` がヒットし I/O は1回になる。
  - `clearDirectory` は optimistic 状態（`useOptimistic`）に依存するため `FilterBar`（client）内に閉じている。パンくず（祖先リンク・末尾 span）は素の `<Link>`/`<span>` で optimistic を経由しないため、server component から直接描画できる。

## 設計

### ドメインモデルへの影響
なし。`BreadcrumbSegment` / `directoryAncestorSegments` は不変。表示の末尾判定はセグメント配列のインデックスで足り、データ構造に変更は不要。

### ユースケース / アプリケーションロジック
なし。新たな loader も不要（`loadDirectoryTreeFlat` を再利用）。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

3点の変更が連動する。

#### (a) `DirectoryBreadcrumb` を `NoteBreadcrumb` パターンへ（AC-1/2/3）

- `onClear` props を削除。末尾 `CLEAR_BUTTON`(×) を削除（`CLEAR_BUTTON` 定数も削除）。
- 先頭 Folder アイコン（`LEADING_ICON`）を撤去し、詳細 `NoteBreadcrumb`（先頭アイコン無し）と揃える。
- セグメント描画で末尾 (`index === segments.length - 1`) を分岐:
  - 末尾: `<span aria-current="page" className="text-ink-secondary">{name}</span>`（リンクにしない）。
  - それ以外: 従来の `<Link to="/" search={{ ...HOME_SEARCH, directoryId }} className={CRUMB_LINK}>`。
- 区切りは要素間のみ（`index > 0` のとき `Separator`）。root crumb を入れないので、Folder アイコン分のオフセットも不要になり、`NoteBreadcrumb` と同じ「先頭セグメント前に区切り無し」になる。
- `nav` 自身が `mb-6` を持つ方式へ寄せる（詳細と対称。`NoteBreadcrumb` の `nav` className に揃える）。「余白は呼び出し側が持つ」とした #710 ADR-001 の前提を上書き。
- 最終形は実質 `NoteBreadcrumb` と同型（末尾が `noteTitle` ではなく現在ディレクトリ名）。フォールバックチップは `DirectoryBreadcrumb` の外（`FilterBar`）にあるため、`onClear` 廃止の影響は受けない。

#### (b) 表示位置をヘッダ（見出しの上）へ（AC-4）— 新 async component / 専用境界は設けない

現状: パンくず（と フォールバック）は `FilterBar`（`FilterSection` 内）で描画。見出しは `HeaderSection`。

採用方針（ADR-002 / ADR-003 で決定）: **パンくず（`DirectoryBreadcrumb`）を既存の `HeaderSection`（async server component）内に描画する**。専用の async server component や新しい Suspense/`SectionErrorBoundary` 境界は**新設しない**。

- `HomePage` で `treeQuery = { actorUserId: userId }` を1回だけ作り、`HeaderSection` と `FilterSection` の双方に同一参照で props として渡す（`notesQuery` と同型の「1箇所生成・同一参照配布」）。
- `HeaderSection` は既存の `Promise.all` に `loadDirectoryTreeFlat(treeQuery)` を**追加 await**する。`treeQuery` は `FilterSection` の呼び出しと参照同一なので `cache()` がヒットし、I/O は1回（二重化しない）。
- await した `flat` から `search.directoryId === undefined ? undefined : directoryAncestorSegments(flat, search.directoryId)` でセグメントを算出。
- `segments.length > 0` のときだけ、`<ViewSwitcher>`（ページ唯一の `<h1>` を内包）の**直前**に `<DirectoryBreadcrumb segments={segments} />` を描画する。`directoryId` 未設定や解決不能（空配列）のときは何も描画しない（高さ0で h1 が繰り上がる）。
- 境界: 既存の「ツールバー」`SectionErrorBoundary`（h1 を内包し、エラー時も `fallbackHeading` で静的 h1 を保持する #649 ADR-009 の不変条件を持つ）を**そのまま再利用**する。tree 読み込み失敗時は `HeaderSection` 全体が fallback に落ちるが、`fallbackHeading` が h1 を保持するので #649 ADR-009 の不変条件は維持される。この「heading 境界が新たに tree 依存を含む（tree 失敗時にツールバーも fallback に落ちる）」挙動変化は ADR-003 にトレードオフとして明記し受容する。
- `DirectoryBreadcrumb` は `onClear` 廃止後にクライアント状態を持たない純表示コンポーネントになるので、server component（`HeaderSection`）から直接描画でき `"use client"` は不要。

#### (c) フォールバックチップの帰属（AC-6）

- フォールバックチップ（`segments.length === 0` 時の `filterChip` + ×）は **filter 語彙**であり、宙に浮いた id を辿れないため `×` 解除が妥当（Issue 方針4）。これは `FilterBar` 側（フィルタ行）に残す。
- `FilterBar` の現行ロジック（443–464行）から「パンくず描画ブランチ」を削除し、「フォールバックチップ描画ブランチ」だけを残す。すなわち `optimisticDirectoryId !== undefined && segments.length === 0` のときだけフォールバックチップを描画。
  - `FilterBar` は `directorySegments` を optimistic ではなく props 由来で持つ。optimistic で directory を解除（undefined 化）した直後も `segments`（props）は前の値のまま残りうるが、表示条件は `optimisticDirectoryId !== undefined` で gating されるので過渡表示は出ない（#710 ADR-002 の「directory optimistic は解除のみ」前提が効く）。
  - `DirectoryBreadcrumb` import と `onClear` 受け渡しを削除し、`clearDirectory` はフォールバックチップの × のみが使う。
- フォールバックチップを見出し上に動かすと filter 語彙が location 位置に混じるため動かさない。location（パンくず）はヘッダ、filter（フォールバックチップ）はフィルタ行、という棲み分けにする。

### レイアウト上の対称性確認

- 詳細: `<article><header><NoteBreadcrumb(mb-6)/><h1 mb-[10px]/>…`。
- 一覧（変更後）: `HeaderSection` 内で `DirectoryBreadcrumb`（mb-6、segments があるときのみ）→ `ViewSwitcher`（`<h1 mb-[10px]/>`）→ 件数/ツールバー行。
- → 見出し上の現在地アンカーとして対称になる。`directoryId` が無い時は一覧だけパンくず行が消える非対称が残るが、これは詳細が常に NoteBreadcrumb を持つのに対し一覧は条件付きという既存の差であり受容する。

## 実装ステップ

UI 層のみ。データ供給（内側）は既存のまま、表示（外側）を組み替える。

### 1. `DirectoryBreadcrumb` を `NoteBreadcrumb` パターンへ書き換え

- **対象ファイル:** `app/components/note/list/DirectoryBreadcrumb.tsx`
- **変更内容:**
  - `onClear` props と末尾 `CLEAR_BUTTON`(×) を削除。`CLEAR_BUTTON` 定数も削除。
  - 先頭 Folder アイコン（`LEADING_ICON` とその描画）を撤去。`Folder` import も削除。
  - 末尾セグメントを `aria-current="page"` の `text-ink-secondary` 非リンク `<span>` に、祖先を `<Link>` に（インデックス分岐）。区切りは要素間のみ。
  - `nav` 自身が `mb-6` を持つよう className を更新（`NoteBreadcrumb` に合わせる）。
  - JSDoc を「末尾 × を持つ / 先頭 Folder アイコン / 余白は呼び出し側」前提から「末尾は aria-current 非リンク、root crumb 無し、`nav` が `mb-6`、`HeaderSection` 内で見出し直前に描画」へ更新し、#743 / #710 supersede を明記。
- **理由:** AC-1/2/3。location 語彙への統一と詳細との対称化。

### 2. `HeaderSection` 内・見出し直前にパンくずを描画し、tree を共有参照で dedup

- **対象ファイル:** `app/components/note/HomePage.tsx`
- **変更内容:**
  - `HomePage` 本体で `const treeQuery = { actorUserId: userId }` を1回だけ作る。
  - `HeaderSection` / `FilterSection` の双方に `treeQuery` を props で渡す（同一参照配布）。
  - `HeaderSection` の `Promise.all` に `loadDirectoryTreeFlat(treeQuery)` を追加。await した `flat` から `directoryAncestorSegments(flat, search.directoryId)`（`directoryId` 未設定なら undefined）でセグメント算出し、`segments.length > 0` のとき `<ViewSwitcher>` の直前に `<DirectoryBreadcrumb segments={segments} />` を描画。
  - `FilterSection` の `loadDirectoryTreeFlat({ actorUserId: userId })` インラインリテラル呼び出しを、共有 `treeQuery` 参照に変える（`BulkActionBar` 用の `flat` もこの参照経由）。
  - 新しい async server component や `<Suspense>` / `SectionErrorBoundary` 境界は追加しない。既存「ツールバー」境界をそのまま使う。
- **理由:** AC-4。location インジケータを詳細と同じ「見出し上」位置へ。共有参照で二重 I/O を回避。

### 3. `FilterBar` からパンくず描画を撤去しフォールバックチップのみ残す

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`
- **変更内容:**
  - `DirectoryBreadcrumb` の import と呼び出し（443–464行のパンくずブランチ）を削除。
  - `optimisticDirectoryId !== undefined && segments.length === 0` のときだけフォールバックチップ（`filterChip` + × → `clearDirectory`）を描画するよう簡素化。行コメントを location/filter 棲み分けの説明に更新。
  - `directorySegments` props は **フォールバック分岐の gating にのみ使う**形で残す（解決可否の判定に必要）。`onClear` 受け渡しは消える。
- **理由:** AC-6。filter 語彙のフォールバックはフィルタ行に残し、location はヘッダへ分離。

### 4. テスト更新

- **対象ファイル:**
  - `app/components/note/list/__tests__/DirectoryBreadcrumb.test.tsx`（新規）— `NoteBreadcrumb.test.tsx` を範にとり、祖先=リンク / 末尾=`aria-current="page"` 非リンク / × が無い / 区切りが要素間のみ / 累積 id key / **先頭 Folder アイコン無し**、を検証（AC-7a）。
  - `app/components/note/list/__tests__/FilterBar.test.tsx`（改修）— #710 パンくず系テスト（709–827行）を再構成。FilterBar からパンくずが消えるので、FilterBar 側は「segments があっても nav（`aria-label="現在のディレクトリ"`）が描画されない」回帰（AC-7b）と、フォールバックチップ（segments 空）が残り × で `clearDirectory` navigate が走ることを検証。FilterBar 内のセグメントリンク/separator/× navigate（nav 内）テストは DirectoryBreadcrumb 単体テスト側へ移設。
  - HeaderSection 経由でパンくずが見出しの上に出ること（テスト可能な範囲で）を確認（AC-7c）。
- **AC↔テスト対応:** AC-7a → DirectoryBreadcrumb 単体テスト。AC-7b → FilterBar 回帰テスト。AC-7c → HeaderSection 配置テスト。
- **注意:**
  - Folder アイコン撤去・root crumb 不採用により、separator カウントの前提が変わる（#710 テストの「Folder アイコン除外」ロジックは不要になり、`NoteBreadcrumb` と同じ「要素間のみ＝セグメント数 - 1」の素直なカウントになる）。
  - `FilterBar.test.tsx` の `Link` モックは `search.directoryId` を `data-directory-id` に出すが、祖先リンク検証は DirectoryBreadcrumb 単体テスト側へ移る。
- **理由:** AC-7a/b/c。× 廃止・aria-current・Folder アイコン撤去・新配置に整合させる。

### 5. ADR 追補（#710 supersede 記録）

- **対象ファイル:** `.issue/743/adr.md`
- **変更内容:** ADR-001〜003 を記録し、#710 ADR-001（末尾 × 前提・全セグメントリンク・先頭 Folder アイコン・余白は呼び出し側）/ ADR-002（別行配置）の該当部分を本 Issue で supersede した旨を明記。
- **理由:** AC-8 / Issue 備考。

## 設計判断

詳細は `.issue/743/adr.md`。

- **ADR-001:** 末尾の非リンク化・先頭 Folder アイコン撤去・`nav` の `mb-6` 内包・× 廃止。root crumb は採用しない（揃える先 `NoteBreadcrumb` に root crumb が無く、フルリセットは既存 clear-all で担保済み）。#710 ADR-001 の supersede。
- **ADR-002:** 表示位置を `HeaderSection` 内・`ViewSwitcher`(h1) 直前へ移す方針と、location（パンくず=ヘッダ）/ filter（フォールバックチップ=フィルタ行）の棲み分け。#710 ADR-002 の supersede。
- **ADR-003:** 新 async component / 専用境界は設けず `HeaderSection` に取り込む。tree は共有 `treeQuery` 参照で dedup（参照同一性。構造同値では dedup されない点を明記）。heading 境界が新たに tree 依存を含むトレードオフを受容。

## リスクと注意点

- **tree の dedup は参照同一性で成立する**: `cache()` は引数を参照同一性でキー化する（HomePage JSDoc 明記）。`HeaderSection` と `FilterSection` が**同一の `treeQuery` 参照**で `loadDirectoryTreeFlat` を呼ぶことで初めて dedup される。各セクションが別々のインラインリテラル `{ actorUserId }` を作ると構造同値でも別参照になり二重 I/O になるため、`HomePage` で1回作って配ること。
- **heading 境界が tree 依存を持つ**: tree loader 失敗時は `HeaderSection` 全体が fallback に落ちる（ツールバーも巻き込む）。ただし `fallbackHeading` が静的 h1 を保持するので #649 ADR-009 の「ページが h1 を失わない」不変条件は維持される。この挙動変化はトレードオフとして受容（ADR-003）。
- **ヘッダのパンくず（server props）とフィルタ行のフォールバック（optimistic gating）の更新タイミング差**: 両者は出現条件が排他（segments 解決可 → ヘッダのパンくず / 解決不能 → フィルタ行のフォールバックチップ）で同時には出ないため、解除遷移中に片方が前の値で残っても実害は無い。
- **テスト構成の移動**: パンくず検証の主軸が FilterBar から DirectoryBreadcrumb 単体 + HeaderSection 配置確認へ移る。FilterBar 側テストの削除/移設で検証漏れが出ないよう、AC-7a/b/c と対応付けて移すこと（上記「AC↔テスト対応」）。

## テスト方針

- `DirectoryBreadcrumb.test.tsx`（新規, AC-7a）: 祖先リンク / 末尾 aria-current 非リンク / × 不在 / 区切り（要素間のみ）/ 累積 id key / 先頭 Folder アイコン無し。
- `FilterBar.test.tsx`（改修, AC-7b）: directory パンくずが FilterBar から消えたこと（segments ありでも nav が出ない）、フォールバックチップ（segments 空）が残り × で `clearDirectory` navigate が走ること、フルリセット「フィルタをすべてクリア」が directory も含めて消すこと（既存挙動の回帰確認）。
- HeaderSection 配置（AC-7c）: segments があるとき `DirectoryBreadcrumb` の nav が h1 の上に描画されることを確認。`HeaderSection` は async server component で loader 依存のため DOM 順序の単体テストが現実的に書けない場合は、AC-4 は「`DirectoryBreadcrumb` 単体テスト（描画構造）＋ 手動ブラウザ確認（h1 上配置）」で担保してよい。`HeaderSection` で await した tree 結果は**パンくずのセグメント算出専用**で、ViewSwitcher / 件数 / ツールバーのロジックには影響させない。
- clear-all の回帰（AC-7b 補強）: `directoryId` 設定時に「フィルタをすべてクリア」が残り、押下で `directoryId` を含む全フィルタが消えること（root crumb 不採用後の唯一の directory 解除導線）を確認。
- 既存の `NoteBreadcrumb.test.tsx` は不変（揃える先なので回帰確認のみ）。
- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit` を通す。
- 手動: directory 選択時に見出し上にパンくず表示・祖先リンク遷移・末尾非リンク・× 無し、削除済み id でフォールバックチップがフィルタ行に出ること、`directoryId` 設定時に clear-all が出ることをブラウザ確認。

## レビュー履歴

### 1周目

**修正した点**:
- arch P-001（dedup 機構の誤り）: ADR-003 と plan の「`cache()` の同一レンダー dedup で二重 I/O にならない（構造同値でキー化）」前提を撤回。`cache()` は引数の**参照同一性**でキー化するため、構造同値の別リテラルは二重フェッチになる。正しい機構＝「`HomePage` で `treeQuery` を1回作り、`HeaderSection`/`FilterSection` に同一参照で配布」（`notesQuery` パターン）に書き換えた。plan のリスク欄・調査結果・ADR-003 の曖昧記述を確定機構へ修正。
- arch P-002 / P-003（過剰設計・h1 衝突）: 新 async server component（`DirectoryLocationSection`）と専用 Suspense/`SectionErrorBoundary` 境界の新設を撤回。代わりにパンくずを既存 `HeaderSection` 内・`ViewSwitcher`(h1) 直前に描画し、既存「ツールバー」境界を再利用。`fallbackHeading` による h1 保持で #649 ADR-009 不変条件を維持。heading 境界が tree 依存を含むトレードオフを ADR-003 に明記。実装ステップ・設計(b)・リスクを全面改稿。
- coverage P-001 / arch S-001（root crumb と AC-5 の矛盾）: root crumb「すべてのノート」を**不採用**に変更（揃える先 `NoteBreadcrumb` に root crumb 無し / `HOME_SEARCH` への root crumb は他フィルタも落とし既存 clear-all と冗長 / フルリセットは既存 clear-all で担保、`directoryId` 設定時は `hasAnyHomeFilter` true で clear-all が必ず表示）。AC-5 を「全ノートに戻るは既存 clear-all で担保（不変）」へ書き換え、root crumb 関連の実装ステップ・設計・ADR-001 (B) 採用・separator 追加記述を全削除。Folder アイコンも撤去（NoteBreadcrumb に揃える）。

**取り込んだ改善提案**:
- coverage S-001: AC-4 に「`nav` 自身が `mb-6` を持ち、`HeaderSection` 内で `ViewSwitcher`(h1) 直前に描画」と確定値を明記。
- coverage S-002: AC-6 の対応ステップを S3 に確定。
- coverage S-004 / arch S-003: AC-7 を AC-7a（DirectoryBreadcrumb 単体）/ AC-7b（FilterBar から nav が消える回帰）/ AC-7c（HeaderSection 経由で見出し上）に分割。AC↔テスト対応を明記。Folder アイコン撤去・root crumb 不採用で separator カウント前提が変わる点を注記。
- arch S-002: ヘッダ側パンくず（server props）とフィルタ行フォールバック（optimistic gating）の更新タイミング差を、出現条件が排他で実害なしとリスク欄に明記。

**見送った提案とその理由**:
- coverage S-003（root crumb を独立 AC 化）: root crumb 不採用により対応不要（moot）。

### 2周目

両視点とも問題点ゼロで終了。Round 1 の P 系（dedup 機構・過剰設計・root crumb 矛盾）はすべて解消を確認。残った軽微な改善提案のみ取り込んだ:
- coverage S-001: AC-7b に「`directoryId` 設定時に clear-all が残り、押下で全フィルタが消える」回帰観点を補強。
- arch S-001: `HeaderSection` で await した tree 結果は「パンくずのセグメント算出専用」でツールバー系ロジックに影響させない旨を AC-7c / テスト方針に明記。
- arch S-002: AC-7c の「テスト可能な範囲で」を、DOM 順序の単体テストが書けない場合は「単体テスト＋手動ブラウザ確認」で AC-4 を担保してよい逃げ道として明文化。
