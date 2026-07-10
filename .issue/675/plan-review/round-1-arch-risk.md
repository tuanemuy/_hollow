# Plan Review Round 1 — Issue #675（視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/675/plan.md` / `.issue/675/adr.md`
レビュー日: 2026-07-10

## 総評

**問題点（要修正）: ゼロ。** 計画は現物コードと突き合わせても技術的に成立し、CLAUDE.md の原則「Make illegal states unrepresentable *before falling back to runtime checks*」に正しく沿っている。factory `createFetchHandler(hooks?)` のシグネチャ、`preRoute` / `relayTrigger` hook の型、ALS/`installContainerStore` の配置、mode 分岐によるエントリ選択 — いずれも実コードの構造で実現可能であることを確認した。以下は改善提案（任意）のみ。

構造分離の前提（＝dev-only 依存の唯一の import 元が fetch エントリであること）はコードで裏取り済み:

- `InlineRelayTrigger` / `resolveInlineRelayGate` の実 import は `app/server.cloudflare.ts` のみ。`serverCloudflare.ts:220,331` はコメント参照であって import ではない。
- `buildDevObjectStorageResponse` / `resolveDevObjectStorageGate` / `DEV_OBJECT_STORAGE_PATH_PREFIX` の実 import も `app/server.cloudflare.ts` のみ。テスト（`__tests__`）を除けば他に到達経路なし。

したがって「prod エントリからこの2アダプターの import を外す」だけで、production ビルドのモジュールグラフから両者が構造的に消える。計画の中核前提は正しい。

## 実現可能性の検証（視点の各論点）

### factory `createFetchHandler(hooks?)` のシグネチャ
現状の fetch フロー（`app/server.cloudflare.ts:65-118`）は「baseConfig 生成 → inline relay override 合成 → `createRequestContainer` → `storage.run` 内で dev proxy 分岐 → sitemap 分岐 → `defaultEntry.fetch`」。計画の factory はこの順序を忠実に再現し、override 生成を `relayTrigger` hook（`storage.run` の外・container 生成前）、dev proxy 分岐を `preRoute` hook（`storage.run` 内・sitemap 前）に移すだけ。両 hook が undefined の prod default 経路は現状の「inlineRelay=false かつ devProxyGate=pass」経路と等価になる。**実現可能。**

### `preRoute` hook の型と dev proxy 3値ゲートの表現力
`resolveDevObjectStorageGate` は `pass`/`not_found`/`handle` を返す（`devObjectStorageHandler.ts:17-28`）。計画の `preRoute({ request, env, url, baseConfig }) => Response | undefined` は `handle`→`buildDevObjectStorageResponse` の Response、`not_found`→404 Response、`pass`→undefined に一対一で写せる。factory 側は `const early = await preRoute(...); if (early) return early;` で早期終端。現状の早期 404（sitemap 判定より前）も順序込みで保存される。`baseConfig` に `objectStorageBucket` / `r2PresignConfig` が存在すること（`serverCloudflare.ts:212,217`）も確認済み。**過不足なく表現可能。**

### `relayTrigger` hook と `relayTriggerOverride` の型整合
`RequestServerConfig.relayTriggerOverride?: RelayTrigger`（`serverCloudflare.ts:228`）。hook 返り値 `RelayTrigger | undefined` と一致。`createRequestContainer` は `relayTriggerOverride ?? buildRelayTrigger(...)`（`serverCloudflare.ts:739`）で拾う。`RelayTrigger` の import 経路 `@/core/application/ports/relayTrigger`（interface は同ファイル 21 行目 export）も正。InlineRelayTrigger の constructor 引数（`env`, `waitUntil`, logger）は hook の `{ env, ctx }` から供給可能。`AppEnv = ServerEnv` の別名なので型も通る。**整合する。**

### ALS/`installContainerStore` を prod エントリ top-level に残す判断
`installContainerStore` は bare な top-level 副作用（`server.cloudflare.ts:42`）なので、dev エントリが `createFetchHandler` を named import した時点で prod モジュール top-level が一度だけ評価され、store は dev 経路でも確実にインストールされる（`containerStore.ts` のアサーションを満たす）。`import.meta.hot` はモジュール単位の状態で、当該モジュールが「エントリ」か「被 import モジュール」かに依らず機能するため、RSC/SSR 二重グラフの `globalThis` + `import.meta.hot.data` ピン止めは現状のまま維持される。build では `import.meta.hot` が undefined で無害。**問題なし。**

### dev→prod 一方向 import の循環・副作用
dev エントリ → prod エントリの一方向のみ（prod は dev を import しない）。循環なし。prod エントリ top-level の `export default createFetchHandler()` が dev import 時にも未使用ハンドラを1つ生成するが、副作用なし・無視できるコスト。**問題なし。**

