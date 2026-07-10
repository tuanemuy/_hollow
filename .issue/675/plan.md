# 実装計画 — Issue #675: refactor(runtime): dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防ぐ

**Issue:** #675
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

dev 限定コード（`InlineRelayTrigger` と dev R2 proxy）が本番バンドルに載らない保証を、現状の「Vite/Rollup の DCE 頼み＋後追い grep 検証」から「prod エントリがそもそも dev-only 依存を import しない」構造的保証へ格上げする。モジュールグラフに import 経路が無ければ DCE の成否と無関係に物理的に載りようがなく、DCE 制約コメントも grep 手順も不要になる。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `pnpm build`（mode `production`）成果物のモジュールグラフに `InlineRelayTrigger` が構造的に含まれない（prod エントリからの import 経路が存在しないことで保証。ワンタイムで `grep -rn "InlineRelayTrigger" dist/` が空であることを確認するが、恒常的検証手順としては撤去する） | Issue 完了条件 / オーナー方針1 | 1,2,3,5 |
| AC-2 | `pnpm build` 成果物のモジュールグラフに dev R2 proxy（`buildDevObjectStorageResponse` / `resolveDevObjectStorageGate`）が含まれない | Issue 完了条件 / オーナー方針2 | 1,2,3,5 |
| AC-3 | `pnpm dev`（vite dev, :3000）で従来どおり `InlineRelayTrigger` による inline relay が機能する | Issue 完了条件 | 2,4,5 |
| AC-4 | `pnpm build:local && pnpm start`（mode `development`, :8787）で inline relay と dev R2 proxy が従来どおり機能する | Issue 完了条件 | 2,4,5,6 |
| AC-5 | `vite.config.cloudflare.ts` が mode でエントリを切り替える（`mode === "production" ? prod : dev`）。`deploy:staging` / `deploy:production` も素の `vite build`（＝production mode）なので prod エントリを選ぶ。誤指定時は「prod に dev 混入」ではなく「dev で inline relay/proxy が動かない」側に倒れる | オーナー方針3,5 / arch S-003 | 6 |
| AC-6 | DCE 制約コメント（`app/server.cloudflare.ts` の `&&` 左辺・`import.meta` インライン参照）と `docs/runtime_cloudflare.md` の grep 検証コマンドが撤去されている。`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts` の JSDoc から「DCE ゲート／grep で保証」の記述が entry 分離ベースに更新されている | Issue 完了条件 / オーナー方針 | 5,7 |
| AC-7 | ランタイムゲート（`resolveInlineRelayGate` / `resolveDevObjectStorageGate`）は dev エントリ側に残り、`DEV_INLINE_RELAY` / `R2_DEV_OBJECT_PROXY` の ON/OFF は従来どおり効く。特に `pnpm build:local && pnpm start` 出力（`import.meta.env.DEV=false`）では `viteDev=false` のため `DEV_INLINE_RELAY` フラグ単独で inline relay を駆動し、`DEV_INLINE_RELAY=false` にすると inline relay が止まることを確認する（ゲートを `viteDev` 単独へ簡略化していないことの裏取り） | Issue 完了条件 / オーナー方針 | 2,4 |
| AC-8 | `pnpm typecheck && pnpm lint && pnpm test:unit` が通る（既存の `inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` は純関数テストなので不変で pass） | プロジェクト規約 | 8 |
| AC-9 | `pnpm build && pnpm start`（`pnpm build`＝production mode で `.wrangler/deploy/config.json` が `wrangler dev` を production 出力 `dist/server/index.js`＝prod エントリへリダイレクトする既存挙動 → `pnpm start`＝`wrangler dev` が prod エントリを workerd 上で実行。docs L55 準拠）で起動した prod default `createFetchHandler()`（hook なし）が従来どおり fetch を処理する — 通常ルートと `/sitemap.xml` が応答し、dev proxy / inline relay の分岐が存在しない。分岐の出所を hook へ移す過程で sitemap 判定順や `storage.run` 内の早期 return を取りこぼしていないことを機能スモークで確認。**起動コマンドは `pnpm build && pnpm start` に一意確定**（`pnpm build:local && pnpm start` は dev エントリを選ぶため prod スモークには使わない） | coverage S-001 | 8 |

