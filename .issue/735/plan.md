# 実装計画 — Issue #735: 公開系エラーページのHTTPステータスが200のまま（RSC内notFoundで404/410を返せない）

**Issue:** #735
**作成日:** 2026-06-21
**複雑度:** 中〜大規模

---

## 目的

公開系3ルートで存在しない／非公開のノート・ユーザーを開いたとき、画面（#599 で対応済み）に加えて **HTTP レスポンスステータス**も正しく返す（ノート→410、ユーザー→404、正常系→200）。クローラ・SEO が「正常なページ」と誤解しないようにする。

## 推奨方式と実現可能性（先に結論 — PoC 結果で確定）

**確定方式: ADR-001 (C) の骨子「データ存在チェックを RSC レンダリングの前段に分離」+ ADR-004 — 「前段で NotFoundError なら `throw notFound()` で HTTP 404 を返す」。ステータスは 3ルートとも 404 一律。**

当初は ADR-002 (ii) の「ハンドラ内 `setResponseStatus(410/404)` + `ErrorPage` を return」でノート 410 / ユーザー 404 を出し分ける計画だったが、**実装の PoC でこの前提が覆った**（dev = `pnpm dev` / 本番相当 = `pnpm build && pnpm start` / wrangler dev の両方で curl 検証）:

- **SSR ドキュメントのステータスは TanStack Router が完全制御している。** `router-core/.../router.js` の `load()` が `redirect.status / 404(notFound) / 500(error) / 200(success)` のいずれかにドキュメントステータスを決め、`renderRouterToStream.js` がその status で Response を返す。任意値を割り込ませる経路が router に無い。
- **`setResponseStatus`（`@tanstack/react-start/server`）は h3 event の `res.status` を立てるだけで、SSR ドキュメントのステータスには一切マージされない。** loader 内で `setResponseStatus(410)` を呼んでも成功 return では 200 のまま。ハンドラ内で `setResponseStatus(410)` してから throw しても router が上書きする。
- **`throw notFound()`（`@tanstack/react-router`）は確実にドキュメントを 404 にし、ルートの `notFoundComponent`（`ErrorPage` gone/notFound）を描画する。** ただし 404 固定で、カスタム 410 を出す手段は現バージョンの router に存在しない。

**結論: ノートの 410 要件は現フレームワークでは原理的に実現不可。達成可能な非200ステータスは 404 のみ。** ユーザー決定により「404 で実装」を選択し、3ルート全てで「前段で存在チェック → NotFoundError なら `throw notFound()`」で HTTP 404 を返す。410 は見送り（将来フレームワークが任意ドキュメントステータスをサポートしたら拡張可能。ADR-001 (D) / ADR-004 フォローアップ・`progress.md` 参照）。実機検証（dev + 本番相当の両ランタイム curl）で 404 / 正常系 200 を確認済み・全 PASS。

## 受け入れ基準（PoC 結果を反映・全 AC 達成）

**注（PoC 結果）:** ステップ1 の PoC で「`setResponseStatus` は SSR ドキュメントへ反映されない／410 は現フレームワークで原理的に不可」が判明したため、ノートの 410 要件は 404 に変更した（ADR-004）。達成方法は `setResponseStatus` ではなく `throw notFound()`。下表は変更後の達成済み基準。

