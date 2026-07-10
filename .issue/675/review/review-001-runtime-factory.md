# レビュー — PR #833 / Issue #675（Runtime & Factory 観点）

- **対象:** `refactor(runtime): #675 dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防止`
- **base:** `main` (`f3a40035`) / **head:** `issue/675/dev-entry-separation`
- **観点:** Runtime & Factory（fetch フロー等価性・hook 型設計・dev エントリ逐語移設・prod dev-import ゼロ・ALS 配置）
- **対応 AC:** AC-3 / AC-4 / AC-7 / AC-9

## 結論

Runtime/Factory の中核設計（`createFetchHandler(hooks?)` factory・2 hook 注入点・dev エントリ分離）は
plan.md / adr.md の意図どおりに実装され、**fetch フローは旧実装と分岐順序・挙動レベルで等価**。
prod default export は dev-only モジュールへの import 経路をゼロにでき、dev→prod の一方向依存で循環・
副作用も無い。AC-3/AC-4/AC-7/AC-9 はコード上いずれも満たされている。**Blocker は無し。**
1 件だけ、AC-7 が明示要求したランタイム裏取り（`DEV_INLINE_RELAY=false` トグル）が実行時検証では
未実施（構造・配線検証で代替）である点を Warning として残す。

---

## 検証詳細

### 1. fetch フロー書き換えの挙動保存（AC-9 の核心）

旧 `app/server.cloudflare.ts`（base）の fetch フローと、新 `createFetchHandler`（`app/server.cloudflare.ts:65-109`）
＋ dev hook（`app/server.cloudflare.dev.ts`）を突き合わせた。

**① config 生成 → relayTrigger override 注入の位置:**
- 旧: `baseConfig = readRequestServerConfig(env, ctx)` → `inlineRelay = (MODE!=="production") && resolveInlineRelayGate({viteDev, flag})` → `config = inlineRelay ? {...baseConfig, relayTriggerOverride: new InlineRelayTrigger(...)} : baseConfig` → `createRequestContainer(config)`。
- 新: `baseConfig = readRequestServerConfig(env, ctx)`（`:78`）→ `override = hooks?.relayTrigger?.({env,ctx})`（`:79`）→ `config = override ? {...baseConfig, relayTriggerOverride: override} : baseConfig`（`:80-82`）→ `createRequestContainer(config)`（`:83`）。
- **等価。** 注入点は `readRequestServerConfig` と `createRequestContainer` の間という「config 生成の内側」で保存されており、ADR-001 が factory を選んだ理由（外側 fetch ラップでは届かない）と整合。override の truthy 判定は `InlineRelayTrigger` インスタンス＝常に truthy なので旧 `inlineRelay` 真偽と一致。`exactOptionalPropertyTypes` 下でも override 真の分岐だけ `relayTriggerOverride` キーを立てる形で違反なし。

**② `storage.run` 内の preRoute → sitemap → defaultEntry のフォールスルー順:**
- 旧順序: `url` 算出 → dev proxy gate（not_found→404 / handle→`buildDevObjectStorageResponse` / pass→フォールスルー）→ sitemap（GET/HEAD かつ `/sitemap.xml`）→ `defaultEntry.fetch(request)`。
- 新順序（`:84-105`）: `url` 算出 → `early = await hooks?.preRoute?.(...)` → `if (early) return early` → sitemap → `defaultEntry.fetch(request)`。
- **等価。** dev proxy 分岐は preRoute（`server.cloudflare.dev.ts:35-55`）へ逐語移設され、sitemap より前・`defaultEntry` フォールスルー前という順序が保存されている。sitemap 判定（`request.method === "GET" || "HEAD"` かつ `url.pathname === "/sitemap.xml"`）も条件・順序ともに不変（`:99-104`）。`url` を一度だけ算出し preRoute と sitemap で共有する点も旧実装と同じ。

**③ dev proxy インライン分岐（not_found/handle/pass）の再現:**
- preRoute hook（`server.cloudflare.dev.ts:35-55`）が旧 storage.run 内の dev proxy ロジックを過不足なく再現。`resolveDevObjectStorageGate({flag: env.R2_DEV_OBJECT_PROXY, pathname: url.pathname, hasBucket, hasPresignConfig})` の入力・`not_found`→`new Response("Not Found", {status:404})`・`handle`→`buildDevObjectStorageResponse({request, bucket, bucketName, presignConfig})`・`pass`→`return undefined`（フォールスルー）まで旧コードと一致。`baseConfig` から `{objectStorageBucket, r2PresignConfig}` を取り、`env.R2_DEV_OBJECT_PROXY` を gate flag に使う出所も不変。
- prod（hook 無し）では preRoute が未定義＝`early=undefined` となり dev proxy gate は**評価すらされない**。旧 prod は gate を毎回評価して `"pass"` を得ていた（flag off）が、結果は同じ「フォールスルー」で挙動等価、かつ構造的に dev proxy コードを load しない分だけ改善（AC-2 の恩恵）。