## スコープ

### 含まれないもの
- 継ぎ目 `RequestServerConfig.relayTriggerOverride` の新設・改変 — 既に存在し `createRequestContainer` が `override ?? buildRelayTrigger(...)` で拾う（オーナー方針4）。今回はこの継ぎ目を factory 経由で刺すだけ。
- `InlineRelayTrigger` / `devObjectStorageHandler` の**ロジック**変更（挙動は不変）。移動するのは「どこから import されるか」だけ。
- ランタイムゲート二重化（`MODE !== production` の実行時判定）の維持 — dev エントリにしか存在しなくなるため実行時 `MODE` 判定は不要になる（構造で保証されるため）。ただし `resolveInlineRelayGate` / `resolveDevObjectStorageGate` のフラグ判定はそのまま残す。
- worker エントリ（relay/consumer/pruner/dlq/indexer）のリファクタ — 本 Issue の対象外。
- `wrangler.toml` の `main`（prod エントリ `app/server.cloudflare.ts` を指す）は変更しない — prod エントリのファイル名を据え置くため。

## 調査結果

- **関連ファイル:**
  - `app/server.cloudflare.ts` — 現状の唯一の fetch エントリ。top-level で ALS セットアップ＋`installContainerStore`、`fetch` 内で ① DCE ゲート付き inline relay 注入、② dev R2 proxy 分岐、③ sitemap 分岐、④ `defaultEntry.fetch` を実行。dev-only の `InlineRelayTrigger` / `resolveInlineRelayGate` / `buildDevObjectStorageResponse` / `resolveDevObjectStorageGate` をここで import している（＝混入源）。
  - `app/core/adapters/cloudflare/inlineRelayTrigger.ts` — dev-only アダプター。`InlineRelayTrigger` クラスと純関数 `resolveInlineRelayGate`。JSDoc が「DCE ゲートで prod から除去、grep で検証」と記述（更新対象）。
  - `app/core/adapters/cloudflare/devObjectStorageHandler.ts` — dev-only の R2 proxy。`resolveDevObjectStorageGate`（純関数）と `buildDevObjectStorageResponse`。**DCE ゲートすら無く、現状は本番バンドルに常に載っている**（分離の恩恵が最大）。
  - `app/core/application/di/serverCloudflare.ts` — `RequestServerConfig.relayTriggerOverride`（継ぎ目・既存）、`createRequestContainer`（`relayTriggerOverride ?? buildRelayTrigger(...)`）、`readRequestServerConfig`、`ServerEnv` / `AppEnv` の出所。変更不要（import のみ）。
  - `vite.config.cloudflare.ts` — `tanstackStart({ server: { entry: "server.cloudflare.ts" } })`。パス指定ミスで**黙ってデフォルト CF エントリに fallback** する既存コメントあり（silent fallback の罠）。
  - `docs/runtime_cloudflare.md` — L48-62「Local dev outbox dispatch」に DCE ゲート説明・grep 検証コマンド、L66-79「Local presigned object flow」に dev proxy 説明。
  - `package.json` scripts — `dev`=vite dev（mode development）/ `build`=vite build（mode production）/ `build:local`=`NODE_ENV=production vite build --mode development` / `start`=wrangler dev（build:local 出力を実行）。`deploy:staging` / `deploy:production` も素の `vite build`（＝production mode）→prod エントリを選ぶ。mode 分岐は綺麗に prod/dev に割れている。**注意（DEV の値）:** build:local は `--mode development`（→`MODE=development`＝dev エントリ選択）だが、`NODE_ENV=production` により Vite の `isProduction` が真になり `import.meta.env.DEV=false` / `PROD=true` になる（`import.meta.env.MODE` は `"development"` のまま）。したがって `pnpm start` 経路の inline relay は `viteDev=false` で `DEV_INLINE_RELAY` フラグ単独が駆動する（`pnpm dev` は `DEV=true` で `viteDev` 側が駆動）。
  - `wrangler.toml` `main = "app/server.cloudflare.ts"` — prod エントリを指す。build:local 経由の `pnpm start` は `.wrangler/deploy/config.json` のリダイレクトで vite ビルド出力（＝dev エントリを選択済み）を実行するため `main` はバイパスされる。prod エントリのファイル名据え置きで整合。
  - 既存テスト `inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` — `buildRelayTrigger` / `resolveInlineRelayGate` / `resolveDevObjectStorageGate` / `InlineRelayTrigger` を純関数・クラス単体で検証。fetch エントリ default export を import しているテストは無い（＝エントリ分割で壊れない）。