| # | 基準（検証可能な形で） | 由来 | ステータス |
|---|---|---|---|
| AC-1 | `/notes/public/$noteId` に存在しない／非公開の noteId へ直アクセス（初回 SSR）した HTTP レスポンスが **404** を返す（410 は現フレームワークで不可、ADR-004）。画面は `ErrorPage kind="gone"`（#599 で対応済み）のまま | Issue「あるべき動作」 | 達成 |
| AC-2 | `/u/$username/$noteSlug` に存在しない／非公開ノートへ直アクセスした HTTP レスポンスが **404** を返す（410 不可、ADR-004） | Issue「あるべき動作」（同 `getPublicNote` 経路） | 達成 |
| AC-3 | `/u/$username` に存在しない（または deleted/suspended）ユーザーへ直アクセスした HTTP レスポンスが **404** を返す | Issue「あるべき動作」 | 達成 |
| AC-4 | 正常系（実在の公開ノート・実在ユーザー）の HTTP レスポンスは **200** のまま。画面・`head`（meta/JSON-LD）が回帰しない | Issue「あるべき動作」 | 達成 |
| AC-5 | 列挙耐性を維持: 「存在しない」「非公開」「deleted/suspended」をステータスで区別しない（ノート・ユーザーとも一律 **404**）。`getPublicNote` / `getPublicProfile` は無改変。**例外: TOCTOU 競合時（前段チェック通過後に非公開化）のみ画面 404・HTTP ステータス 200 を許容（二重防御の設計上の帰結。極稀）** | Issue「やること」列挙耐性 / ADR-003・ADR-004 | 達成 |
| AC-6 | 上記ステータス挙動を検証する自動テスト（`publicStatusBridge.test.ts`、3件パス）と、実機（dev + 本番相当の両ランタイムでの curl による HTTP ステータス確認）手順が存在・実施済み | Issue「やること」確実性評価 | 達成 |

**AC-4 検証注記:** 「`head`（meta/JSON-LD）が回帰しない」は、(a) 既存の head 関連テスト（`head.test.ts` 等）が緑であること、または (b) 正常系レスポンスの curl 本文に `<title>`/OG/JSON-LD が従来どおり含まれることを grep で確認、のいずれかで検証する。正常系 curl で HTTP 200 を確認済み（回帰なし）。

## スコープ

### 含まれないもの
- **認証系エラーページ（`_app/...`、ADR-004 同根本）の HTTP ステータス付与。** 同方式を横展開できるが、本 Issue は公開系3ルートに限定（Issue タイトル・本文が公開系限定）。認証系はログイン必須で SEO/クローラ対象外のため優先度が低い。横展開は別 Issue 相当。なお Issue「影響範囲」では認証系エラーページ（ADR-004 同根本）にも言及があるが、Issue の「あるべき動作」は公開系3ルートのみを列挙しているため、本 Issue では認証系を対象外とする（横展開はヘルパーを再利用して別 Issue で対応可能）。
- **`getPublicNote` / `getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags` などドメイン・usecase の変更。** 一律 NotFound に潰す列挙耐性挙動は意図的に維持（ADR-003）。
- **`errorResponse.ts` の `HTTP_STATUS_BY_KIND` に 410（gone）kind を追加すること。** notFound 全般への副作用を避けるため、410 はハンドラ内 `setResponseStatus` で出す（ADR-002）。エラーシリアライズ契約は無改変。
- **コンポーネント（`PublicNoteDetail` / `UserPublicTop`）の表示ロジック変更。** #599 方式(d)（内部で NotFoundError を捕捉して `ErrorPage` を return）は二重防御として温存する。原則無改変。
- **SPA クライアントナビゲーション時のステータス。** HTTP ドキュメントステータスの概念が無く対象外（画面は #599 が担保）。本 Issue は初回 SSR/直リンク/クローラ経路が対象。

## 調査結果

### 関連ファイル
- `app/routes/notes/public/$noteId.tsx` — `renderPublicNoteById`（render server fn）+ `loadNoteMeta`（meta loader）。**修正対象。**
- `app/routes/u/$username/$noteSlug.tsx` — `renderPublicNote`（同 `PublicNoteDetail` を bySlug で使う）+ `loadNoteMeta`。**修正対象。**
- `app/routes/u/$username/index.tsx` — `renderUserPublicTop` + `loadProfileMeta`。**修正対象。**
- `app/components/public/PublicNoteDetail.tsx` — #599 方式(d) で内部捕捉 → `ErrorPage kind="gone"` を return 済み。**原則無改変（二重防御として温存）。**
- `app/components/public/UserPublicTop.tsx` — 同上 → `ErrorPage kind="notFound"`。**原則無改変。**
- `app/components/public/ErrorPage.tsx` — `kind`: notFound(404)/forbidden(403)/gone(410)/system(500)。`PublicLayout` 内包のフルページ。**無改変。**
- `app/core/presentation/errorResponseMiddleware.ts` — `next()` の throw を捕捉し `isRedirect||isNotFound` 素通し、他は `setResponseStatus(httpStatusFor(...))`。**無改変（既存経路を利用）。**
- `app/core/presentation/errorResponse.ts` — `HTTP_STATUS_BY_KIND`（notFound=404、410 エントリ無し）、`httpStatusFor`。**無改変。**
- `app/core/presentation/publicNoteMeta.ts` — `loadPublicNoteMeta`（`getPublicNote` を直接呼び NotFound は null）。**「usecase 直接呼び」前段分離の既存先行例。** 無改変。
- `app/core/application/publication/getPublicNote.ts` — 存在/非公開を一律 `NotFoundError`。入力は `{kind:"byId",noteId}` / `{kind:"bySlug",username,slug}`。**無改変。**
- `app/core/application/publication/getPublicProfile.ts` — 同。入力 `{username}`。**無改変。**
- `app/core/application/errors/index.ts` — `NotFoundError` / `isNotFoundError`。
- `.issue/599/{adr,plan}.md` / `.issue/12/adr.md`（ADR-004） — 既知制約と方式(d)の一次情報源。

