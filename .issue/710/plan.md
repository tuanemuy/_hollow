# 実装計画 — Issue #710: ノート一覧: ディレクトリのフィルター表示をチップからパンくず（現在地ナビ）に変更する

**Issue:** #710
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ノート一覧（P10 ホーム）の `FilterBar` で、ディレクトリの絞り込み状態をタグと同一のチップ（`filterChip` + `data-active` + `×`）で表示している現状を、ノート詳細の `NoteBreadcrumb` と同じパンくず（root › Documents › Research）表示に置き換える。「絞り込み」ではなく「階層の現在地」であることをナビゲーション言語で正しく伝え、かつどの階層にいるかを可視化する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ディレクトリを開いた一覧で、末端名だけのチップではなく、祖先を辿ったパンくず（例: `Documents › Research`）が `nav` 要素として表示される | Issue 対応方針 | 1, 3, 4 |
| AC-2 | 各セグメント（root を除く中間〜末端）が `<Link to="/" search={{ ...HOME_SEARCH, directoryId: segment.id }}>` でリンクされ、クリックでその階層に絞り込みジャンプできる | Issue 実装メモ | 3, 4 |
| AC-3 | パンくず末尾に「ディレクトリフィルタを解除」`×`（`clearDirectory`）が残り、押すとディレクトリ絞り込みが解除される | Issue 実装メモ | 4 |
| AC-4 | `optimisticDirectoryId === undefined`（解除直後／未選択）のときパンくずは非表示。`optimisticDirectoryId !== undefined` かつ segments が非空のときパンくずを表示 | Issue 実装メモ | 4 |
| AC-5 | `optimisticDirectoryId !== undefined` だが segments が空（id がツリーに無い／削除直後／解決失敗）の場合は従来同様のフォールバック表示（汎用ラベル「ディレクトリ」+ `×`）になる。空 `nav` は描画しない | Issue 実装メモ | 4 |
| AC-6 | root セグメントはリンク化しない（または除外）。root の `directoryId` をフィルタに渡さない（`.issue/356/adr.md` ADR-002 踏襲） | Issue 実装メモ / #356 ADR-002 | 1, 4 |
| AC-7 | パンくずは折り返しチップ群（タグ・期間・公開状態・内部リンク参照）とは別行に配置される | Issue 実装メモ（モック） | 4 |
| AC-8 | 既存のタグ／期間／公開状態／内部リンク参照チップ・`clearAll` の挙動に回帰がない | 回帰防止 | 4, 5 |

## スコープ

### 含まれないもの
- バックエンド（ドメイン／ユースケース／アダプター）の変更。追加 I/O 不要のため一切触れない（Issue に「追加 I/O 不要」と明記）。
- ノート詳細側 `NoteBreadcrumb` の変更。本 Issue は P10 一覧側のディレクトリ表示のみが対象。`NoteBreadcrumb` は「title を末尾に持つ」前提で設計されており一覧側と用途が異なるため、共通化はしない（後述 ADR-001）。
- 内部リンク参照チップ・期間／公開状態ポップオーバー等、ディレクトリ以外の facet の体裁変更。

## 調査結果

