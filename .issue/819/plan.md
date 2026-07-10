# 実装計画 — Issue #819: ページ遷移時に「読み込んでいる感」がなく操作にラグを感じる（特にノート編集画面）

**Issue:** #819
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

ページ遷移（特に詳細→編集 `/notes/$noteId/edit`）でクリック後にサーバーの loader 解決まで画面が無変化になる問題を解消し、遷移直後にページ側の視覚的フィードバック（トップ進捗バー＋編集画面スケルトン）が出るようにする。詳細ルートで既に確立している Suspense ストリーミングに編集ルートを揃え、全ルート共通の遷移インジケータで底上げする。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ノート編集画面への遷移で、クリック後 200ms 以内にページ側の視覚変化（トップ進捗バー and/or 編集スケルトン）が現れる | Issue 受け入れ基準1 | 1, 2, 3, 4 |
| AC-2 | 編集ルートが詳細ルートと同じ Suspense ストリーミング方式になっており、遷移直後に編集用スケルトンが表示され、3クエリ完了後に実エディタへ差し替わる | Issue 改善案1 | 3, 4 |
| AC-3 | モバイル（intent プリロードが効かない環境）でも遷移中にページ側フィードバック（トップ進捗バー）が得られる | Issue 受け入れ基準2 | 1, 2 |
| AC-4 | 一覧→詳細→編集の各遷移で、遷移中に共通のトップ進捗バーが出て、かつ各画面のスケルトン（詳細=`NoteDetailSkeleton`／編集=`NoteEditorSkeleton`）が表示される（＝「読み込んでいる感」が一貫） | Issue 受け入れ基準3 | 1, 2, 3, 4 |
| AC-5 | フィードバックはページ側で完結し、リンク/ボタン自体の押下状態や「処理中」スピナーに依存しない | Issue 受け入れ基準4 / 概要 | 1, 3 |
| AC-6 | `prefers-reduced-motion: reduce` 時に進捗バー/スケルトンのアニメが 0ms 相当になり、静的プレースホルダとして機能する | spec/design/index.md L92-93, L217 | 1, 2, 4 |
| AC-7 | 非存在ノートを編集で開いた場合も、Suspense 化後に detail と同じインライン「見つかりません」表示へ落ちる（フルページの `RouteErrorFallback` にせず、500 やクラッシュにもならない） | 意図的変更: detail との整合性向上 | 3, 4 |

## スコープ

### 含まれないもの

- **ページ遷移トランジション（フェード/スライド、改善案4）** — トップ進捗バー＋スケルトンで受け入れ基準は満たせる。ルート全体のトランジションは実装コストとちらつきリスクが「装飾は入れない」（spec/design L93）方針に対して割に合わないため見送る。
- **編集ルートの `staleTime` 変更（改善案5）** — 別途 ADR-003 で「変更しない」と判断（編集データは編集ロック取得・最新本文が前提で、キャッシュ短絡はデータ整合性リスクが体感改善を上回る）。Suspense 化で待ち時間は視覚的にマスクされるため `staleTime: 0` を維持する。
- **編集ルート個別の `pendingComponent` 付与（改善案3）** — Suspense ストリーミング（案1）＋グローバル進捗バー（案2）で AC を満たすため、冗長になる `pendingComponent` は採用しない（ADR-001 参照）。`defaultPendingMs` も設定しない。
- 詳細・一覧・その他ルートのスケルトン新設や再設計（既存の `NoteDetailSkeleton` / list skeletons はそのまま）。

## 調査結果