- **あるべきアーキテクチャ:** hexagonal + DDD、依存は内向き。fetch エントリは presentation/runtime 境界。CLAUDE.md の原則「Make illegal states unrepresentable *before falling back to runtime checks*」に照らすと、「dev コードが prod に載る」不正状態を**型/構造で表現不能にする**のが正。現状は DCE（最適化）と grep（runtime check 相当の後追い）で守る形で、原則から乖離している。本 Issue はこの乖離を解消する。

- **既存実装の状態:** 継ぎ目（`relayTriggerOverride`）と mode 分岐（build/dev の綺麗な分離）は既に揃っており、factory 化とエントリ分割だけで成立する（オーナーがコード突き合わせ済み）。

- **依存関係:** 影響範囲は fetch エントリ（1ファイル分割）＋ vite 設定＋ docs＋2アダプターの JSDoc のみ。DI 層・ドメイン層・worker エントリには波及しない。default export を import している下流も無い。

## 設計

これは presentation/runtime 境界のリファクタ。ドメイン・アプリケーション・アダプターの**ロジック**には触れない。継ぎ目（factory の型・hook）の設計から入り、そこからエントリ分割・vite 設定・docs 撤去へ広げる。

### ドメインモデルへの影響
なし。ドメイン・値オブジェクト・不変条件・ポートは不変。

### ユースケース / アプリケーションロジック
なし。`serverCloudflare.ts`（DI）の `RequestServerConfig.relayTriggerOverride` / `createRequestContainer` は変更しない（継ぎ目は既存のまま利用）。

### アダプター / 永続化 / 外部連携
`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts` は**ロジック不変**。JSDoc の「DCE ゲート＋grep で prod 除去を保証」という記述だけを「dev エントリからのみ import されるため構造的に prod へ載らない」に更新する（AC-6）。純関数 `resolveInlineRelayGate` / `resolveDevObjectStorageGate` はそのまま export（dev エントリと既存テストが参照）。

### UI / プレゼンテーション（fetch エントリの分割 — 本 Issue の中核）

**継ぎ目 = factory `createFetchHandler(hooks?)`。** fetch ラップではなく factory を採用する理由: relayTrigger override の注入はリクエストごとの config 生成の**内側**で起きるため、dev エントリが prod の `fetch` を外から包むだけでは届かない（オーナー方針1）。dev R2 proxy も同じ理由で config/URL を見て早期に `Response` を返す必要があり、同一の継ぎ目（hook）で刺す。

factory は共有側（= prod エントリ `app/server.cloudflare.ts`）の top-level に置き、ALS セットアップ＋`installContainerStore` も共有側 top-level に残す（`import.meta.hot` は build で undefined のため prod 側でも無害 — オーナー方針1）。prod の default export は `createFetchHandler()`（フックなし）で dev import ゼロを保つ。dev エントリ（新規 `app/server.cloudflare.dev.ts`）は `createFetchHandler` を import し、dev-only の hook を渡す。

**hook の型（`app/server.cloudflare.ts` で定義・export）:**

```ts
export type FetchHandlerHooks = {
  // リクエストごとの config 生成の内側で呼ばれ、RelayTrigger override を返す。
  // undefined を返せば override 無し（＝既定の Service Binding 経路）。
  // dev エントリは resolveInlineRelayGate の判定に応じて InlineRelayTrigger | undefined を返す。
  relayTrigger?: (params: {
    env: AppEnv;
    ctx: ExecutionContext;
  }) => RelayTrigger | undefined;

  // container/ALS セットアップ後・sitemap 判定より前に呼ばれる pre-route hook。
  // Response を返せば早期終端、undefined ならフォールスルー。
  // dev エントリは resolveDevObjectStorageGate + buildDevObjectStorageResponse を刺す。
  preRoute?: (params: {
    request: Request;
    env: AppEnv;
    url: URL;
    baseConfig: RequestServerConfig;
  }) => Promise<Response | undefined> | Response | undefined;
};

export function createFetchHandler(hooks?: FetchHandlerHooks): {
  fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response>;
};
```