### あるべきアーキテクチャ（CLAUDE.md / spec / runtime_cloudflare.md から）
- これは presentation 層 + RSC/フレームワーク境界の問題。ドメイン・usecase は正しく `NotFoundError` を投げており**変更不要**（依存方向 presentation→application→domain を尊重）。
- HTTP ステータスマッピングは presentation-only（CLAUDE.md「HTTP status mapping is presentation-only」）。エラー自体に transport を持たせない。本 Issue の 410/404 出し分けは presentation（ルートの server fn ハンドラ）に閉じる。
- 「データ取得」と「RSC レンダリング」を分離する設計は、meta loader で既に確立済み（presentation がハンドラ内で usecase を直接呼び、`errorResponseMiddleware` を通す）。本 Issue はこの確立済みパターンの自然な適用。
- ランタイムは Cloudflare Workers + SSR（`docs/runtime_cloudflare.md`）。`setResponseStatus` の SSR ドキュメントレスポンスへの反映可否はこのランタイムで実機確認する。

### フレームワーク再調査（ADR-001 に詳細。要点のみ）
- バージョン: `@tanstack/react-start` 1.168.25 / `react-start-rsc` 0.1.24 / `router-core` 1.171.13 / `react-router` 1.170.15。
- `renderServerComponent` は SSR + router リクエスト経路では `await ssrHandler.decode(stream)` を**ハンドラ await 経路内で**実行する（#599 当時の「同期 return」前提が SSR 経路では変化）。ただし decode の notFound re-throw 挙動は不確定 → これに依存しない方式 (C) を採る。
- server fn ハンドラが notFound を throw すると `server-functions-handler.js` が `status: 404` を返す（404 固定）。
- 「RSC 内 throw notFound → ルート notFoundComponent + 正しいステータス」という正攻法導線は**現バージョンにも無い**（ADR-004 / #599 の結論は現バージョンでも有効）。
- `setResponseStatus`（`@tanstack/react-start/server`）は `errorResponseMiddleware` で既用。任意ステータスを設定可能（410 も可）。

### 既存実装の状態
- 3ルートは `notFoundComponent`/`errorComponent` を配線済み。コンポーネントは #599 方式(d) で画面は正しい 404/410 を出すが、**HTTP ステータスは 200 のまま**（renderable に取り込まれた正常レンダリングのため）。本 Issue はこのギャップを埋める。

### 依存関係
- `PublicNoteDetail` は `$noteId`（byId）と `$noteSlug`（bySlug）の両方から使われるが、本方式の前段チェックは**各ルートの render server fn ハンドラ側**に置くため、ルート単位で独立に修正できる。
- `getPublicNote` / `getPublicProfile` は read-only。前段チェックの追加呼び出しは副作用なし。

## 設計

レイヤー内側→外側で設計する。

### ドメインモデルへの影響
なし。`NotFoundError` の投出・列挙耐性（一律 NotFound）は正しく、無改変（ADR-003）。