- 関連ファイル:
  - `app/routes/_app/notes/$noteId/edit.tsx` — 編集ルート。`renderNoteEditor`（server fn, GET）が getCurrentUser→3クエリ `Promise.all` を **await 完了後** に `renderServerComponent(<NoteEditor .../>)` を返す。`<NoteEditor>` に Suspense 境界なし。`staleTime: 0`。
  - `app/routes/_app/notes/$noteId/index.tsx` — 詳細ルート。`renderNoteDetail` は getCurrentUser（＋redirect ガード）を await した後、データ取得を await せず即 `renderServerComponent(<NoteDetail .../>)` を返す。**確立パターン**。
  - `app/components/note/detail/NoteDetail.tsx` — server 同期コンポーネント。`<SectionErrorBoundary><Suspense fallback={<NoteDetailSkeleton/>}><NoteDetailContent/></Suspense></SectionErrorBoundary>` 構造。`NoteDetailContent` が async で `Promise.all` 取得＋not-found を JSX 返却で処理（`throw notFound()` は RSC 経由で機能しないため／`.issue/12/adr.md` ADR-004）。
  - `app/components/note/detail/NoteDetailSkeleton.tsx` — スケルトン参考。`SKELETON_BAR`/`SKELETON_PILL`（`app/components/common/styles.ts`, `motion-safe:animate-pulse`）を使い、`role="status" aria-live="polite" aria-busy="true"` で 1 個の読み上げを持つ。
  - `app/components/common/{Skeleton,FormSkeleton}.tsx` — スケルトン部品の既存アーカイブ。`SKELETON_BAR`/`SKELETON_PILL` を使った矩形バーの規約。
  - `app/components/common/ProgressBar.tsx` — **既存の別関心コンポーネント**。インライン用の presentational な進捗表示（determinate な `n/total` 進捗 ／ indeterminate パルス、`TRACK`+`FILL`、`decorative`（`aria-hidden`）オプション、`motion-safe:animate-pulse`／reduced-motion 静的）。取り込み job 等の進捗表示が関心で、ルート遷移状態とは無関係。本 Issue の `RouteProgressBar` は **遷移状態専用の別コンポーネントとして新設**し（`layout/`, fixed トップ）役割を棲み分ける。indeterminate 表現の作法（`motion-safe:` パルス、reduced-motion 静的、decorative）は既存に揃える。
  - `app/components/note/editor/NoteEditor.tsx` — `"use client"` のオーケストレータ。`mode="edit"` 時に `initialTitle/initialContentHtml/initialFrontMatter/initialTagNames/initialDirectoryId/initialEditLock/tree` を props で受ける。初期化は lazy initializer で1回のみ（loader 再実行で編集中状態をリセットしない設計）。
  - `app/components/note/list/NoteListViews.tsx` — `useRouterState({ select: s => s.isLoading })` の既存例。`aria-busy`/`data-pending` ＋ `transition-opacity motion-reduce:transition-none data-[pending]:opacity-60`。テスト（`__tests__/NoteListViews.test.tsx`）で `useRouterState` を vi.mock する既存パターンあり。
  - `app/routes/__root.tsx` — グローバル `RootDocument`（server component）。`<body>` に children＋Scripts。ここに client の進捗バーを差し込む。server-fn provider の side-effect import 登録もここ。
  - `app/routes/_app/route.tsx` — 認証レイアウト。`AppShellFrame`（server）でヘッダ/サイドバーを合成。ヘッダは `layout/styles.ts` で `sticky top-0 z-50`、モバイルドロワーは `z-[100]`、オーバーレイ `z-[90]`。
  - `app/router.tsx` — `createRouter({ routeTree, scrollRestoration: true, defaultPreload: "intent" })`。`defaultPendingComponent`/`defaultPendingMs` 未設定。
  - `app/components/note/loaders.ts` — `loadNoteDetail`/`loadDirectoryTreeFlat`/`loadAllTags`（`cache(serverData(...))`）。編集ローダーの取得元。
  - トークン: `--header-height: 64px`, `--color-accent`, `--duration-fast: 120ms`/`--duration-base: 180ms`。

- あるべきアーキテクチャ:
  - プレゼンテーション層中心の変更。TanStack Start / React 19 RSC / TanStack Router の作法に従う。
  - CLAUDE.md「フロントエンド」: データ取得は async server component、mutation は server function。loader ブリッジは presentation の server-fn エントリを使う。
  - CLAUDE.md「スタイリング」: Tailwind ユーティリティのみ。状態は `data-*` 属性 ＋ `data-[name]:` variant（`data-x={value || undefined}`）。反復ユーティリティ文字列は module-scope 定数に集約。新規 CSS/`@apply` は不可。デザイントークンは `tokens.css` 経由。
  - spec/design/index.md: ロード状態はスピナーよりスケルトン優先（L92）。アニメは装飾を入れず状態遷移補助のみ、`prefers-reduced-motion: reduce` で 0ms（L93, L217）。状態遷移通知は `aria-live="polite"`（L238）。