**factory 内の fetch フロー（挙動は現状と同一、分岐の出所だけ hook に移す）:**
1. `baseConfig = readRequestServerConfig(env, ctx)`
2. `override = hooks?.relayTrigger?.({ env, ctx })` → `config = override ? { ...baseConfig, relayTriggerOverride: override } : baseConfig`
3. `container = createRequestContainer(config)`
4. `storage.run(container, async () => { ... })`:
   - `url = new URL(request.url)`
   - `const early = await hooks?.preRoute?.({ request, env, url, baseConfig })` → `if (early) return early`（dev proxy: `handle`→Response / `not_found`→404 Response / `pass`→undefined でフォールスルー）
   - sitemap 分岐（`GET`/`HEAD` かつ `/sitemap.xml`）→ `buildSitemapResponse(container)`
   - `return defaultEntry.fetch(request)`

prod default export（`createFetchHandler()`）では両 hook が undefined なので inline relay も dev proxy も存在せず、かつ両 dev-only モジュールを import しない。

**dev エントリ `app/server.cloudflare.dev.ts`（新規・薄い）:**
- `createFetchHandler` / `FetchHandlerHooks` / `AppEnv` を prod エントリから import
- `InlineRelayTrigger` / `resolveInlineRelayGate`（inlineRelayTrigger.ts）、`resolveDevObjectStorageGate` / `buildDevObjectStorageResponse`（devObjectStorageHandler.ts）、`ConsoleLogger` を import
- `relayTrigger` hook: `resolveInlineRelayGate({ viteDev: import.meta.env?.DEV === true, flag: env.DEV_INLINE_RELAY })` が true なら `new InlineRelayTrigger(env, p => ctx.waitUntil(p), ConsoleLogger)`、false なら `undefined`。この `{ viteDev, flag }` は現行 `app/server.cloudflare.ts` 内側ゲート（L66-71）の逐語移設で、**両条件を必ず残す**（build:local は `DEV=false` のため `flag`=`DEV_INLINE_RELAY` 単独が `pnpm start` の inline relay を担う。`viteDev` 単独へ簡略化すると build:local で inline relay が黙って止まる）。外側 DCE ゲート `MODE !== "production"` はエントリ分離で構造的に不要になるため落とす（dev エントリは production ビルドに載らない）
- `preRoute` hook: 現状 fetch 内の dev proxy 分岐ロジック（`resolveDevObjectStorageGate` → `not_found`/`handle`/`pass`）をそのまま移設
- `export default createFetchHandler({ relayTrigger, preRoute })`

## 実装ステップ

内側（継ぎ目＝factory の型）→ 外側（エントリ・vite・docs）の順。

### 1. prod エントリを factory 化して dev-only import を除去
- **対象ファイル:** `app/server.cloudflare.ts`
- **変更内容:**
  - `InlineRelayTrigger` / `resolveInlineRelayGate` / `buildDevObjectStorageResponse` / `resolveDevObjectStorageGate` / `ConsoleLogger`（InlineRelayTrigger 生成にのみ使用）の import を削除。
  - `RelayTrigger` 型を `@/core/application/ports/relayTrigger` から import（hook シグネチャ用）。
  - `FetchHandlerHooks` 型と `createFetchHandler(hooks?)` 関数を追加・export。ALS セットアップ＋`installContainerStore` は top-level に据え置き。
  - fetch フローを「設計」節の1〜4に置換。DCE ゲート（`import.meta.env.MODE !== "production" && ...`）と dev proxy インライン分岐を削除し、それぞれ `relayTrigger` / `preRoute` hook 経由に置換。
  - `export default createFetchHandler();`（フックなし）。
  - L52-64 の DCE 制約コメントと L89-92 の dev proxy コメントを削除（構造保証に置き換わるため）。
- **理由:** prod エントリの import グラフから dev-only 依存を物理的に外し、AC-1/AC-2 を構造で成立させる。