### ユースケース / アプリケーションロジック
なし。`getPublicNote` / `getPublicProfile` をそのまま read-only に呼ぶだけ。新規 usecase・DTO 追加なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
本 Issue の修正の中心。**各 render server function のハンドラを「前段の存在チェック → NotFoundError なら `throw notFound()`（HTTP 404）/ 通過時は通常レンダリング」の二段構成に変更する**（ADR-001 (C) の骨子 / ADR-004）。

> PoC で判明したとおり、当初案の `setResponseStatus(410/404)` + `ErrorPage` を return は SSR ドキュメントのステータスに反映されず、ノートの 410 も現フレームワークで不可。そのため**ステータス確定は `throw notFound()`（404 固定）で行い、3ルートとも 404 一律**とした（ADR-004）。

共通化の方針: 3ルートで重複する「存在チェック → NotFound 時に `throw notFound()`」の制御ロジックを、presentation のヘルパー `app/core/presentation/publicStatusBridge.ts` に切り出した。ヘルパーは純 `.ts`（JSX も `components/` 依存も持たない・server-only）。`renderServerComponent` で生成する renderable は引き続き各ルートの `.tsx` 側に残す（presentation → components の逆依存を回避）。

実装したヘルパー:

```ts
// publicStatusBridge.ts （.ts のまま、JSX も components 依存も無い・server-only）
import { notFound } from "@tanstack/react-router";
import { isNotFoundError } from "@/core/application/errors";

export async function ensurePublicResourceExists(
  check: () => Promise<unknown>,
): Promise<void> {
  try {
    await check();
  } catch (error) {
    if (isNotFoundError(error)) throw notFound(); // → router が SSR ドキュメントを 404 に
    throw error;                                  // 非 NotFound は errorResponseMiddleware が 500/system に
  }
}
```

各ルートの render server function ハンドラは、`renderServerComponent(...)` を呼ぶ前に `ensurePublicResourceExists(...)` を呼ぶ:

```ts
// $noteId.tsx
.handler(async ({ data }) => {
  // ... container / getPublicNote / renderServerComponent / PublicNoteDetail を動的 import
  await ensurePublicResourceExists(() =>
    getPublicNote({ container, input: { kind: "byId", noteId: data.noteId } })
  );
  return renderServerComponent(<PublicNoteDetail args={{ kind: "byId", noteId: data.noteId }} />);
})
```

- `$noteId`: `getPublicNote({ kind: "byId", noteId })`
- `$noteSlug`: `getPublicNote({ kind: "bySlug", username, slug })`
- `$username/index`: `getPublicProfile({ username })`

注意点:
- `check()` の結果は捨てる（本体は RSC 内で改めて取得 = 二重取得コスト。リスク欄参照。`React.cache` は server fn ハンドラと RSC レンダリングで別スコープのため**正常系は構造上必ず二重取得になる**）。
- `errorResponseMiddleware` は引き続き配線したまま。`throw notFound()` は素通しされ router が 404 を立てる。非 NotFound 例外（system）は middleware が 500 に倒す。
- コンポーネント側 #599 方式(d) は温存（前段で漏れたケース・TOCTOU の二重防御）。NotFound 時の画面はルートの `notFoundComponent`（`ErrorPage` gone/notFound）が描画する。
- ルートの `notFoundComponent` / `errorComponent` 配線も残す。

## 実装ステップ（実装済み）

PoC で `setResponseStatus` 不達・410 不可が判明したため、ステータス確定は `throw notFound()`（404）に統一して実装した。

### 1. PoC: ステータス確定方式の実機確認（成否を分ける検証）

- 1ルート（`/notes/public/$noteId`）で `setResponseStatus(410)` + `ErrorPage` return と、`throw notFound()` の両方を dev（`pnpm dev`）/ 本番相当（`pnpm build && pnpm start` / wrangler dev）で curl 検証。
- **結果:** `setResponseStatus` は SSR ドキュメントのステータスに反映されず常に 200。`throw notFound()` は確実に 404 を返す。410 は router が notFound を 404 固定にするため不可。→ ADR-002 (ii) を破棄し ADR-004（`throw notFound()` / 404 一律）へ方針変更。ユーザーが「404 で実装」を選択。

### 2. ヘルパー `ensurePublicResourceExists` を実装

