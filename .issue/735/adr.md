# ADR — Issue #735: 公開系エラーページのHTTPステータスが200のまま（RSC内notFoundで404/410を返せない）

## ADR-001: HTTP ステータス付与の橋渡し方式 — 「データ存在チェックを RSC レンダリングの前段に分離」する

### Status
Superseded by ADR-004（前段分離という骨子は採用したが、ステータス確定方法は PoC 結果により変更。下記 Decision の「(a) `throw notFound()` か (b) `NotFoundError` を投げる」のうち、`setResponseStatus` を前提とした出し分けは不可と判明。詳細は ADR-004）

### Context

公開系3ルート（`/notes/public/$noteId`・`/u/$username/$noteSlug`・`/u/$username`）は、loader が `renderServerComponent(<PublicNoteDetail/>)` / `renderServerComponent(<UserPublicTop/>)` を返す server function を呼ぶ。#599（ADR-001 方式(d)）で「RSC コンポーネント内で `NotFoundError` を捕捉し、`throw notFound()` せず `ErrorPage`（gone/notFound）を JSX として return する」ことで**画面は**正しく 404/410 を出すようになった。しかし `renderServerComponent` の戻り値（renderable）に取り込まれた結果としての ErrorPage は通常の正常レンダリングであり、HTTP レスポンスステータスは 200 のまま。SEO/クローラ観点で「正常なページ」と解釈される問題が残る（本 Issue）。

#### 現バージョンの再調査結果（重要 — ADR-004 / #599 ADR-001 の前提が一部変化している）

`@tanstack/react-start` `1.168.25` / `@tanstack/react-start-rsc` `0.1.24` / `@tanstack/router-core` `1.171.13` / `@tanstack/react-router` `1.170.15` を実ソースで再確認した。

- `renderServerComponent`（`react-start-rsc/dist/esm/renderServerComponent.js`）は、**router リクエスト + SSR の経路**（公開系ルートの初回 GET ローダーが該当）では `const decoded = await ssrHandler.decode(stream)` を**ハンドラの await 経路の内側で実行する**ようになっている。`#599` 当時の「`renderServerComponent` は Flight ストリームを同期 return するだけで decode は handler の外側」という前提は、SSR 経路では当てはまらなくなっている可能性がある。ただし `decode`（`serialization.server.js` の `__RSC_SSR__.decode` → `createFromReadableStream`）が**コンポーネント内 throw を await 時に re-throw するか**は実ソースだけでは確定できず、実機検証が必須（後述リスク）。クライアントナビゲーション経路（loader がブラウザで走る）では従来どおり handler の外側のままで、ここはステータス付与の対象外（初回 SSR/クローラ向けが本 Issue の主眼）。
  - **ADR-004（`.issue/12/adr.md`）の前提との関係（重要）:** ADR-004 は「`renderServerComponent(<Page/>)` は server fn handler から**同期 return される**。async render 中のエラーは handler の try/catch にも errorResponseMiddleware にも届かない」と断言しているが、上記のとおり現バージョン（`react-start-rsc` 0.1.24）では SSR/router 経路で `renderServerComponent` が `async` 化し handler 内で `await decode` するため、この「同期 return」前提は**変化している**。ADR-004 の旧記述をそのまま信じると将来の実装者を誤導するため、本 ADR でこれを上書きしておく。ただし decode の notFound re-throw 挙動は依然不確定のため、それに依存しない方式 (C) は引き続き有効である。