- 既存実装の状態:
  - **詳細ルートは「あるべき姿」に一致**（Suspense ストリーミング＋スケルトン＋not-found JSX）。
  - **編集ルートは乖離**: 同じ RSC 方式なのに loader 内で全 await してから返すため、遷移直後のページ側フィードバックが皆無。本 Issue で詳細ルートのパターンに揃える（既存の確立パターンへの収束であり、盲目的模倣ではない）。
  - **グローバル遷移インジケータは未存在**: `useRouterState(isLoading)` はリスト内のディム表示に局所使用されているのみ。ルート横断の進捗バーは新規。

- 依存関係:
  - `__root.tsx` に client 進捗バーを追加 → 全ルートに影響（見た目は極薄バーのみ、レイアウトは fixed で非侵襲）。
  - 編集ルートの server fn 構造変更 → 編集画面の初期表示経路のみ。`NoteEditor` client 本体の props 契約・初期化ロジックは不変（呼び出し元が server fn から server async component に移るだけ）。

## 設計

プレゼンテーション層のみの変更。バックエンド（ドメイン/ユースケース/アダプター）への影響はなし。

### ドメインモデルへの影響
なし（UI 遷移フィードバックのみ。データ取得ロジック・ポート・不変条件は不変）。

### ユースケース / アプリケーションロジック
なし（`loadNoteDetail`/`loadDirectoryTreeFlat`/`loadAllTags` を呼ぶ場所が変わるだけで、呼び方・入出力は不変）。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

2 本立て（ADR-001）:

1. **グローバルなトップ進捗バー（案2）** — 全ルート共通の即時フィードバック。`useRouterState({ select: s => s.isLoading })` を購読する `"use client"` コンポーネントを新設し、`__root.tsx` の `RootDocument`（`RootComponent` ではなく、全ルート・root の error/notFound 画面からも再利用される最上位ドキュメント）の `<body>` 直下に常設。`isLoading` の間だけ画面最上部に薄い accent バーを表示する。intent プリロードが効かないモバイルでも、loader ラウンドトリップ中に必ず出る。AC-1/AC-3 の主レバー。**進捗バーは decorative（`aria-hidden`、`role`/`aria-live` を付けない）**とし、SR へのロード通知は各ページ側スケルトンの `aria-live` に一本化する（全ルートの毎クリックで発話するとスケルトンの `aria-live` と二重読み上げになり騒がしいため。ADR-002）。

2. **編集ルートの Suspense ストリーミング化（案1）** — 詳細ルートと同じ構造へ。
   - `renderNoteEditor` server fn は getCurrentUser＋redirect ガードのみ await し、**データ取得を await せず**即 `renderServerComponent(<NoteEditorSection user noteId/>)` を返す（redirect/notFound throw を Suspense 外に保つのは detail と同じ理由）。
   - `NoteEditorSection`（server 同期）: `<SectionErrorBoundary><Suspense fallback={<NoteEditorSkeleton/>}><NoteEditorLoader .../></Suspense></SectionErrorBoundary>`。
   - `NoteEditorLoader`（server async）: 3クエリ `Promise.all` を実行し、現行 server fn 内の `initialTagNames`/`initialEditLock` 導出ロジックをそのまま持ち、`<NoteEditor mode="edit" .../>`（client）を返す。not-found は detail 同様 JSX を返却（throw しない）。
   - `NoteEditorSkeleton`（server presentational）: P12 mock 構造（topbar のモードタブ/保存アクション、タイトル大バー、ディレクトリピル、タグ行、本文ブロック、FrontMatter 行）を `SKELETON_BAR`/`SKELETON_PILL` で近似。`role="status" aria-live="polite" aria-busy="true"` を 1 個持つ（NoteDetailSkeleton と同型）。