- **対象ファイル:** `app/core/presentation/publicStatusBridge.ts`（新規）。
- **内容:** 純 `.ts`・server-only。`check()` を実行し `isNotFoundError` なら `throw notFound()`、それ以外は re-throw（→ `errorResponseMiddleware` が 500/system）。WHY を JSDoc で記述（router がドキュメントステータスを専管、`setResponseStatus` 不達、RSC 内 notFound は decode で握り潰される、を明記）。

### 3. 3ルートの render server function ハンドラを修正

- **対象ファイル:** `app/routes/notes/public/$noteId.tsx`, `app/routes/u/$username/$noteSlug.tsx`, `app/routes/u/$username/index.tsx`。
- **内容:** `renderServerComponent(...)` の前に `ensurePublicResourceExists(() => ...)` を呼ぶ。
  - `$noteId`: `getPublicNote({ kind: "byId", noteId })`
  - `$noteSlug`: `getPublicNote({ kind: "bySlug", username, slug })`
  - `$username/index`: `getPublicProfile({ username })`
- NotFound 時はルートの `notFoundComponent`（`ErrorPage` gone/notFound、#599 のまま）が描画される。コンポーネント側 #599 方式(d) は二重防御として温存。
- **理由:** AC-1〜AC-5。

### 4. 自動テストの追加

- **対象ファイル:** `app/core/presentation/__tests__/publicStatusBridge.test.ts`（新規）。
- **検証点（3件・全パス）:**
  1. `check` が解決するケースで `ensurePublicResourceExists` が resolve すること。
  2. `check` が `NotFoundError` を reject するケースで、throw された値が `isNotFound(thrown) === true`（router の `notFound()`）であること。
  3. `check` が NotFound 以外（`new Error(...)`）を reject するケースで、その例外がそのまま re-throw されること（`errorResponseMiddleware` の 500 経路へ）。
- **理由:** AC-6。実 HTTP ステータスはステップ5の手動 curl で担保。

### 5. typecheck / lint / format / 手動 HTTP ステータス検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` / `pnpm test:unit` 実施。
- **手動検証（dev + 本番相当の両ランタイムで curl 済み・全 PASS）:**
  - `curl -i /notes/public/<存在しないid>` → **404**（gone 画面）。byId / bySlug とも。
  - `curl -i /u/<存在しないユーザー>` → **404**（notFound 画面）。
  - `curl -i /notes/public/<実在の公開ノートid>` / `/u/$username/<実在slug>` / `/u/<実在ユーザー>` → **200**（正常系回帰なし）。
- **理由:** CLAUDE.md 必須後処理 + AC-1〜6 の最終確認。

## 設計判断

- **(C) データ存在チェックを RSC レンダリングの前段に分離**し、フレームワーク内部の decode 挙動に依存しない（詳細 ADR-001、骨子は維持）。
- **ステータス確定は `throw notFound()`（HTTP 404）で行う**（詳細 ADR-004）。当初案の `setResponseStatus`（ADR-002 (ii)）は PoC で SSR ドキュメントに不達と判明したため破棄。ノートの 410 は router が notFound を 404 固定にするため現フレームワークで不可。`errorResponse.ts` の kind マップやドメイン/アプリのエラー契約には手を入れない。
- **列挙耐性をステータスでも維持**（ノート・ユーザーとも一律 404、詳細 ADR-003 / ADR-004）。
- 画面（#599 方式(d)・`notFoundComponent`）・ドメイン・usecase は無改変。本 Issue は presentation のステータス付与に閉じる。

## リスクと注意点