- 一方、**server function ハンドラ自身が notFound を throw した場合**は確実に 404 になる経路が存在する。`start-server-core/dist/esm/server-functions-handler.js` の `catch` は `isNotFound(error)` のとき `isNotFoundResponse(error)` を返し、これは `status: 404` の `Response` を生成する（203-206 行）。
- `errorResponseMiddleware`（`app/core/presentation/errorResponseMiddleware.ts`）は `next()` の throw を捕捉し、`isRedirect || isNotFound` は素通し、それ以外は `serializeError` → `setResponseStatus(httpStatusFor(...))` でステータスを設定して `AppServerError` を投げ直す。`NotFoundError`（`@/core/application`）は `serializeError` で `kind: "notFound"` になり、`httpStatusFor` で **404** にマップされる（`errorResponse.ts`）。
- **既にこのパターンは本リポジトリで稼働中**: 各ルートの `head` が呼ぶ meta loader（`loadNoteMeta` / `loadProfileMeta`）は `renderServerComponent` を経由せず、usecase（`getPublicNote` 経由の `loadPublicNoteMeta` / `getPublicProfile`）を**直接呼び**、`errorResponseMiddleware` を通している。つまり「データ取得（存在チェック）」と「RSC レンダリング」を分離する設計は、このコードベースの確立済みパターンである。

#### 検討した方式

- **(A) loader 段で renderable（Flight ストリーム）をデコードして notFound を判定し `setResponseStatus`/`notFound()` を投げ直す**（Issue 記載案1）。renderable は opaque proxy で、loader 段で中身の notFound を判定するには二重デコードが必要。SSR 経路では `renderServerComponent` が内部で既に decode 済みだが、その結果（notFound か否か）を loader 側へ伝える公開 API は無い。確実性・保守性が低く、二重レンダリングコストも発生しうる。**不採用。**
- **(B) `renderServerComponent` の戻り値の decode 完了に handler 内で await し、notFound を検出して投げ直す**。SSR 経路では `await ssrHandler.decode(stream)` が既に handler 内で走るが、(1) コンポーネントが `throw notFound()` をやめて ErrorPage を return している現状（#599 方式(d)）では decode は成功扱いになり notFound シグナルが消える、(2) かといってコンポーネント側を `throw notFound()` に戻すと #599 が解消した「decode 経由で素の notFound が `kind: unknown` に倒れ system/500 画面になる」退行が（クライアントナビ経路で）復活するリスクがある。decode の re-throw 挙動がバージョン依存で脆い。**不採用（フレームワーク内部依存が強すぎる）。**
- **(C) データ存在チェックを RSC レンダリングの「前段」に分離する**（Issue 記載案＝代替案）。render server function のハンドラ内で、`renderServerComponent(...)` を呼ぶ**前に**存在判定用の軽量な usecase 呼び出し（`getPublicNote` / `getPublicProfile`）を実行する。NotFoundError が出たら `renderServerComponent` に進まず、その時点で（a）`throw notFound()` するか（b）`NotFoundError` をそのまま投げて `errorResponseMiddleware` に拾わせる。どちらも handler の await 経路の内側なので、確実に HTTP ステータスへ反映できる。**採用。**
- **(D) TanStack Start の RSC notFound 伝播サポートのアップデートを待つ**（Issue 記載案2）。現バージョンには「RSC 内 throw notFound → ルート notFoundComponent + 404 ステータス」の正攻法導線は無い（再調査で確認）。将来サポートされれば (C) の前段チェックは不要になる。**今回は待たず (C) で実装するが、ADR にフォローアップとして記録。**

### Decision

**(C) データ存在チェックを RSC レンダリングの前段に分離する。** 具体的には各 render server function のハンドラを次の二段構成にする（列挙耐性・既存のドメイン/usecase 挙動は不変）。

1. **存在チェック段**: `renderServerComponent` を呼ぶ前に、対象の存在判定用 usecase を呼ぶ。
   - `/notes/public/$noteId`・`/u/$username/$noteSlug` → `getPublicNote`（byId / bySlug）
   - `/u/$username` → `getPublicProfile`（username。一覧・タグの 0 件は NotFound を投げないため、profile 1 本で存在判定が完結することは #599 で裏取り済み）