配置・スタイル:
- 進捗バー: `fixed top-0 inset-x-0`、高さ 2px 程度、`bg-accent`、ヘッダ（z-50）/ドロワー（z-100）より上の `z-[110]` 相当。表示/非表示は `data-[loading]:` variant で切替（`data-loading={isLoading || undefined}`）。アニメは不確定進捗（indeterminate）を `motion-safe:` でのみ動かし、`motion-reduce:` では静的バー。反復ユーティリティは module-scope 定数に集約（`app/components/layout/styles.ts` か新規進捗バー隣接ファイル）。
- **ちらつき緩和は純 CSS の opacity トランジションで行う（確定方針）**: 表示は**即時**（`data-[loading]:opacity-100`）、消える側にのみ短いフェード（`opacity-0` へ `transition-opacity`、`--duration-fast` 120ms 相当以下）を掛ける。高速遷移（キャッシュヒット等）でも、消える瞬間だけ緩やかにフェードすることで点滅の目障りさを吸収する。**JS の遅延タイマー（表示を遅らせる `setTimeout` / `defaultPendingMs` 相当）は導入しない**。表示を一切遅延させないため AC-1「200ms 以内に視覚変化」は常に満たされる（`useRouterState` は navigation コミット開始時に同期的に `isLoading=true` になる）。`prefers-reduced-motion: reduce` 時はトランジションも 0ms（即時表示・即時消去）。`useRouterState` 購読 ＋ CSS variant のみで完結し、状態管理を持ち込まない（ADR-002 の「`useRouterState` だけで完結」と整合）。

## 実装ステップ

内側レイヤーの変更はないため、共通部品→グローバル→ルート個別の順。

### 1. グローバルトップ進捗バー コンポーネント新設
- **対象ファイル:** `app/components/layout/RouteProgressBar.tsx`（新規, `"use client"`）
- **変更内容:** `useRouterState({ select: (s) => s.isLoading })` を購読し、`fixed top-0 inset-x-0 h-0.5 z-[110]` の accent バーを描画。`data-loading={isLoading || undefined}` ＋ `data-[loading]:` variant で可視化。可視化は**純 CSS の opacity トランジション**で行い、表示は即時（`data-[loading]:opacity-100`）、消える側にのみ短いフェード（`opacity-0`、`--duration-fast` 120ms 相当以下）。`prefers-reduced-motion: reduce` 時はトランジションも 0ms（`motion-reduce:transition-none` 等）＝即時表示・即時消去で静的プレースホルダとして機能。**JS の遅延タイマー（表示遅延の `setTimeout` / `defaultPendingMs` 相当）は導入しない**ため AC-1「200ms 以内」は常に成立。**a11y は decorative（`aria-hidden`）とし `role`/`aria-live` を付けない**（ロード通知はページ側スケルトンの `aria-live` に一本化し、二重読み上げを避ける）。反復ユーティリティ文字列は module-scope 定数化。
- **理由:** 全ルート共通で、loader 解決を待つ間に「遷移中」を即時に示す（AC-1/AC-3/AC-4/AC-5）。intent プリロードが効かないモバイルでのフィードバック確保。reduced-motion 時の 0ms 静的表示（AC-6）も本コンポーネントで担う。

### 2. `__root.tsx` に進捗バーを常設
- **対象ファイル:** `app/routes/__root.tsx`
- **変更内容:** `RouteProgressBar` を import し、**`RootDocument`**（`RootComponent` ではない）の `<body>` 内 children の直前（または直後）に配置。`RootDocument` は正常時（`RootComponent`）だけでなく root の `errorComponent`/`notFoundComponent` からも `<RootDocument><ErrorPage/></RootDocument>` として再利用されるため、ここに置くことで root エラー/未検出画面からの再遷移でもバーが出る（decorative かつ非ロード時 `opacity-0` なので実害はない）。設置箇所は `RootDocument` に一意化する。server component 内から client component を子として描画する既存の RSC 作法に従う。
- **理由:** すべてのルート（root エラー/未検出画面を含む）に一括適用し、ルート個別実装なしで底上げ（AC-4）。