**preRoute の sync/async 両対応:** hook 型は `Promise<Response|undefined> | Response | undefined`（`:57-62`）。dev preRoute は `Response`（404 同期）/ `Promise<Response>`（`buildDevObjectStorageResponse`）/ `undefined` を返し得るが、factory 側は `await hooks?.preRoute?.(...)`（`:86`）で受けるため同期・非同期いずれも正しく解決。`Response` は常に truthy なので `if (early)` の早期終端も正しい。

→ **AC-9 満たす。** manual-test TC-3（`GET /`=200 / `/sitemap.xml`=200 XML）・TC-4（prod で `/dev/r2/x`=アプリ HTML 404＝proxy 不発火）が実起動で裏取り済み。

### 2. hook 型設計

- `FetchHandlerHooks.relayTrigger: (params:{env:AppEnv; ctx:ExecutionContext}) => RelayTrigger | undefined`（`:49-52`）— 注入点は `relayTriggerOverride?: RelayTrigger`（`serverCloudflare.ts:228`）で、`createRequestContainer` が `relayTriggerOverride ?? buildRelayTrigger(...)`（`serverCloudflare.ts:738-739`）で拾う。戻り値型 `RelayTrigger | undefined` は注入点要求（override 有無）と正確に一致。`env`/`ctx` の受け渡しも `InlineRelayTrigger(env, p=>ctx.waitUntil(p), ConsoleLogger)` 構築に必要十分。
- `FetchHandlerHooks.preRoute: (params:{request; env:AppEnv; url:URL; baseConfig:RequestServerConfig}) => Promise<Response|undefined>|Response|undefined`（`:57-62`）— dev proxy が必要とする `baseConfig`（bucket/presign）・`url`・`env`（flag）・`request`（PUT body/署名検証）を過不足なく渡す。ADR-001 の「baseConfig と url を見て早期 Response」を型で正しく表現。
- `RelayTrigger` 型は `@/core/application/ports/relayTrigger` から type-only import（`:15`）。ポート起点で参照でき、dev-only アダプターに依存しない。
- factory の戻り値型 `{ fetch(request, env, ctx): Promise<Response> }`（`:65-71`）は CF module worker の default export 形状と構造的に互換。

→ 型は注入点の要求と厳密一致。**問題なし。**

### 3. dev エントリの逐語移設（AC-7）

- `resolveInlineRelayGate({ viteDev: (import.meta as {env?:{DEV?:boolean}}).env?.DEV === true, flag: env.DEV_INLINE_RELAY })`（`server.cloudflare.dev.ts:23-26`）は base の内側ゲート（`viteDev: import.meta.env?.DEV===true, flag: env.DEV_INLINE_RELAY`）の**逐語移設**。両条件（`viteDev` OR `flag`）を保存し、`viteDev` 単独へ簡略化していない。
- 外側 DCE ゲート `MODE !== "production"` のみ撤去。これはエントリ分離により dev エントリが production ビルドに載らないため構造的に不要になった正当な削除。
- **#663 再発なし:** `pnpm build:local`（`NODE_ENV=production vite build --mode development`）は dev エントリを選び（vite config customizer, 後述）、かつ `import.meta.env.DEV=false` に static replace される。よって `flag`＝`DEV_INLINE_RELAY` 単独で inline relay を駆動する経路が保存され、AC-7 の不変条件（`viteDev=false` 時のフラグ単独駆動）を満たす。コメント（`:18-22`）にもこの意図が明記。

→ **AC-7 のコード条件は満たす**（下記 W-001 の留保あり）。AC-3（`pnpm dev`）は manual-test TC-6、AC-4（`build:local`）は TC-5 で dev proxy 発火（plain-text 404）まで実起動確認済み。

### 4. prod default export の dev import ゼロ

- `app/server.cloudflare.ts` の import は `node:async_hooks` / `@cloudflare/workers-types`(型) / `@tanstack/react-start/server-entry` / `containerStore` / `serverCloudflare`(DI) / `RequestContainer`(型) / `RelayTrigger`(型) / `buildSitemapResponse` のみ。**dev-only アダプター（`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts`）・`ConsoleLogger` への import は全て除去済み。** `:48`/`:56` の残存参照はコメント内の設計ポインタのみ（コード import ではない）。
- grep（全 `app/**/*.ts`）で dev-only シンボルの import 元は `server.cloudflare.dev.ts` に一意集約されていることを確認。
- **dev→prod 一方向依存:** dev エントリは `./server.cloudflare` から `createFetchHandler` を import（`server.cloudflare.dev.ts:10`）、prod は dev を import しない。循環なし。
- **副作用:** dev import 時に prod top-level の `export default createFetchHandler()`（`:111`）が未使用ハンドラ 1 個を生成するが、副作用なし・生成コスト無視可（ADR-002 で受容済み）。`installContainerStore` / ALS セットアップは prod モジュール単一ロードで一度だけ実行され、dev 経路でも二重実行されない。