2. NotFoundError が出たら `renderServerComponent` に進まず、**`errorResponseMiddleware` 経由でステータスを確定**させる。HTTP ステータスを正しく出すための throw 方法は ADR-002 で決定する。
3. 存在チェックを通過したら従来どおり `renderServerComponent(<PublicNoteDetail/.../>)` を return する。コンポーネント側の #599 方式(d)（内部で NotFoundError を捕捉して ErrorPage を return）は**保険として残す**（前段チェックと本体レンダリングの間に状態が変わる TOCTOU、または前段で検出しきれない非公開エッジへの二重防御）。

存在チェックは `getPublicNote` / `getPublicProfile` の結果を**捨てる**（本体レンダリングは RSC 内で改めて取得する）。`PublicNoteDetail` 等のコンポーネント本体は `cache(serverData(...))`（`React.cache`）でメモ化されているが、`React.cache` のスコープは React のレンダリングコンテキスト（`renderToReadableStream` の内側）であり、server function ハンドラ本体（前段の存在チェック呼び出し）はその**外側＝別レンダリングスコープ**になる。したがってメモ化は構造的に効かず、**正常系では必ず二重取得（前段＋本体で計2回）になる**（実コード `app/components/public/PublicNoteDetail.tsx:36` の `cache(serverData(...))` で確認済み）。「メモ化が効けば回避できる」という楽観は採らない。それでも read-only な単一行取得（D1 O(1) 寄り）であり許容範囲であり、(A)/(B) の不確実性より確立済みで確実な (C) を優先する。

理由:
- フレームワーク内部（decode の re-throw 挙動）に依存せず、`createServerFn` ハンドラ → `errorResponseMiddleware` → `setResponseStatus` という**本リポジトリで既に稼働している確実な経路**だけを使う。
- meta loader が既に同型（usecase を直接呼び `errorResponseMiddleware` を通す）で動いているため、新しい抽象を導入しない。
- 列挙耐性を一切壊さない。`getPublicNote` / `getPublicProfile` は従来どおり存在/非公開を区別せず一律 `NotFoundError`。HTTP ステータスも「ノートは一律 410、ユーザーは一律 404」で、存在有無を漏らさない（ADR-003 参照）。
- 画面の正しさ（404/410 の `ErrorPage`）は #599 方式(d)で既に担保済み。本 Issue は「画面はそのまま、ステータスだけ正す」ので、コンポーネント側ロジックは原則無改変。

### Consequences
- 良い点:
  - 初回 SSR/クローラ向けに HTTP ステータスが正しくなる（ノート→410、ユーザー→404）。SEO 観点の問題が解消。
  - フレームワーク内部の decode 挙動に依存しない確実な経路のみ使用。バージョンアップ耐性が比較的高い。
  - 列挙耐性・ドメイン/usecase は無改変。画面表示（#599 方式(d)）も無改変で温存。
- トレードオフ:
  - 存在チェック段で usecase を1回追加実行する。NotFound 系（実在しない/非公開）では本体に進まないため1回。**正常系では `React.cache` のスコープ差（server fn ハンドラ本体は RSC レンダリングの外側）により、前段＋本体で必ず2回 `getPublicNote`/`getPublicProfile` が走る**（メモ化は構造上効かない）。ただし read-only 単一行取得（D1 O(1) 寄り）であり許容範囲（Decision 参照）。
  - クライアントサイドナビゲーション（SPA 遷移）では HTTP ドキュメントステータスという概念自体が無く、本方式は初回 SSR/直リンク/クローラ経路でのみ意味を持つ（=本 Issue の対象そのもの）。SPA 遷移時の画面は #599 方式(d)が引き続き担保。
  - 認証系エラーページ（ADR-004 同根本）は本 Issue のスコープ外。同方式を将来横展開できるが今回は触らない（plan「スコープ」参照）。

---

## ADR-002: NotFound を「ノート→410 / ユーザー→404」で出し分けるための throw 方法