### 3. 編集ルートの server fn を Suspense ストリーミング化
- **対象ファイル:** `app/routes/_app/notes/$noteId/edit.tsx`
- **変更内容:** `renderNoteEditor` の handler を「getCurrentUser＋null時 redirect」まで await した後、`userDto` を導出し、データ取得を await せず `renderServerComponent(<NoteEditorSection user={userDto} noteId={data.noteId} />)` を即返す形に変更（detail の `renderNoteDetail` と同型）。現行の 3クエリ `Promise.all` と `initialTagNames`/`initialEditLock` 導出はステップ4の `NoteEditorLoader` へ移設。`staleTime: 0` は維持（ADR-003）。route の `head`/`errorComponent`/`component` は不変。
- **理由:** loader が即解決し、遷移直後に編集スケルトンをストリーミング表示できる（AC-2/AC-5）。not-found は Suspense 内で JSX 返却されるため `errorComponent` へのクラッシュを回避（AC-7）。

### 4. 編集セクション/ローダー/スケルトンのコンポーネント新設
- **対象ファイル:**
  - `app/components/note/editor/NoteEditorSection.tsx`（新規, server 同期）
  - `app/components/note/editor/NoteEditorLoader.tsx`（新規, server async）
  - `app/components/note/editor/NoteEditorSkeleton.tsx`（新規, server presentational）
- **変更内容:**
  - `NoteEditorSection`: `props = { user: UserDTO; noteId: string }`。`<SectionErrorBoundary section="ノート" resetKey={noteId}><Suspense fallback={<NoteEditorSkeleton/>}><NoteEditorLoader .../></Suspense></SectionErrorBoundary>`（NoteDetail と同構造）。
  - `NoteEditorLoader`: `loadNoteDetail`/`loadDirectoryTreeFlat`/`loadAllTags` を `Promise.all` で取得し、現行 server fn の `initialTagNames`（tags.byId で名前解決）と `initialEditLock`（`note.editLock` から acquired 状態を構築）を導出。`<NoteEditor mode="edit" ...初期props tree={tree.flat} />` を返す。not-found（`isNotFoundError`）は detail 同様「ノートが見つかりません」JSX を返却（throw しない）。
  - `NoteEditorSkeleton`: P12 mock を近似したスケルトン。`SKELETON_BAR`/`SKELETON_PILL` を使用し、`role="status" aria-live="polite" aria-busy="true" aria-label="エディタを読み込み中"`。`motion-safe:animate-pulse`（`SKELETON_BAR` が既に内包）。
- **理由:** 編集画面のデータ取得を Suspense 境界の内側にストリーミングし、詳細ルートと一貫した体験にする（AC-2/AC-4/AC-6/AC-7）。`NoteEditor` client 本体の props 契約・lazy 初期化は不変。

## 設計判断

- **ADR-001:** 編集フィードバックの実現方法として「Suspense ストリーミング化（案1）＋グローバルトップ進捗バー（案2）」の 2 本立てを採用し、`pendingComponent`（案3）とページトランジション（案4）は不採用。
- **ADR-002:** グローバル進捗バーの配置と可視化・アクセシビリティ方式。
- **ADR-003:** 編集ルートの `staleTime: 0` を維持（案5 は「変更しない」判断）。

詳細は `.issue/819/adr.md` を参照。

## リスクと注意点