### 2. dev エントリを新規作成
- **対象ファイル:** `app/server.cloudflare.dev.ts`（新規）
- **変更内容:** 「設計」節の dev エントリ通り。`createFetchHandler` に `relayTrigger` / `preRoute` hook を渡し default export。dev-only モジュールの import はこのファイルに集約。
- **理由:** dev-only 依存の唯一の import 元をここに限定し、prod からの到達不能を保証（AC-3/AC-4/AC-7）。

### 3. hook 型と既存継ぎ目の整合確認
- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`（読み取りのみ・変更なし想定）
- **変更内容:** `relayTriggerOverride` の型が `RelayTrigger | undefined` であること、`createRequestContainer` が `override ?? buildRelayTrigger(...)` で拾うことを再確認。変更は不要。`relayTriggerOverride` の JSDoc に残る「`pnpm dev` が inline へ...」記述は正確なので温存、DCE 前提の文言があれば軽微修正のみ。
- **理由:** 継ぎ目の新設不要（オーナー方針4）を確定させ、余計な改変を避ける。

### 4. dev-only アダプターの JSDoc 更新（ロジック不変）
- **対象ファイル:** `app/core/adapters/cloudflare/inlineRelayTrigger.ts`, `app/core/adapters/cloudflare/devObjectStorageHandler.ts`
- **変更内容:** 「DCE ゲートで prod から除去／grep で検証」という記述を「dev エントリ（`server.cloudflare.dev.ts`）からのみ import されるため、prod バンドルには構造的に載らない」に更新。`resolveInlineRelayGate` の JSDoc 末尾（「Disabling in production is the entry-point's DCE gate's responsibility, verified by grep」）を「prod エントリはこのモジュールを import しないため、production では到達不能」に書き換え。ロジック・シグネチャは不変。
- **理由:** AC-6。JSDoc が旧保証モデルを指し続けないようにする。

### 5. vite 設定を mode 分岐で entry 切り替え
- **対象ファイル:** `vite.config.cloudflare.ts`
- **変更内容:** `defineConfig(({ mode }) => ({ ... }))` の関数形式に変更し、`tanstackStart({ server: { entry: mode === "production" ? "server.cloudflare.ts" : "server.cloudflare.dev.ts" } })`。silent fallback の既存コメントは残し、「誤指定は dev 機能停止側に倒れる（prod 混入は起きない）」の一文を追記。
- **理由:** AC-5。`build`=production→prod エントリ、`dev`/`build:local`=development→dev エントリ。誤指定時の倒れ方を安全側に固定。

### 6. docs から DCE 制約説明・grep 検証手順を撤去
- **対象ファイル:** `docs/runtime_cloudflare.md`
- **変更内容:**
  - L48-62「Local dev outbox dispatch」: 「DCE gate（build-time）」箇条・grep 検証コマンド（L62）・DCE 前提の但し書きを削除し、「dev エントリ分離により prod バンドルへは構造的に載らない（import 経路が無い）。実行時ゲートは `resolveInlineRelayGate` の `DEV_INLINE_RELAY` / vite dev のみ」という説明に置換。`pnpm build:local && pnpm start` で inline が効く／`pnpm build` では dev エントリが選ばれないため効かない、という mode→entry の対応を明記。
  - L66-79「Local presigned object flow」: 「DCE 対象外だが常に載る」旨の記述を「dev エントリからのみ配線され prod には載らない」に更新。fetch エントリの参照を `server.cloudflare.dev.ts` に補正。
- **理由:** AC-6。grep 手順と DCE 制約コメントを恒常運用から撤去。

### 7. ワンタイム構造検証（PR 内で1回のみ）
- **対象:** ローカル/CI 手作業
- **変更内容:** `pnpm build` 後に `grep -rn "InlineRelayTrigger\|inline-dev\|/dev/r2/\|resolveInlineRelayGate\|resolveDevObjectStorageGate\|buildDevObjectStorageResponse\|DEV_OBJECT_STORAGE_PATH_PREFIX" dist/` が空であることを一度だけ確認（結果を PR に記載）。識別子・クラス名（`InlineRelayTrigger` / `buildDevObjectStorageResponse` / `resolveInlineRelayGate` / `resolveDevObjectStorageGate` / `DEV_OBJECT_STORAGE_PATH_PREFIX`）は production 出力で minify によりリネーム・インライン化され得るため、**minify で消えにくい文字列リテラル**を必ず対象に含める — relay 側 workerId `inline-dev` と proxy 側パスプレフィックス値 `/dev/r2/`（＝`DEV_OBJECT_STORAGE_PATH_PREFIX` の値）。構造分離が効いていれば全滅するが、"効いていることの裏取り" は文字列リテラルの方が確実。これは恒常手順ではなく、構造分離が効いていることの一回限りの裏取り。
- **理由:** AC-1/AC-2 の初回確認。以後は import グラフが保証するため手順化しない。

### 8. 品質ゲート
- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit`（既存 `inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` が pass することを確認）。dev（`pnpm dev`）で inline relay 動作、`pnpm build:local && pnpm start` で inline relay ＋ dev R2 proxy 動作を手動確認。加えて **`pnpm build && pnpm start` で production 出力（prod エントリ）を起動し、通常ルートと `/sitemap.xml` が従来どおり応答する**ことを機能スモークで確認（prod default が hook なしで既存 fetch フローと等価に動くこと。「dev コードが載らない」だけでなく「prod が壊れず動く」ことを閉じる）。この経路が prod エントリを実際に走らせる根拠: `pnpm build`（production mode）が `.wrangler/deploy/config.json` を書き、`pnpm start`＝`wrangler dev` を production 出力 `dist/server/index.js`（＝prod エントリ）へリダイレクトする（docs `runtime_cloudflare.md` L55 の既存挙動）。`pnpm build:local && pnpm start` は dev エントリ側を選ぶため prod スモークには用いない。
- **理由:** AC-8/AC-3/AC-4/AC-9。