### Status
Superseded by ADR-004（本 ADR の前提「ハンドラ内 `setResponseStatus(410/404)` + `ErrorPage` を return すれば SSR ドキュメントのステータスを出し分けられる」は、実装 PoC で覆った。`setResponseStatus` は SSR ドキュメントのステータスに一切マージされず、ドキュメントステータスは TanStack Router が完全制御している。410 出し分けは現フレームワークでは原理的に不可。404 のみ `throw notFound()` で達成可能。詳細は ADR-004）

### Context

ADR-001 (C) の存在チェック段で NotFoundError を検出したあと、HTTP ステータスへどう反映するかに二つの経路がある。さらに本 Issue の「あるべき動作」は**ノートは 410（gone）、ユーザーは 404（notFound）**と、同じ NotFoundError から異なるステータスを出し分ける必要がある。

現状の素の経路を確認すると:
- `NotFoundError`（application）→ `serializeError` → `kind: "notFound"` → `httpStatusFor` で **404**。`HTTP_STATUS_BY_KIND` に **410（gone）のエントリは無い**（`errorResponse.ts`）。`ErrorPage` の `gone`(410) は presentation の表示種別であって、エラーシリアライズの `kind` には無い。
- `notFound()`（router）を server fn ハンドラで throw すると、`server-functions-handler.js` が `status: 404` の Response を返す。`notFound()` は `headers` オプションを受け取れる（`router-core/not-found.d.ts`）が、ステータスは 404 固定。

検討した方式:
- **(i) 全て `errorResponseMiddleware` 経由（NotFoundError をそのまま投げる）。** ノートもユーザーも 404 になり、ノートの 410 要件を満たせない。`HTTP_STATUS_BY_KIND` に 410 を増やす手もあるが、「`kind: notFound` を 410 にする」のは notFound 全般に波及し副作用が大きい。`gone` 用の新しい SerializedError kind を起こすのはドメイン/アプリ層の変更で、本 Issue（presentation の HTTP ステータス問題）に対して過剰。**不採用。**
- **(ii) render server function のハンドラ内で `setResponseStatus(...)` を直接呼ぶ。** `@tanstack/react-start/server` の `setResponseStatus` をハンドラで呼べば任意ステータス（ノート=410 / ユーザー=404）を設定できる。`errorResponseMiddleware` の中でなくハンドラ本体で呼ぶ。ただし「ステータスを設定した上で、画面は ErrorPage を出す」ためには、ステータス設定後に `renderServerComponent(<ErrorPage .../>)` を return する形にする必要がある（throw すると errorComponent 経路に落ちて画面が system になる）。**採用候補。**
- **(iii) `notFound({ headers })` を throw（ユーザー）/ ノートは別途 410 設定。** notFound throw は 404 固定でノートの 410 と相性が悪い。**不採用。**

### Decision

**(ii) を採用する。** 各 render server function のハンドラで、存在チェックが NotFoundError になったら:

1. `setResponseStatus(410)`（ノート系: `$noteId` / `$noteSlug`）または `setResponseStatus(404)`（ユーザー系: `$username`）を呼ぶ。
2. その上で `renderServerComponent(<ErrorPage kind="gone" />)` / `renderServerComponent(<ErrorPage kind="notFound" />)` を return する（throw しない）。これにより、loader は通常どおり renderable を受け取り、ルートの `component` が `ErrorPage` を描画する。ステータスは 1 で設定済み。

**ステータス設定と renderable の return を司る制御は共通ヘルパー `publicStatusBridge`（純 `.ts`）に切り出す。** ただしヘルパー自身は JSX を生成せず、`<ErrorPage/>` / `<PublicNoteDetail/>` 等の renderable は**呼び出し側（ルートの `.tsx`）が生成して渡すコールバック**（`renderNotFound` / `renderOk`）として受け取る。これにより、(1) presentation 層に初の `.tsx` を持ち込まずに済む（現状 `app/core/presentation/` は全て `.ts`）、(2) ヘルパーが特定の公開系コンポーネント（`@/components/public/ErrorPage`）を名指しで知らずに済み presentation → components の逆依存を回避できる、(3) 成功時・NotFound 時の戻り値型が同一 `T`（= renderable）に統一され型安全になる（旧設計で懸念だった戻り値型不一致が解消する）。詳細な擬似コードは plan「設計」欄を参照。