- 関連ファイル:
  - `app/components/note/list/FilterBar.tsx` — ディレクトリチップ描画（373-387）、props（`directoryId` 55 / `directoryName?` 56、引数 133-134）、optimistic reducer の `clearDirectory`（107-108, 252-256）。`"use client"` コンポーネント。
  - `app/components/note/HomePage.tsx` — `FilterSection`（161-202）が `loadDirectoryTreeFlat` で `flat` ツリーをロード済み。現状は `flat.find` で `directoryName` を1セグメントだけ解決して渡している（179-193）。
  - `app/components/note/directoryTree.ts` — `FlatDirectory` 型（14-20、`id` / `parentId: string | null` / `name` / `depth` / `path` を持つ）。`flattenDirectoryTree` ほか純粋ヘルパー群の SSOT。root は `name === ""`。
  - `app/components/note/detail/NoteBreadcrumb.tsx` — 既存パンくず実装。`Separator`（ChevronRight 16px）、`CRUMB_LINK`、`nav aria-label="パンくず"`、`{ ...HOME_SEARCH, directoryId }` リンクのパターン SSOT。区切りは「要素間のみ」（先頭の前には出さない、commit 322516ee）。`NoteBreadcrumbProps.segments` は `readonly { id: string; name: string }[]` をインラインで持つ（19-22）。本 Issue で導入するセグメント型はこれと同一形のため共有型に SSOT 化する（後述）。
  - `app/components/auth/links.ts` — `HOME_SEARCH = {}`（空 search ペイロードの SSOT）。
  - `app/components/note/list/styles.ts` — `filterChip` 等チップ語彙（78-85）、`filterBar` コンテナ（99）。`filterChip` の JSDoc（62-77、特に 68-69 行）が「Directory has no in-bar trigger … shows just the active chip (#497 ADR-001)」と明記しており、本 Issue の表示形態変更で実態と乖離する（→ 実装ステップ 3 で同期）。
  - `app/components/note/list/__tests__/FilterBar.test.tsx` — happy-dom + createRoot ベースの既存テスト。`Link` をモックして属性検証する `NoteBreadcrumb.test.tsx` のパターンが参考になる。
- あるべきアーキテクチャ:
  - 本変更はプレゼンテーション層のみ（TanStack Start RSC + client component）。`CLAUDE.md` の「presentation → application → domain」の依存方向に従い、内側へは触れない。
  - 「追加 I/O 不要」の根拠: `FilterSection` が既に `flat` をロード済みで、各ノードが `parentId` / `name` を持つため、`directoryId` から `parentId` を辿るだけで祖先セグメントを純粋関数で再構成できる（ユースケース `DirectoryService.computeSegments` を呼ぶ必要なし）。
  - 純粋ヘルパーは `directoryTree.ts`（既存の flatten/exclude 系純粋関数の置き場）に集約するのが規約に合致。`loaders.ts`（`serverData(getContainer())` に依存する runtime 入口）には純粋ヘルパーを置かない方針（`directoryTree.ts` JSDoc 参照）。
- 既存実装の状態:
  - 現状はディレクトリを `filterChip data-active` で「タグと同形のチップ」として表示しており、Issue が問題視する「絞り込みに見える／階層が分からない」状態。あるべき姿（ナビゲーション言語のパンくず）と乖離しており、本 Issue で是正する。
  - `.issue/497/adr.md` ADR-001 は「ディレクトリは in-bar トリガーを持たず active チップのみ表示」と決めた経緯。本 Issue はこの表示形態の再検討であり、ADR-001 の「チップのみ表示」を「パンくず表示」に更新することになる（後述 ADR-002）。
- 依存関係:
  - `FilterBar` の props 型変更（`directoryName?: string` → `directorySegments?`）は唯一の呼び出し元 `HomePage.tsx` の `FilterSection` に波及する。`FilterBar` を使う他の箇所は無い（grep 済み）。
  - `directoryName` prop は `FilterBar` 専用（`DirectoryPicker` / `DeleteDirectoryDialog` 等の `directoryName` は別コンポーネントの無関係な同名 prop）。

## 設計

レイヤーの内側から外側へ。

### ドメインモデルへの影響
なし。エンティティ・値オブジェクト・不変条件・ポートいずれも変更しない。Issue は「居場所の表示形態」という純粋な UI 表現の変更であり、ディレクトリの階層モデル自体は既存の `flat` ツリー（`parentId` リンク）で完全に表現済み。

### ユースケース / アプリケーションロジック
なし。追加 I/O 不要。`getNoteDetail` 系の `directorySegments` 拡張（詳細側）は既存で、一覧側は `loadDirectoryTreeFlat` の既存出力（`flat`）だけで完結する。セグメント再構成は presentation 層の純粋ヘルパーで行う。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
3 つの変更で構成する。

1. 共有セグメント型と純粋ヘルパーの追加（`directoryTree.ts`）
   - 共有型 `BreadcrumbSegment = Readonly<{ id: string; name: string }>` を `directoryTree.ts` で export し、セグメント形の SSOT とする。`NoteBreadcrumbProps.segments`（現状インラインの `readonly { id: string; name: string }[]`）と完全同形なので、`NoteBreadcrumb`・新設 `DirectoryBreadcrumb`・`FilterBar` props・ヘルパー戻り値の全てがこの共有型を参照するように揃える（既存 `NoteBreadcrumb` のインライン型も `readonly BreadcrumbSegment[]` 参照に置換）。置き場は両パンくずの中立な依存元である `directoryTree.ts`（純粋ヘルパー SSOT）が適切で、detail/list どちらの方向にも依存を作らない。
   - `flat` と `directoryId` から root→現在地の祖先セグメント `readonly BreadcrumbSegment[]` を再構成する純粋関数 `directoryAncestorSegments(flat, directoryId)` を追加。
   - アルゴリズム: `id → FlatDirectory` の Map を作り、`directoryId` から `parentId` を `null` になるまで辿って配列に積み、逆順にして root→leaf 順に並べる。`name === ""`（root）セグメントは除外する（`flattenDirectoryTree` が root の空名を落とすのと同じ規約）。`directoryId` がツリーに無い場合は空配列を返す（→ FilterBar 側がフォールバック表示）。循環や `parentId` 切れに対するガード（visited セット／祖先が Map に無ければ打ち切り）を入れる。
   - root 除外の責務境界を JSDoc に明記（S-003 arch）: 呼び出し側（ツリー Link）が root id を渡さない前提でも（#356 ADR-002）、ヘルパー側でも防御的に `name === ""` を除外する二重防御である旨を 1 行残し、「呼び出し側が保証するなら除外不要」というリグレッションを防ぐ。
   - 置き場の理由: 既存の純粋 flatten/exclude ヘルパーと同じ `directoryTree.ts` に集約。`loaders.ts` に純粋ロジックを置かない方針に合致し、ユニットテストが容易。

2. パンくず描画コンポーネントの追加（`app/components/note/list/DirectoryBreadcrumb.tsx`、新規）
   - `NoteBreadcrumb` のパターン（`nav` + `Separator`（ChevronRight 16px）+ 区切りは要素間のみ + `CRUMB_LINK` + `{ ...HOME_SEARCH, directoryId }` リンク）を踏襲しつつ、末尾は「title」ではなく「`×` 解除ボタン」を持つ一覧専用の派生。
   - `nav aria-label` 文言（S-002 arch）: `NoteBreadcrumb` は詳細（P11）で `aria-label="パンくず"` を使う。本コンポーネントは一覧（P10）に置くため、実装時に一覧ページの landmark 構成（ページネーション等の他 `nav`）を一度照合し、ノート詳細のパンくずと読み上げ上区別できるよう `aria-label="現在のディレクトリ"` 等に文言を差別化する。`NoteBreadcrumb` の `aria-label="パンくず"` はそのまま流用しない。
   - props: `segments: readonly BreadcrumbSegment[]`（共有型）と `onClear: () => void`。各セグメントを `<Link to="/" search={{ ...HOME_SEARCH, directoryId: segment.id }}>` でリンク。先頭フォルダアイコン（Issue モックの 📁、`lucide-react` の `Folder` 等）を任意で付ける。
   - key はセグメントの累積 id パス（`NoteBreadcrumb` と同じ。同名ディレクトリの兄弟衝突回避）。
   - スタイルは `filterChip` 語彙を使わず `text-sm text-ink-tertiary` 系のナビゲーション言語にする（チップに見せない）。
   - `"use client"` は不要（純粋描画 + 親から渡る `onClear` コールバック）だが、`onClear` を呼ぶため client ツリー内に置かれる（`FilterBar` が client）。新規ファイルに `"use client"` 指定は付けない（純粋コンポーネント）。
   - 配置の理由: `FilterBar` 本体に長い JSX を足すと肥大化するため、`DatePopover` 等と同様にサブコンポーネント分割する。ただし別 facet を `nav` 行に出す都合上、`FilterBar` のチップ列 `<div className={filterBar}>` の外（別行）にレンダリングする（AC-7）。

3. `FilterBar` の props 置換と描画変更（`FilterBar.tsx`）
   - props を `directoryName?: string` → `directorySegments?: readonly BreadcrumbSegment[]`（共有型）に置換（55-56, 133-134）。
   - 現状のディレクトリチップ（373-387）を削除し、チップ列 `<div className={filterBar}>` の直後に別ブロックでパンくず行を描画する。
   - 表示分岐（AC-4 / AC-5）— directory の optimistic は `clearDirectory`（undefined 化）のみで set 系が無く、ディレクトリ「選択」はツリー側 Link の通常 navigate を通る。よって `optimisticDirectoryId` が「`undefined` でも `directoryId`（baseline）でもない第三の値」になる過渡状態は構造上発生しない。表示分岐は「undefined 判定」＋「segments 有無」の2軸で閉じる:
     - `optimisticDirectoryId === undefined` → 何も描画しない。
     - segments が非空 → `DirectoryBreadcrumb` でパンくず表示。
     - segments が空（id がツリーに無い／削除直後等で解決失敗） → 従来同様の汎用フォールバック（`filterChip data-active` の「ディレクトリ」+ `×`）。現状コードの分岐構造を温存して回帰を避ける。
   - 「optimistic≠baseline の過渡状態でフォールバック」という旧記述は到達不能ケースに基づくため削除した。`optimisticDirectoryId === directoryId` の一致判定は segments が baseline 由来で意味を持つ限りほぼ常に true となり冗長なので、分岐条件には用いない（segments 有無で判定する）。
   - `clearDirectory` はパンくず末尾 `×`（`DirectoryBreadcrumb` の `onClear`）とフォールバックチップ `×` の双方に渡す。
   - `styles.ts` の `filterChip` JSDoc 更新: 「Directory has no in-bar trigger … shows just the active chip (#497 ADR-001)」の記述を、ディレクトリはパンくず（`DirectoryBreadcrumb`）で表示する旨（#710 ADR-002）に書き換える。フォールバック時にのみ `filterChip` を使う点も併記。
   - `hasAnyFilter`（296-301、`clearAll` 表示判定）に `optimisticDirectoryId` が既に含まれているため変更不要。

4. `HomePage.tsx` の `FilterSection` 更新（179-196）
   - `directoryName` の単一セグメント解決を、`directoryAncestorSegments(flat, search.directoryId)` による全セグメント再構成に置き換える。
   - `FilterBar` への受け渡しを `directorySegments`（root を除外済み配列）に変更。`search.directoryId === undefined` のときは渡さない（現状の条件付きスプレッドと同じ作法）。

## 実装ステップ

依存方向の順（内側＝純粋ヘルパー → コンポーネント → 配線）。

### 1. 共有セグメント型と祖先セグメント再構成の純粋ヘルパーを追加

- **対象ファイル:** `app/components/note/directoryTree.ts`（＋ `app/components/note/detail/NoteBreadcrumb.tsx` の型参照差し替え）
- **変更内容:**
  - 共有型 `BreadcrumbSegment = Readonly<{ id: string; name: string }>` を `directoryTree.ts` で export し、セグメント形の SSOT 化。`NoteBreadcrumbProps.segments` のインライン `readonly { id: string; name: string }[]` を `readonly BreadcrumbSegment[]` 参照に置換（同形につき互換、描画ロジックは不変）。
  - `directoryAncestorSegments(flat: ReadonlyArray<FlatDirectory>, directoryId: string): readonly BreadcrumbSegment[]` を追加。`id → FlatDirectory` の Map を作り、`directoryId` から `parentId` を辿って root→leaf 順のセグメント配列を構築。`name === ""`（root）を除外。id がツリーに無ければ空配列。visited セットで循環ガード、祖先が Map に無ければ打ち切り。
  - JSDoc に「root の空名除外」「id 不在時は空配列（呼び出し側フォールバック）」に加え、root 除外が #356 ADR-002（呼び出し側が root id を渡さない）に対する防御的二重防御である責務境界を 1 行記載（S-003 arch）。
- **理由:** 追加 I/O なしで階層を再構成する純粋ロジックを既存の純粋ヘルパー置き場に集約（AC-1, AC-6 の root 除外）。セグメント型を SSOT 化し将来の構造変更の追従漏れを防ぐ（S-001 arch）。

### 2. 一覧用パンくずコンポーネントを追加

- **対象ファイル:** `app/components/note/list/DirectoryBreadcrumb.tsx`（新規）
- **変更内容:** `NoteBreadcrumb` のパターン（`Separator` = ChevronRight 16px、要素間のみ区切り、`CRUMB_LINK`、`{ ...HOME_SEARCH, directoryId }` リンク、累積 id key）を踏襲し、末尾を `×` 解除ボタンにした `DirectoryBreadcrumb({ segments, onClear })`（`segments: readonly BreadcrumbSegment[]`）を実装。先頭にフォルダアイコン。チップ語彙（`filterChip`）は使わずナビゲーション言語のスタイル。`nav aria-label` は一覧ページ（P10）の landmark 構成（ページネーション等の他 `nav`）と照合し、ノート詳細の `aria-label="パンくず"` とは差別化（例: `aria-label="現在のディレクトリ"`）して読み上げの曖昧さを避ける（S-002 arch）。
- **理由:** 「絞り込みチップ」ではなく「現在地ナビ」の見た目に統一（AC-1, AC-2, AC-3）。`NoteBreadcrumb` を直接流用しないのは末尾要素の意味（title vs 解除ボタン）が異なるため（ADR-001）。

### 3. FilterBar の props 置換と描画変更

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`、`app/components/note/list/styles.ts`
- **変更内容:**
  - `Props` の `directoryName?: string` を `directorySegments?: readonly BreadcrumbSegment[]`（共有型）に置換（引数分割も合わせて変更）。
  - 既存ディレクトリチップ（373-387）を削除。チップ列 `<div className={filterBar}>` の閉じタグ直後に、別行のパンくずブロックを追加。
  - 表示分岐（undefined 判定 + segments 有無の2軸）: `optimisticDirectoryId === undefined` → 非表示／`directorySegments` 非空 → `<DirectoryBreadcrumb segments={directorySegments} onClear={clearDirectory} />`／segments 空（id 不在・削除直後等） → 従来の汎用フォールバックチップ（`×` は `clearDirectory`）。「optimistic≠baseline の過渡状態」分岐は到達不能のため書かない。
  - **注意点（S-001 arch）:** `directorySegments` は `directoryId` 自体が未選択のとき prop 未渡し（`undefined`）、`directoryId` ありで解決失敗のとき `[]` という2形態を取りうる。表示分岐は `(directorySegments ?? []).length > 0` のように正規化して扱い、`undefined`（未選択）と `[]`（解決失敗）で segments 有無の判定挙動が分かれないようにする。
  - `DirectoryBreadcrumb` の import を追加。
  - `styles.ts` の `filterChip` JSDoc（62-77、68-69 行）から「Directory … shows just the active chip (#497 ADR-001)」を除去し、ディレクトリはパンくず表示（#710 ADR-002）でフォールバック時のみ `filterChip` を使う旨に更新（P-001）。
- **理由:** AC-1〜AC-7 を満たし、id 不在時のフォールバックで回帰を防ぐ（AC-5, AC-8）。JSDoc を実態（#710 ADR-002）と同期しドキュメント乖離を防ぐ（P-001）。

### 4. HomePage の FilterSection 配線変更

- **対象ファイル:** `app/components/note/HomePage.tsx`
- **変更内容:** `directoryName` 解決（179-182）を `directoryAncestorSegments(flat, search.directoryId)` に置換し、`directoryTree.ts` から import。`FilterBar` への受け渡しを `directorySegments`（`search.directoryId === undefined` のときは渡さない条件付きスプレッド）に変更。`directoryName` 受け渡し（193）を削除。
- **理由:** 既存ロード済み `flat` から追加 I/O なしでセグメントを供給（AC-1, AC-6）。

### 5. テストの追加・更新

- **対象ファイル:**
  - `app/components/note/__tests__/directoryTree.test.ts`（既存があれば追記、無ければ新規）— `directoryAncestorSegments` のユニットテスト: ネスト（root→Documents→Research が root 除外で2セグメント）、root 直下（空配列）、id 不在（空配列）、循環/parentId 切れガード。
  - `app/components/note/list/__tests__/FilterBar.test.tsx` — `renderBar*` ヘルパーに `directorySegments` を渡せるよう拡張し、(a) segments を渡すと `nav` パンくず + 各セグメントの `directoryId` スコープ Link が出ること、(b) `optimisticDirectoryId === undefined` で非表示、(c) `optimisticDirectoryId` 確定だが segments 空でフォールバックチップ表示・`nav` を描画しないこと（AC-5）、(d) 末尾 `×` で `clearDirectory` 相当の navigate が走ること、を `Link`/`useRouter` モックで検証（`NoteBreadcrumb.test.tsx` の Link モック手法を流用）。
  - 必要なら `app/components/note/list/__tests__/DirectoryBreadcrumb.test.tsx`（新規）で描画契約（区切りは要素間のみ／root 非含有／各 Link の search 属性）を `NoteBreadcrumb.test.tsx` に倣って検証。
- **理由:** AC の検証可能性を担保し、過渡状態フォールバック（AC-5）・root 除外（AC-6）の回帰を防ぐ。

### 6. 仕上げ

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`。`.issue/497/adr.md` ADR-001（「ディレクトリは active チップのみ表示」）が本変更で実態と矛盾するため、ADR-002（本 Issue）で上書きを明記する（plan の ADR 参照）。既存 ADR-001 ファイル自体は履歴として残す。`styles.ts` JSDoc の同期はステップ 3 で実施済み。
- **理由:** `CLAUDE.md` の品質ゲート遵守。

## 設計判断

- ADR-001: `NoteBreadcrumb` を直接流用せず、一覧用 `DirectoryBreadcrumb` を新設する（末尾要素の意味の違い）。
- ADR-002: ディレクトリの表示形態を「active チップ」から「パンくず」に変更し、`.issue/497/adr.md` ADR-001 を上書きする。
- 詳細は `.issue/710/adr.md` 参照。

## リスクと注意点

- directory の optimistic は `clearDirectory`（undefined 化）のみで set 系を持たない（`FilterBar.tsx:107-108`）。ディレクトリ「選択」はツリー側 Link の通常 navigate を通るため、`optimisticDirectoryId` が `undefined` でも `directoryId`（baseline）でもない第三の値になる過渡状態は構造上発生しない。よって表示分岐に「optimistic≠baseline」を書くと到達不能コードになる。分岐は「undefined → 非表示」「segments 非空 → パンくず」「segments 空 → フォールバック」の2軸で閉じ、`optimisticDirectoryId === directoryId` の一致判定はほぼ常に true で冗長なため使わない。
- `flat` に `directoryId` が無いケース（削除直後など）: `directoryAncestorSegments` が空配列を返し、FilterBar がフォールバックチップを出す。空配列をパンくず表示に渡すと「空 nav」になるため、segments 非空を表示条件に含める（AC-5）。
- root セグメント混入の防止: `name === ""` 除外をヘルパー側で行い、`directoryId` に root id を渡さない（#356 ADR-002）。万一 root のみが選択された場合は空配列 → フォールバック。
- レイアウト回帰: パンくずをチップ列 `filterBar`（`max-sm` で横スクロール）の外・別行に置くため、モバイル横スクロールとパンくず折り返しが干渉しないこと。`NoteBreadcrumb` の `flex-wrap [overflow-wrap:anywhere]` を踏襲し、`mb-*` をチップ行と整合させる。
- props 置換の波及は `HomePage.tsx` のみ（grep で確認済み）。`FilterBar` の他利用箇所なし。

## テスト方針

- ユニット（`directoryAncestorSegments`）: ネスト/root直下/不在/循環ガードを vitest で検証。
- コンポーネント（`FilterBar` / `DirectoryBreadcrumb`）: happy-dom + createRoot、`Link`/`useRouter` モックで、パンくず描画・各セグメントの `directoryId` スコープリンク・解除 `×`・非表示/フォールバック分岐を検証（既存 `FilterBar.test.tsx` / `NoteBreadcrumb.test.tsx` の手法を流用）。
- 既存 `FilterBar.test.tsx` のタグ/期間/公開状態/clearAll テストが回帰しないこと（AC-8）。
- 手動/ブラウザ: ディレクトリツリーからフォルダを開く → パンくず表示、中間セグメントクリックでジャンプ、`×` で解除、root 直下では root をリンクにしない、を確認（testing.md 化は実装フェーズ）。

## レビュー履歴

### 1周目
**修正した点**:
- **[P-001 (arch)]** `styles.ts` の `filterChip` JSDoc（#497 ADR-001「ディレクトリは active チップのみ表示」）の同期を計画に追加。実装ステップ 3 の対象ファイルに `styles.ts` を加え、JSDoc を #710 ADR-002（パンくず表示・フォールバック時のみ `filterChip`）へ更新する変更内容を明記。調査結果にも乖離箇所を記載。
- **[P-002 (arch)]** 表示分岐から到達不能な「optimistic≠baseline の過渡状態」記述を削除。directory の optimistic は解除（undefined 化）のみで set 系がなく第三の値が発生しない点を根拠に、分岐を「(a) `optimisticDirectoryId === undefined` → 非表示／(b) segments 非空 → パンくず／(c) segments 空 → フォールバック」の2軸（undefined 判定 + segments 有無）に整理。設計・実装ステップ 3・リスク節・AC-4/AC-5・adr.md ADR-002 を書き直した。

**取り込んだ改善提案**:
- **[S-002 (coverage)]** segments 空時フォールバック（汎用ラベル「ディレクトリ」+ `×`、空 `nav` を描画しない）を AC-5 に検証可能な形で明示。発火条件を `optimisticDirectoryId !== undefined` かつ segments 空に確定。
- **[S-001 (arch)]** セグメント型を共有型 `BreadcrumbSegment = Readonly<{ id: string; name: string }>` として `directoryTree.ts`（両パンくずの中立な依存元）に SSOT 化。既存 `NoteBreadcrumbProps.segments` のインライン同形型もこれを参照する方針を実装ステップ 1 に反映。
- **[S-002 (arch)]** `DirectoryBreadcrumb` の `nav aria-label` を一覧ページ（P10）の landmark 構成と照合し、ノート詳細の `aria-label="パンくず"` とは差別化（例: `aria-label="現在のディレクトリ"`）する旨を設計・実装ステップ 2 に明記。
- **[S-003 (arch)]** root 除外の二重防御（ヘルパーの `name === ""` 除外 + #356 ADR-002 の root id 不渡し）の責務境界を `directoryAncestorSegments` の JSDoc に残す旨を実装ステップ 1 に反映。

**見送った提案とその理由**:
- **[S-001 (coverage)]** 「追加 I/O 不要」を検証可能な AC として明文化する提案 → 見送り。実装制約であって検証可能なユーザー観点の受け入れ基準にはなじまず、AC を冗長にする。純粋性はユニットテストで担保され、調査結果セクション記載の方針で十分。

### 2周目
両視点とも問題点ゼロで終了（arch-risk の改善提案 S-001 を実装ガイドとして反映、coverage は指摘なし）。

**取り込んだ改善提案**:
- **[S-001 (arch)]** `FilterBar` の受け取り側で `directorySegments` の `undefined`（未選択）と `[]`（解決失敗）で表示分岐挙動が分かれないよう `(directorySegments ?? []).length > 0` のように正規化する旨を、実装ステップ 3 の注意点に追記。prop 受け渡し作法（条件付きスプレッド）と表示分岐の境界が曖昧にならないようにする。