- **[PoC で確定済み] `setResponseStatus` は初回 SSR ドキュメントレスポンスに反映されない。** ドキュメントステータスは TanStack Router が専管（`router.js` の `load()` が redirect/404/500/200 を決定）。よって `setResponseStatus` 案は破棄し `throw notFound()`（404）で確定（ADR-004）。**ノートの 410 は現フレームワークで原理的に不可**（notFound は 404 固定）。将来フレームワークが任意ドキュメントステータスをサポートしたら拡張可能（`progress.md` 参照）。
- **二重取得コスト（正常系・構造上必発）。** 前段チェックの `getPublicNote`/`getPublicProfile` と、RSC 内本体取得は**別メモ化スコープのため正常系で必ず2回走る**。`PublicNoteDetail` の `loadPublicNote` は `cache(serverData(...))`（`React.cache`）でメモ化されているが、`React.cache` のスコープは React のレンダリングコンテキスト（`renderToReadableStream` の内側）であり、server fn ハンドラ本体（前段 `ensureExists` の呼び出し）はその外側＝別レンダリングスコープなので**メモ化は構造的に効かない**。実コードのキャッシュ機構を確認済み（`PublicNoteDetail.tsx:36` の `cache(serverData(...))`）。よって「メモ化が効けば回避」という楽観は採らない。ただし read-only な単一行取得（D1 O(1) 寄り）であり許容範囲。本体取得を前段結果から引き回す最適化は renderable の制約上難しく、スコープ外。（PoC ステップ1で正常系の呼び出し回数を実測して裏取りする。）
- **TOCTOU（前段チェック通過後に状態変化）。** 前段で公開→本体取得直前に非公開化、の競合は理論上ありうる。この場合 #599 方式(d)（コンポーネント内捕捉 → ErrorPage）が画面を担保する（ステータスは 200 になるが極稀でクローラ実害は小）。二重防御として方式(d)を温存する根拠。
- **dev と本番（Cloudflare）でステータス反映が異なる可能性。** ステップ1/5で両ランタイムでの確認を必須ゲートとする（dev 通過・本番未確認では GO 判定しない）。
- **認証系エラーページは未対応のまま**（スコープ外）。同根本なので将来横展開時にヘルパーを再利用できる設計にしておく。

## テスト方針