`setResponseStatus` は `@tanstack/react-start/server` からの import で、`errorResponseMiddleware.ts` 既存の import パターン（server-only、クライアントバンドルから除去される）と同じ。render server function の `.handler` は server-only なので import 位置として安全。

NotFoundError 以外の例外はこれまでどおり `errorResponseMiddleware` が捕捉して `setResponseStatus(500)` + system 画面（コンポーネント側方式(d)の re-throw、または前段で投げた素のエラー）に倒す。

**前提（本方式の成立条件）:** `errorResponseMiddleware` は `setResponseStatus` を catch 節でのみ呼び、成功 return 時はステータスを上書きしない（`errorResponseMiddleware.ts` で確認）。よってハンドラ本体での `setResponseStatus(410/404)` + 正常 return は middleware に打ち消されず生き残る。将来 middleware を改修する際もこの不変条件（成功時はステータスに触れない）を維持すること。

理由:
- ノート 410 / ユーザー 404 の出し分けがハンドラ1箇所で完結し、`errorResponse.ts` の `HTTP_STATUS_BY_KIND`（notFound=404）やドメイン/アプリのエラー契約に手を入れない。
- 「ステータスを設定して ErrorPage を return」する形は、画面（#599 方式(d)が出すのと同じ `ErrorPage`）と一致し、loader → component の正常経路に乗る（errorComponent/notFoundComponent 経由でないので `kind: unknown` 落ちが起きない）。
- 410 を `errorResponse.ts` の kind マップに足す案を避けることで、notFound 全般への副作用ゼロ。

### Consequences
- 良い点:
  - ノート 410 / ユーザー 404 を確実に出し分けられる。
  - エラーシリアライズ契約・ドメイン/アプリ層に無改変。presentation 内（ルートの server fn ハンドラ）に閉じる。
  - 画面は `ErrorPage`（#599 と同一）。二重レイアウトにならない（`ErrorPage` が `PublicLayout` を内包）。
- トレードオフ:
  - render server function ハンドラ内で `setResponseStatus` を直接呼ぶ箇所が3ルートに分散する（meta loader と違い `errorResponseMiddleware` 任せにできない）。`setResponseStatus` 呼び出しと分岐制御を純 `.ts` の共通ヘルパー `publicStatusBridge` に切り出して重複を抑える（JSX 生成はルート `.tsx` 側のコールバックに残す。上記 Decision 参照）。
  - `setResponseStatus` の SSR 経路での有効性（特に Cloudflare Workers ランタイム）は実機検証が必要（リスク欄）。`docs/runtime_cloudflare.md` の SSR レスポンス組み立てと整合するかを確認する。

---

## ADR-003: 列挙耐性 — ステータスでも存在有無を漏らさない

### Status
Accepted（ただし「ノート系は一律 410」は ADR-004 により「ノート系も一律 404」へ変更。列挙耐性そのもの＝存在有無をステータスで区別しないという不変条件は維持。下記 Decision のノート 410 は ADR-004 で 404 に読み替えること）

### Context

#599 で確立した不変条件: `getPublicNote` / `getPublicProfile` は「存在しない」「非公開」「owner が deleted/suspended」を区別せず一律 `NotFoundError` に潰し、画面で存在有無を漏らさない（enumeration 耐性）。HTTP ステータスを付与する本 Issue で、この不変条件をステータス経由で破らないことを明示しておく。

### Decision