- **編集の初期状態リセット回帰**: `NoteEditor` は lazy initializer で初回のみ seed する設計。呼び出し経路が server fn→server async component に変わっても、client 側の初期化ロジック・props 契約は不変であることを担保する（変えない）。
- **not-found の扱い（意図的な挙動変更）**: 現状の編集ルートは非存在ノートで `renderNoteEditor`（Suspense 外の await）が `NotFoundError` を throw し、**フルページの `RouteErrorFallback`（`errorComponent`）にクラッシュ相当の表示**になる。Suspense 化後は detail と同型で、`NoteEditorLoader`（RSC）内で `isNotFoundError` を catch して**`_app` シェル（ヘッダ/サイドバー）を保ったインライン「ノートが見つかりません」JSX**に落ちる。これは「既存挙動の維持」ではなく **detail との整合を狙った意図的変更**であり、テスト・手動確認では「フルページのエラーパネルではなくインライン表示に変わったこと」を期待値とする（回帰ではない）。実装上の注意: Suspense 内で `throw notFound()`/`throw redirect()` は RSC 経由で機能しない（`.issue/12/adr.md` ADR-004）ため、redirect ガードは server fn 側（Suspense 外）に残し、not-found は `NoteEditorLoader` で JSX 返却にすること。多層防御として、万一 catch を付け忘れて生 `NotFoundError` が RSC 内で throw されても `SectionErrorBoundary` が flight ストリーム経由で捕捉しセクション内エラー表示になる（500 にはならない）。
- **編集ロック取得タイミング**: `useEditLock` は client マウント後に acquire する。Suspense 化で実 `NoteEditor` のマウントが（スケルトン表示後に）わずかに遅れるが、ロック取得は元々クライアント副作用なので挙動不変。`initialEditLock` の seed も既存ロジックを移設するだけ。
- **進捗バーの z-index 競合**: ヘッダ `z-50`・ドロワー `z-[100]`・オーバーレイ `z-[90]` より上に出す必要がある。`z-[110]` 相当で最上位に。fixed 配置でレイアウトを侵さないこと。
- **進捗バーのちらつき（緩和方式は確定）**: 高速遷移（キャッシュヒット等）で一瞬だけ点滅しうる。緩和は**純 CSS の opacity トランジション**で行う — 表示は即時、消える側にのみ短いフェード（`--duration-fast` 120ms 相当以下）を掛けて点滅の目障りさを吸収する。**JS の遅延タイマー（表示を遅らせる `setTimeout` / `defaultPendingMs` 相当）は導入しない**。表示を遅延させないため AC-1「200ms 以内」は常に成立する。`prefers-reduced-motion: reduce` 時はトランジションも 0ms（即時）。`useRouterState` 購読 ＋ CSS variant のみで完結させ、状態管理を持ち込まない。
- **RSC ストリーミングと head**: detail で同型が成立済みのため編集も成立する見込みだが、`renderServerComponent` を await せず返す形が編集ルートの `head`（`match.context.config` 依存）と干渉しないことを確認する。
- **スケルトン非搭載ルートの SR ロード通知ゼロ（許容トレードオフ）**: 進捗バーを decorative（`aria-hidden`）化した結果、スケルトンを持たないルート（settings/admin/public フォーム等）では遷移中のスクリーンリーダー向けロード通知が一切なくなる。これらの遷移は概ね高速で通知の実益も小さいため今回は許容するが、将来スケルトン非搭載の重いルートが増えたら再検討ポイントとなる。

## テスト方針

- **`RouteProgressBar` 単体テスト（新規）**: `NoteListViews.test.tsx` と同様に `useRouterState` を vi.mock し、`isLoading=true` で `data-loading` 属性/バー可視化、`false` で消えることを検証。**進捗バーは decorative なので `aria-hidden` が付き `role`/`aria-live` を持たないことも検証**（読み上げはスケルトン側に集約）。プリロード状態に依存せず `isLoading=true` の間は必ずバーが出ることを担保する（AC-1/AC-3/AC-5）。
- **`NoteEditorSkeleton` の a11y/構造テスト（新規）**: `NoteDetailSkeleton`/`skeletonAria.test` に倣い、`role="status"`＋`aria-busy`＋単一読み上げ、装飾要素の `aria-hidden` を検証（AC-6）。ロード通知はこのスケルトン側の `aria-live` が担う（進捗バーではなく）。
- **編集ルート streaming の回帰テスト**: 可能なら `renderNoteEditor` が not-found 時に **`errorComponent`（`RouteErrorFallback`）ではなく `NoteEditorLoader` のインライン「見つかりません」JSX へ落ちること**を検証（AC-7 の意図的変更＝旧フルページエラーからインライン表示への統一を期待値とする）。正常時にスケルトン→実エディタへストリーミングされる構造（Suspense fallback が `NoteEditorSkeleton`）も検証（AC-2）。既存のルート/コンポーネントテスト形態に合わせる。
- **typecheck/lint/format**: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **手動/ブラウザ確認**: 詳細→編集の遷移で 200ms 以内に進捗バー、続いて編集スケルトン→実エディタが出ること。**モバイルの検証は「実機タッチ or hover 不可（プリロード無効相当）」の条件で行う** — ウィンドウ幅を狭めるだけでは hover による intent プリロードは無効化されないため、タッチデバイス/hover 無効エミュレーション、または `defaultPreload` を切った状態で進捗バーが出ることを確認する（幅のみの検証はプリロードが効いてキャッシュヒットし isLoading がほぼ立たず判定を誤る）。単体テストで「preload 状態に関係なく isLoading=true 中はバーが出る」ことを担保し、手動検証は補助と位置づける。一覧→詳細→編集の一貫性。`prefers-reduced-motion` 有効時に静的表示になること。`docs/test.md` の方針に従い、必要なら cookie 付き curl で SSR 応答を確認。