- **ユニット（`publicStatusBridge.test.ts`・3件パス済み）:** (1) `check` 解決→resolve、(2) `check` が `NotFoundError`→throw された値が `isNotFound(thrown) === true`、(3) `check` が非 NotFound→そのまま re-throw。`@tanstack/react-router` の `notFound`/`isNotFound` を用いる純関数テストで、`renderServerComponent`/`setResponseStatus` のモックは不要。
- **手動/実機（実施済み・全 PASS）:** curl で 404（存在しないノート byId/bySlug・存在しないユーザー）/ 200（正常系）を確認。dev **および本番相当の両ランタイム**。
- コマンド: `pnpm test:unit` / `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

### Round 1（2026-06-21）

要件カバレッジ・スコープ整合性レビュー（`plan-review/round-1-coverage.md`）とアーキテクチャ・リスクレビュー（`plan-review/round-1-arch-risk.md`）の指摘を反映。

**coverage レビュー反映:**
- [P-001] AC 表に PoC（ステップ1）前提を明記。AC-2/AC-3/AC-4/AC-5 の対応ステップに `1` を追加し、PoC 成否が全 AC の前提であることを表から読み取れるようにした。
- [S-001] AC-6 を「PoC 成立時／不成立時」の二分岐で再定義。不成立時は ADR-001 (D) へ退避し未解決事項として記録、AC-1〜5 は持ち越しで Issue を open のまま据え置く終端条件を固定。
- [S-002] AC-4 の `head`（meta/JSON-LD）回帰の検証手段を具体化（`head.test.ts` 緑 または curl 本文 grep）。AC 表に「AC-4 検証注記」を追加し、ステップ5/テスト方針にも反映。
- [S-003] ステップ1 PoC に「正常系で `getPublicNote` が何回呼ばれるか実測する」検証項目を追加。
- [S-004] スコープ「含まれないもの」の認証系項に、Issue「影響範囲」の認証系言及と本計画のスコープ除外の整合を1行補足。

**arch-risk レビュー反映:**
- [P-001] PoC ゲートを「dev と本番ランタイム（`pnpm build && pnpm start`、Cloudflare Workers）の両方で curl 410 を確認できたときのみ GO」の強制条件に変更。dev で 410 が出ても本番で出なければ方式不成立、という判定基準を明記（ステップ1・ステップ5・リスク欄）。
- [P-002] 「正常系の二重 getPublicNote は React.cache のスコープ差（server fn ハンドラ本体は `renderToReadableStream` の外側）で**構造上必発**」と実コード（`PublicNoteDetail.tsx:36` の `cache(serverData(...))`）を確認のうえ確定的に記述。「メモ化が効けば無視可」の楽観表現を撤回。許容理由（read-only 単一行取得・D1 O(1) 寄り）は維持。adr.md の ADR-001 Decision/Consequences も整合修正。
- [P-003] 共通ヘルパー設計を変更。ヘルパーは純 `.ts` のまま（JSX も `components/` 依存も持たない）にし、成功時・NotFound 時の renderable を呼び出し側（ルート `.tsx`）が生成して渡すコールバックとして受け取る設計へ。擬似コード・設計・ステップ2/3・テスト方針を全て更新。
- [P-004] P-003 の設計変更により成功/NotFound の戻り値型が同一 `T` に統一され、戻り値型不一致の懸念が解消する旨を設計欄に明記。
- [S-001] ADR-004 の「renderServerComponent は同期 return」前提が現バージョン（react-start-rsc 0.1.24、SSR 経路で handler 内 await decode）で変化している事実を adr.md ADR-001 に明記。
- [S-002] TOCTOU 時に「画面 410/404・HTTP ステータス 200」を許容する旨を AC-5 に1行固定。
- [S-003] P-003(a) 採用後のテスト簡素化（純 `.ts` で DI しやすく、`renderNotFound`/`renderOk` のコールバック呼び出しと `setResponseStatus` 呼び出しを検証するだけ・`renderServerComponent` モック不要）をテスト方針・ステップ4に反映。

### Round 2（2026-06-21）

2周目: 両視点（要件カバレッジ・スコープ整合性 / アーキテクチャ整合性・実現可能性・リスク）とも**問題点ゼロ**。Round 1 の指摘（P-001〜P-004 / S-001〜S-004）はすべて妥当に反映済みと確認された。軽微な改善提案4件を反映して終了。

- [coverage S-001] AC-5（列挙耐性）の対応ステップに `5`（手動 curl 検証）を追加（`1, 2, 3` → `1, 2, 3, 5`）。「非公開」と「存在しない」が同一ステータスになることは実機 curl でしか観測検証できないため。
- [arch S-002] ステップ5（typecheck）に、loader 戻り値が成功 renderable と NotFound renderable のユニオンになる点、および `useLoaderData()` / `<>{Rendered}</>` 描画が typecheck を通ること（renderable ユニオンが `ReactNode` に収まる）を確認する旨を追記。
- [arch S-003] adr.md の ADR-002 に「`errorResponseMiddleware` は成功 return 時にステータスを上書きしない（catch 節でのみ `setResponseStatus` を呼ぶ）ため、ハンドラ本体での `setResponseStatus(410/404)` + 正常 return が打ち消されない」前提を明示。
- [arch S-001] ヘルパー擬似コードに、`renderOk`/`renderNotFound` が `renderServerComponent`（`Promise<...>`）を返すと戻り値が二重 Promise になるが TS が `Promise<Promise<X>>` を collapse するため実害がない旨を1行注記。

## 実装メモ

実装ステップ1の PoC で、当初計画（ADR-002 (ii)）の前提が覆った。`setResponseStatus(410/404)` は h3 event の `res.status` を立てるだけで SSR ドキュメントのステータスには反映されず、ドキュメントステータスは TanStack Router が完全制御している（`router-core/.../router.js` の `load()` が redirect/404/500/200 のいずれかに決定し、`renderRouterToStream.js` がその status で Response を返す）。`throw notFound()` だけがドキュメントを確実に非200にできるが、これは 404 固定でカスタム 410 を出す手段が現バージョンの router に無い。よってノートの 410 要件は現フレームワークでは原理的に実現不可と判明し、ユーザー決定により方針を 410 → 404 に変更した。3ルートとも「前段で存在チェック → NotFoundError なら `throw notFound()`」で HTTP 404 を返す形（純 `.ts` ヘルパー `ensurePublicResourceExists`）で実装し、gone/notFound 画面は #599 のまま温存した。経緯は ADR-002（Superseded）/ ADR-004（新規）に記録。410 のフォローアップは `progress.md` 参照。