- ノート系（`$noteId` / `$noteSlug`）は、存在しない・非公開・owner 不可視のいずれでも**一律 410**。
- ユーザー系（`$username`）は、存在しない・deleted・suspended のいずれでも**一律 404**。
- 「実在するが非公開」と「そもそも存在しない」でステータスを変えない。`getPublicNote` / `getPublicProfile` は無改変（一律 NotFoundError のまま）なので、これは自然に保たれる。
- 例外: TOCTOU 競合（前段チェック通過後に本体取得直前で非公開化）した極稀ケースのみ、#599 方式(d) の二重防御により画面は 410/404 だが HTTP ステータスは 200 になることを許容する（設計上の帰結。plan AC-5 にも固定）。

### Consequences
- 良い点: ステータスコードからの enumeration を防ぐ。#599 の不変条件を維持。
- トレードオフ: 「非公開ノート」も 410（Gone = かつて存在したが今は無い）になり、語義的には厳密でないケースがあるが、enumeration 耐性を優先する。これは #599 で `ErrorPage kind="gone"` を非公開にも使う既存判断と一貫。
- **ADR-004 で更新:** ステータスは「ノート 410 / ユーザー 404」から「ノート・ユーザーとも一律 404」へ変更。410 が現フレームワークで不可能なため。列挙耐性の不変条件（存在有無をステータスで区別しない）は 404 一律でそのまま満たされる。

---

## ADR-004: PoC 結果 — SSR ドキュメントステータスは router 専管。`setResponseStatus` は不達。404（notFound）のみ達成可能、410 は実現不可

### Status
Accepted

### Context

ADR-001 (C) + ADR-002 (ii) は「render server function ハンドラ内で `setResponseStatus(410/404)` を呼び、`ErrorPage` を return すれば、初回 SSR ドキュメントの HTTP ステータスを 410/404 に出し分けられる」という前提に立っていた。実装の最初に行った PoC（dev = `pnpm dev` / workerd、本番相当 = `pnpm build && pnpm start` / wrangler dev の両方で curl 検証）で、この前提が**ソース読解と実測の両方から覆った。**

#### PoC で確定した決定的事実

1. **SSR ドキュメントの HTTP ステータスは TanStack Router が完全制御している。** `node_modules/@tanstack/router-core/.../router.js` の `load()` 内で、ドキュメントステータスは `nextStatusCode = redirect ? redirect.status : notFound ? 404 : (match が error) ? 500 : 200` と決まる。`renderRouterToStream.js` が `new Response(stream, { status: router.stores.statusCode.get() })` でドキュメントを返す。つまりドキュメントステータスの取り得る値は「リダイレクト status / 404（notFound）/ 500（error）/ 200（success）」に限られ、ここに任意値を割り込ませる経路が router に無い。

2. **`setResponseStatus`（`@tanstack/react-start/server`）は h3 event の `res.status` を立てるだけで、SSR ドキュメントのステータスには一切マージされない。** 実測: loader 内で `setResponseStatus(410)` を呼んでも、成功 return では HTTP 200 のまま。server fn ハンドラ内で `setResponseStatus(410)` してから throw しても、router が上記ロジックで上書きする。ADR-002 (ii) の成立条件「ハンドラ本体での `setResponseStatus` + 正常 return は middleware に打ち消されず生き残る」は、middleware については正しかったが、その上位の router がドキュメントステータスを別管理しているため、ドキュメントには届かない。

3. **`throw notFound()`（`@tanstack/react-router`）は確実にドキュメントを 404 にし、ルートの `notFoundComponent`（`ErrorPage` gone/notFound）を描画する。** ただし `notFound()` のステータスは **404 固定**で、カスタム 410 を出す手段は現バージョンの router に存在しない（上記 1 のロジックで notFound は常に 404）。

4. **結論: ノートの 410 要件は現フレームワークでは原理的に実現不可。達成可能な非200ステータスは 404 のみ。**

#### ユーザー決定（確認済み）

「404 で実装」を選択。3ルート全て（`/notes/public/$noteId`・`/u/$username/$noteSlug`・`/u/$username`）で「前段で存在チェック → NotFoundError なら `throw notFound()`」により HTTP 404 を返す。ノートもユーザーも 404（gone/notFound 画面は #599 のまま維持）。410 は見送り。