→ manual-test TC-1（`pnpm build` 出力の force-text grep で `InlineRelayTrigger`/`inline-dev`/`buildDevObjectStorageResponse`/`resolveInlineRelayGate`/`resolveDevObjectStorageGate` が 0 件）で構造保証を実測裏取り済み。AC-1/AC-2 相当の基盤が AC-9 の「壊れず動く」と両立。

### 5. ALS / installContainerStore の配置

- ALS セットアップ（`:21-34`）＋ `installContainerStore` は共有側（prod エントリ）top-level に据え置き。`Symbol.for("@hollow/request-als")` で `globalThis` にピン止めし、SSR/RSC 二重グラフが同一 store を解決する既存挙動を維持（base から不変）。
- `import.meta.hot?.data` による HMR ピン止めは build 時 `import.meta.hot === undefined` のため prod 側でも `?? {}` / `if (import.meta.hot)` false で無害（ADR-002 の確認どおり）。
- dev エントリは prod を import するため server.cloudflare.ts は 1 度だけ評価＝ALS 初期化・`installContainerStore` も 1 回のみ。二重初期化リスクなし。

→ 配置は健全。**問題なし。**

### 6. vite entry 選択（ADR-004 の実効レバー）

- `vite.config.cloudflare.ts` は `@cloudflare/vite-plugin` の `config` customizer で `main` を mode 上書き: `mode === "production" ? undefined : { main: "app/server.cloudflare.dev.ts" }`（`:34-35`）。**delta のみ返す**形で、ADR-004 で顕在化した「全体 spread による binding 配列二重連結」バグ（manual-test TC-8）を正しく回避。
- `wrangler.toml [main] = "app/server.cloudflare.ts"`（prod エントリ）に据え置き。production は customizer が `undefined`＝差分なしで prod エントリにフォールスルーするため、dev パス誤設定でも prod へ dev 混入は構造上あり得ない（AC-5 の安全な倒れ方）。
- tanstackStart 側 `server.entry` も mode 分岐で dev/prod を揃えている（`:42-47`）。ADR-004 どおり実効レバーは `main` 側だが、意図明示・両者一致の保険として冗長に残す判断は妥当。

→ 直接の対応 AC ではないが AC-3/AC-4/AC-9 のエントリ選択根拠として健全。

---

## Blockers

なし

## Warnings

- **[W-001]** AC-7 が明示要求した「`DEV_INLINE_RELAY=false` にすると inline relay が止まる（`viteDev` 単独へ簡略化していないことの裏取り）」ランタイム確認が未実施。
  - **場所:** テスト計画 vs `.issue/675/manual-test/report.md:79-81`（「未実施（構造・起動検証で代替済み）」）
  - **理由:** manual-test は TC-2 で dev バンドルに inline relay コードが**存在する**ことは実測したが、`DEV_INLINE_RELAY` トグルによる ON→OFF の挙動差、および inline relay の実 outbox ドレイン E2E（AC-3/AC-7 の完全確認）は「移設のみ・ロジック不変・単体テスト pass」を根拠に構造・配線検証で代替している。`resolveInlineRelayGate` は `viteDev || flag==="true"` の純関数で unit test 済みかつ逐語移設のため**残存リスクは実質ゼロ**だが、AC-7 が文言として要求した OFF トグルのランタイム裏取りは満たしていない。
  - **提案:** `pnpm build:local && pnpm start` で `DEV_INLINE_RELAY=true`（ドレインする）／`DEV_INLINE_RELAY=false`（「待機中」で止まる）の 1 往復を実起動で確認し report に追記すれば AC-7 が文言どおり閉じる。コード修正は不要。

## Notes

- **[N-001]** fetch フローは旧実装と分岐順序・早期 return・sitemap 判定順まで完全等価であることを行単位で突き合わせ確認（本文「検証詳細 1」）。分岐の「出所」だけを hook に移し、挙動を保存する ADR-001 の狙いが正しく実装されている。
- **[N-002]** prod default export の dev-import ゼロ・dev→prod 一方向依存・ALS 単一初期化が成立。混入防止が DCE ではなく import グラフ（構造）で保証される Issue の本質が達成されている。
- **[N-003]** `FetchHandlerHooks` 型（dev-only 概念）が prod ファイル `server.cloudflare.ts` に同居する点は ADR-002 が選択肢 (a) 採用時のコンセプト漏れとして明示的に受容済み。実害なし。将来 hooks 定義が肥大化・dev 専用型が増える場合は ADR-002 の代替 (b)（`server.cloudflare.shared.ts`）へ移す余地がある、という設計メモとして記録。
- **[N-004]** hook 型（`relayTrigger` の `RelayTrigger|undefined`、`preRoute` の `Response|undefined` と sync/async 両対応）が各注入点の要求と厳密一致。`await hooks?.preRoute?.()` が同期 404 と非同期 `buildDevObjectStorageResponse` の双方を正しく解決。
- **[N-005]** ADR-004 の delta-only customizer 修正が `vite.config.cloudflare.ts:34-35` に正しく反映され、binding 配列二重化バグ（manual-test TC-8）が解消済み。production は `undefined` フォールスルーで prod エントリ固定＝dev 混入の構造的不能性を担保。