## 設計判断

- factory ベースの継ぎ目（fetch ラップではなく `createFetchHandler(hooks?)`）、prod エントリを共有モジュール兼用にして dev がそこから import する構成、mode 分岐の安全な倒れ方 — 詳細は `adr.md` 参照。

## リスクと注意点

- **tanstackStart の silent fallback（オーナー方針3）:** `server.entry` のパスをミスると黙ってデフォルト CF エントリに落ちる。分岐を `mode === "production" ? prod : dev` にしておけば、誤っても「dev で inline/proxy が動かない」側に倒れ、prod へ dev 混入は起きない。dev 側の不動作は即顕在化する（export が待機中のまま等）。
- **dev エントリが prod エントリを import する循環懸念:** dev→prod の一方向 import のみ（prod は dev を import しない）。prod エントリ top-level の `export default createFetchHandler()` が dev import 時にもハンドラオブジェクトを1つ生成するが未使用・副作用なしで無害。
- **`import.meta.env.DEV` の値（早まった簡略化の禁止）:** dev エントリでのみ参照。`pnpm dev`（vite dev）は `DEV=true` で `viteDev` 側が inline relay を駆動する。一方 build:local は `NODE_ENV=production vite build --mode development` のため `MODE=development`（dev エントリ選択）でも `NODE_ENV=production` により `import.meta.env.DEV=false` になり、`pnpm start` 経路では `viteDev=false`・`DEV_INLINE_RELAY` フラグ単独で inline relay を駆動する（これが AC-7 の不変条件の要）。`vite build`（production）では dev エントリ自体がバンドルされないため評価されない。**エントリ分離後も `resolveInlineRelayGate` を `viteDev` 単独へ簡略化してはならない** — build:local（`pnpm start`）の inline relay が黙って止まり Issue #663 の「待機中」が再発する。現行コードの `resolveInlineRelayGate({ viteDev, flag })` をそのまま移設し従来と等価に保つ（外側 DCE ゲート `MODE !== "production"` のみ構造分離で不要になり撤去）。
- **`wrangler.toml main` との整合:** prod エントリのファイル名を `app/server.cloudflare.ts` に据え置くため `main` の変更不要。`pnpm start` は build:local 出力（dev エントリ選択済み）を実行するので `main` はバイパスされる。
- **ALS/`installContainerStore` の単一初期化:** 共有側（prod エントリ）top-level に置くため、dev/prod どちらの経路でもモジュール単一ロードで一度だけ実行される。RSC/SSR 二重グラフでの `globalThis` ピン止めは現状のまま維持。

## テスト方針