## レビュー履歴

### 1周目（2026-07-10）— coverage / arch-risk 並列レビューを反映

- **[coverage P-001]** AC-6（reduced-motion）の対応ステップを「2, 4」→「1, 2, 4」に修正（進捗バーの reduced-motion 実装を含むステップ1 を追加）。
- **[coverage P-002 / arch-risk S-002]** 進捗バーのちらつき緩和方式を確定: 純 CSS の opacity トランジション（表示は即時、消える側のみ短いフェード）。JS の遅延タイマー（`setTimeout` / `defaultPendingMs` 相当）は導入しないと明記し、AC-1「200ms 以内」を常に満たすことを保証。reduced-motion 時はトランジションも 0ms。設計・ステップ1・リスク欄・ADR-002 の TBD を解消。
- **[coverage S-001 / arch-risk P-001]** AC-7 の事実誤認を訂正: 現状は非存在ノート編集でフルページ `RouteErrorFallback` に落ちる。Suspense 化後は detail と同じインライン not-found 表示になる**意図的変更**である旨に、AC 表の文言・由来・リスク欄・テスト方針の期待値を修正。
- **[arch-risk S-001]** 進捗バーを **decorative（`aria-hidden`、`role`/`aria-live` なし）**に変更し、SR へのロード通知はページ側スケルトンの `aria-live` に一本化（二重読み上げ回避）。設計・ステップ1・ADR-002 の a11y 記述を更新。
- **[arch-risk S-003]** 既存 `common/ProgressBar.tsx`（別関心の presentational 進捗表示）を調査結果に明記し、本 Issue の `RouteProgressBar` は遷移状態専用の別コンポーネントとして新設する棲み分けを追記。
- **[arch-risk S-004]** ADR-001 の「案2 は A/B 全期間で isLoading=true」を、案1採用後の正確な分担（A=進捗バーが主、B=スケルトンが主。`isLoading` はシェル到着で false へ落ちる）に補正。
- **[coverage S-002]** AC-3（モバイル）の検証方法を、幅変更では intent プリロードが無効化されない点を踏まえ「実機タッチ or hover 不可（プリロード無効相当）」条件での確認＋単体テスト担保に補正。

### 2周目（2026-07-10）— coverage / arch-risk 並列レビューを反映

- **[coverage P-001]** AC-7 の対応ステップを「3」→「3, 4」に修正（not-found のインライン JSX 返却は step4 の `NoteEditorLoader` が担うため、Suspense 外 await 除去=step3 と両方に依存）。
- **[coverage S-001]** AC-4「読み込んでいる感の一貫性」を検証可能な下位条件（各遷移で共通トップ進捗バー＋各画面のスケルトン=詳細 `NoteDetailSkeleton`／編集 `NoteEditorSkeleton` が出る）に具体化。
- **[arch-risk S-001]** `RouteProgressBar` の設置箇所を `RootDocument`（`RootComponent` ではなく、error/notFound 画面からも再利用される最上位ドキュメント）に一意化する旨を設計・ステップ2に明記。
- **[arch-risk S-002]** 進捗バー decorative 化により「スケルトン非搭載ルートでは遷移時 SR ロード通知がゼロ」になる点を許容トレードオフとしてリスク欄に一行追記。
- 両視点ともブロッカーなしで収束。