### mode 分岐の安全側フォールバック
`vite dev`=development / `vite build`=production / `vite build --mode development`(build:local)=development と綺麗に割れており（`package.json:9-11`）、`mode === "production" ? prod : dev` は所望の対応を与える。deploy 系（`deploy:staging` / `deploy:production`）も素の `vite build`＝production mode なので prod エントリを選ぶ。silent fallback で dev パスを誤っても production は必ず prod エントリ（dev import ゼロ）に落ちるため「prod へ dev 混入」は構造上起こり得ない。**AC-5 の主張は正しい。**

## 改善提案（検討推奨）

- **[S-001]** dev エントリの `relayTrigger` hook は `resolveInlineRelayGate({ viteDev, flag })` の **両条件**を必ず残すべきで、計画にその理由を明記しておくと安全。
  - 理由: `build:local` は `NODE_ENV=production vite build --mode development`。Vite は `import.meta.env.DEV`/`PROD` を **`mode` ではなく `NODE_ENV`（resolved `isProduction`）** で決めるため、`build:local` では `MODE="development"` でも `import.meta.env.DEV === false` になる（docs L53/L55 の「build:local は `DEV_INLINE_RELAY` フラグに fall back」という記述はこれが根拠）。つまり `pnpm start` 経路では `viteDev` が false で、`flag`（`DEV_INLINE_RELAY`）だけが inline relay を担う。エントリ分離が済んだからといって gate を `viteDev` 単独に「簡略化」すると、構造は正しくても **`pnpm start` の inline relay が黙って動かなくなる**（Issue #663 の「待機中」再発）。計画は現状の `resolveInlineRelayGate({ viteDev, flag })` を丸ごと移設する方針で正しいが、この NODE_ENV 相互作用を一行コメント/計画注記として残すと、後続実装者の早まった簡略化を防げる。

- **[S-002]** ADR-002 の選択肢 (a)（prod エントリを共有モジュール兼用）に対する軽微なコンセプト漏れを認識しておくとよい。
  - 理由: `FetchHandlerHooks` 型と factory の hook 分岐は実質 dev 専用の抽象で、それが prod エントリファイルに同居する。dev-only の **コード**（import）は載らないので構造保証は保たれるが、dev-only の **概念**は prod ファイルに残る。選択肢 (b)（`server.cloudflare.shared.ts` に factory を置き prod/dev 双方が薄く import）にすると各エントリが真に薄くなり責務が明快になる。オーナー方針1が (a) を指定しており、(a) でも「prod グラフに dev-only が無い」不変条件が1ファイルで確認できる利点があるため (a) 続行で問題ないが、レビュー時に「hooks が prod ファイルにある」ことへの違和感が出たら (b) が代替として妥当、という位置づけを ADR に一行残すと将来の判断が速い。優先度低。

- **[S-003]** AC-5 / ステップ7 の検証範囲を deploy 経路まで明示的に含める。
  - 理由: 計画は `pnpm build` のグラフ検証を挙げるが、実際に本番へ出るのは `deploy:staging` / `deploy:production`（いずれも素の `vite build`＝production mode）。両者も prod エントリを選ぶことはロジック上自明だが、AC の受け入れ確認として「deploy 系スクリプトの build も production mode でエントリ選択される」を一行明記しておくと、mode 分岐の網羅が担保される。あわせてワンタイム grep に `resolveDevObjectStorageGate` / `resolveInlineRelayGate` / `DEV_OBJECT_STORAGE_PATH_PREFIX` を含めると、純関数側の残留有無も一度で裏取りできる（構造的には import 経路が無いので載らないが、初回確認として厚みが出る）。

## 良い点

- **中核前提をコードで裏取りしてから計画に落としている。** 「dev-only アダプターの実 import 元は fetch エントリ1つだけ」という前提が実在し、計画の構造保証が机上論でないことを確認できた。`serverCloudflare.ts` のコメント参照を import と誤認していない点も正確。
- **継ぎ目の選定が的確。** 「fetch 外側ラップでは `relayTriggerOverride`（config 生成の内側）に届かない」という制約を正しく捉え、factory + hook を採用している。ADR-001 の理由付けが実コードのフロー（`readRequestServerConfig` → override 合成 → `createRequestContainer`）と一致。
- **silent fallback を安全側に固定する設計判断。** `mode === "production" ? prod : dev` により、tanstackStart のパス誤指定が「prod 混入」ではなく「dev 機能不全（即顕在化）」に倒れる。これにより grep 検証の復活が不要になり、Issue の目的（grep が要らない構造）と整合。
- **挙動不変を厳格にスコープしている。** アダプターのロジック・ドメイン・ユースケース・worker エントリに触れず、「どこから import されるか」だけを動かす。回帰面が fetch エントリ1ファイル＋vite 設定＋docs＋JSDoc に限定され、既存純関数テストがそのまま回帰ガードになる点も妥当。
- **`wrangler.toml main` 据え置きの整合確認。** prod エントリのファイル名を変えないため `main = "app/server.cloudflare.ts"` が有効なまま（万一直接使われても prod エントリ＝dev import ゼロで安全）という判断も、実ファイル（`wrangler.toml:13`）と一致。