- **既存単体テスト:** `inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` は純関数・クラス単体を対象で import 元に依存しないため、そのまま pass（回帰ガード）。
- **型/構造の保証:** import グラフによる構造保証が本質。`pnpm typecheck` で hook 型・factory シグネチャの整合を担保。
- **ワンタイム構造検証:** ステップ7の `pnpm build` → dist grep（空）を PR 内で1回実施。grep 対象は minify 耐性のある文字列リテラル（`inline-dev` / `/dev/r2/`）を含める。
- **prod 機能スモーク（新規・AC-9）:** `pnpm build && pnpm start` で production 出力（prod エントリ）を起動し、通常ルート＋`/sitemap.xml` が従来どおり応答することを確認。`pnpm build`（production mode）が `.wrangler/deploy/config.json` を書いて `pnpm start`＝`wrangler dev` を production 出力 `dist/server/index.js`（＝prod エントリ）へリダイレクトする（docs L55）ため、この経路で prod default（hook なし）が既存 fetch フローと等価に動くことを最も忠実に検証できる。`pnpm build:local && pnpm start` は dev エントリを選ぶので prod スモークには使わない。「載らない」だけでなく「壊れず動く」ことを閉じる。
- **手動動作確認:** ① `pnpm dev` で UoW コミット後に inline relay がドレインする（例: エクスポートが「待機中」で止まらない）。② `pnpm build:local && pnpm start`（:8787）で inline relay ＋ dev R2 proxy（presign→PUT→finalize→表示）が E2E 完走する。加えて `DEV_INLINE_RELAY=false` にすると inline relay が止まる（`viteDev=false` 単独駆動）ことを確認（AC-7）。

## レビュー履歴

### Round 1

- **P-001 / arch S-001（`import.meta.env.DEV` の値）:** build:local は `NODE_ENV=production vite build --mode development` で `MODE=development` だが `DEV=false` になる事実をコードで裏取り。調査結果 L44・リスク節・AC-7・設計節 dev エントリ記述を訂正し、`pnpm start` の inline relay は `DEV_INLINE_RELAY` フラグ単独駆動（`viteDev` 単独への簡略化禁止）と明記。設計 L116 のゲート記述は現行内側ゲートの逐語で不変のまま（外側 DCE ゲートのみ構造分離で撤去）。
- **coverage S-001（prod 機能スモーク）:** AC-9 を新設し、ステップ8品質ゲート・テスト方針に「`pnpm build`（production）出力で通常ルート＋`/sitemap.xml` が応答する」機能確認を追加。
- **coverage S-002 / arch S-003（grep の minify 耐性）:** ステップ7の grep に文字列リテラル `/dev/r2/`（`DEV_OBJECT_STORAGE_PATH_PREFIX` の値）と純関数シンボル `resolveInlineRelayGate` / `resolveDevObjectStorageGate` を追加。識別子は minify で消え得るため文字列リテラル（`inline-dev` / `/dev/r2/`）を確実な裏取りとする旨を明記。
- **arch S-003（deploy 経路）:** `deploy:staging` / `deploy:production` も素の `vite build`＝production mode で prod エントリを選ぶことを AC-5 と調査結果 L44 に明記。
- **arch S-002（ADR-002 代替案）:** ADR-002 Consequences に、選択肢 (b)（共有モジュール）は dev-only 概念の prod ファイル残留を避けられるが新規ファイル増加とのトレードオフで今回 (a) を選択、という一行を追記。

### Round 2

- 両視点（要件カバレッジ・アーキテクチャ/リスク）とも**問題点ゼロで収束**。両レビュアー一致の改善提案（AC-9 の prod スモーク起動コマンド一意化）のみ反映。
- **coverage S-001 / arch S-001（AC-9 起動コマンド一意化）:** production 出力をローカル起動する canonical コマンドを `pnpm build && pnpm start` に確定（`pnpm build` が `.wrangler/deploy/config.json` を書き `wrangler dev`＝`pnpm start` を production 出力 `dist/server/index.js`＝prod エントリへリダイレクトする既存挙動を docs `runtime_cloudflare.md` L55 で裏取り）。AC-9・ステップ8・テスト方針の「`pnpm preview` もしくは production build を wrangler で起動」という両論併記を確定コマンドに置換し、`pnpm build:local && pnpm start` は dev エントリを選ぶため prod スモークに使わない旨を明記。