### Decision

ADR-001 の骨子「データ存在チェックを RSC レンダリングの前段に分離する」は維持する。ただしステータス確定方法を `setResponseStatus` ベースから **`throw notFound()` ベース**に変更し、ステータスは **3ルートとも 404 一律**とする。

**実装した方式:**

- 新規ヘルパー `app/core/presentation/publicStatusBridge.ts` に `ensurePublicResourceExists(check: () => Promise<unknown>): Promise<void>` を実装。`check()` を実行し、`isNotFoundError` なら `throw notFound()`、それ以外の例外は re-throw（→ `errorResponseMiddleware` が 500/system に倒す）。`setResponseStatus` は使わない。
- 3ルートの render server function ハンドラを修正: `renderServerComponent` の前に `ensurePublicResourceExists(() => getPublicNote/getPublicProfile(...))` を呼ぶ。
  - `$noteId`: `getPublicNote({ kind: "byId", noteId })`
  - `$noteSlug`: `getPublicNote({ kind: "bySlug", username, slug })`
  - `$username/index`: `getPublicProfile({ username })`
- ユニットテスト `app/core/presentation/__tests__/publicStatusBridge.test.ts`: (1) 存在時 resolve、(2) NotFoundError → `isNotFound(thrown) === true`、(3) 非 NotFound 例外は re-throw。3件パス済み。

理由:
- ドキュメントステータスは router 専管（事実1）であり、`setResponseStatus`（事実2）では到達不能。`throw notFound()`（事実3）だけがドキュメントを確実に非200（=404）にできる唯一の確実な経路。
- 前段チェック → `throw notFound()` はハンドラの await 経路の内側で起き、router の `load()` が notFound を検出してドキュメントステータスを 404 に設定する。RSC 内 throw notFound が decode で握り潰される #599 の問題（`.issue/12/adr.md` ADR-004）を避けられる。
- 列挙耐性は維持。`getPublicNote`/`getPublicProfile` は無改変で一律 `NotFoundError`、HTTP ステータスも一律 404 のため存在有無を漏らさない。
- 画面（gone/notFound の `ErrorPage`）は #599 のまま温存。

### Consequences
- 良い点:
  - 存在しないノート（byId/bySlug）・存在しないユーザーで HTTP **404** を確実に返せる。クローラ/SEO が「正常なページ」と誤解しない（非200 の達成という Issue の主眼を満たす）。
  - `setResponseStatus` という不達な経路を排し、`throw notFound()` という router 公式の確実な経路のみ使用。バージョンアップ耐性が高い。
  - 列挙耐性を維持（3ルートとも 404 一律）。ドメイン/usecase/エラーシリアライズ契約は無改変。
  - #599 の gone/notFound 画面を温存。
- トレードオフ / フォローアップ:
  - **ノートの 410 は実現不可で 404 に見送り。** Gone（かつて存在したが今は無い）の語義は失われるが、現フレームワークでは原理的に出せない。将来 TanStack Start/Router が RSC notFound 伝播や任意ドキュメントステータス設定をサポートした場合、`ensurePublicResourceExists` を拡張して 410 を出せる（ADR-001 (D) フォローアップ。`.issue/735/progress.md` 参照）。
  - 正常系では前段チェックと RSC 内本体取得で `getPublicNote`/`getPublicProfile` が2回走る（ADR-001 Consequences と同様、`React.cache` のスコープ差により構造上必発）。read-only 単一行取得で許容範囲。

#### 実測結果（dev + 本番相当の両ランタイムで curl 済み・全 PASS）
- 存在しない note byId / bySlug / 存在しないユーザー → **HTTP 404**（gone / notFound 画面）。
- 実在の公開ノート byId / bySlug / 実在ユーザー → **HTTP 200**（回帰なし）。

---
