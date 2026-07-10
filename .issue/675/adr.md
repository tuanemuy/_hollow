# ADR — Issue #675: dev 限定エントリ分離による dev-only コードの本番混入防止

## ADR-001: 継ぎ目は fetch ラップではなく factory `createFetchHandler(hooks?)`

### Status
Proposed

### Context
prod エントリから dev-only 依存を外しつつ、dev では inline relay と R2 proxy を差し込む必要がある。素朴には「dev エントリが prod の default export `{ fetch }` を外側から包む」方式が考えられるが、

- inline relay の注入点は `RequestServerConfig.relayTriggerOverride` で、これは**リクエストごとの config 生成の内側**（`readRequestServerConfig` → `createRequestContainer` の間）に位置する。外側から `fetch` を包んでも config 生成の内側には手が届かない。
- dev R2 proxy も `baseConfig`（bucket / presign config）と `url` を見て早期に `Response` を返す必要があり、`storage.run` 内の分岐点で刺す必要がある。

### Decision
prod エントリ（`app/server.cloudflare.ts`）から `createFetchHandler(hooks?)` を export し、fetch の内部フローに2つの hook 差し込み点を設ける:

- `relayTrigger({ env, ctx }) => RelayTrigger | undefined` — config 生成の内側で呼び、返り値を `relayTriggerOverride` に載せる。
- `preRoute({ request, env, url, baseConfig }) => Response | undefined` — `storage.run` 内・sitemap 判定より前で呼び、`Response` なら早期終端。

prod の default export は `createFetchHandler()`（フックなし）。dev エントリは同 factory に dev-only hook を渡す。既存継ぎ目 `relayTriggerOverride` は流用（新設しない）。

### Consequences
- 良い点: dev-only の分岐点（config 内側・pre-route）に外側ラップでは届かない箇所へも注入できる。挙動は現状の fetch と同一のまま、分岐の「出所」だけを hook に移すので回帰リスクが小さい。
- 良い点: prod default（hook なし）では両 dev-only モジュールを import しないため、DCE の成否と無関係に構造で混入を排除できる。
- トレードオフ: fetch 内フローに hook 呼び出しの間接が1段増える。ただし hook が undefined の prod 経路はほぼゼロコストで、可読性への影響も限定的。

---

## ADR-002: prod エントリを共有モジュール兼用にし、dev エントリがそこから import する

### Status
Proposed

### Context
`createFetchHandler` と ALS セットアップ（`installContainerStore` 含む）をどこに置くか。選択肢は (a) prod エントリ `app/server.cloudflare.ts` に置き dev がそこから import、(b) 第三の共有モジュール（例 `server.cloudflare.shared.ts`）を作り prod/dev 双方が import。

### Decision
(a) を採用（オーナー方針1に一致）。`createFetchHandler` / `FetchHandlerHooks` / ALS セットアップ / `installContainerStore` を prod エントリ top-level に置く。prod の default export は `createFetchHandler()`。dev エントリ `app/server.cloudflare.dev.ts` は prod エントリから `createFetchHandler` を import し、dev-only hook を渡して自身の default export とする。依存方向は dev → prod の一方向のみ（prod は dev を import しない）。

### Consequences
- 良い点: 新規ファイルは dev エントリ1つで済み、共有モジュールの追加を避けられる。prod の import グラフに dev-only が現れないという不変条件が1ファイルを見れば確認できる。
- 良い点: `import.meta.hot` は build で undefined のため、ALS の HMR ピン止めコードを prod 側 top-level に置いても無害（オーナー確認済み）。
- トレードオフ: dev import 時に prod エントリ top-level の `export default createFetchHandler()` が未使用のハンドラオブジェクトを1つ生成する。副作用なし・生成コスト無視できるため許容。
- トレードオフ: 選択肢 (b)（`server.cloudflare.shared.ts` に factory を置き prod/dev 双方が薄く import）は `FetchHandlerHooks` 等の dev-only **概念**（コードは載らないが概念）が prod ファイルに残る軽微なコンセプト漏れを避けられるが、新規ファイル増加とのトレードオフで今回は (a) を選択。レビューで「hooks が prod ファイルに同居する」違和感が出たら (b) が妥当な代替。

---

## ADR-003: エントリ選択は `mode === "production" ? prod : dev` とし、silent fallback を安全側に倒す

### Status
Proposed

### Context
`vite.config.cloudflare.ts` の `tanstackStart({ server: { entry } })` はパス指定をミスすると黙ってデフォルト CF エントリに fallback する（既存コメントの罠）。エントリを mode で二分する際、分岐の向きによって「誤設定時にどちらへ倒れるか」が変わる。

### Decision
`defineConfig(({ mode }) => ...)` の関数形式にし、`entry = mode === "production" ? "server.cloudflare.ts" : "server.cloudflare.dev.ts"` とする。production を明示条件（真）側に置き、それ以外（dev/build:local）を dev エントリに割り当てる。

### Consequences
- 良い点: 万一 dev エントリのパスを誤っても、production ビルドは prod エントリ（dev import ゼロ）を選ぶため「prod へ dev 混入」は構造上起こり得ない。誤設定は「dev で inline relay / R2 proxy が動かない」側に倒れ、export が待機中のまま等で即顕在化する。
- 良い点: grep による後追い検証を復活させる必要がない（オーナー方針3）。
- トレードオフ: dev 側の不動作は自動テストでは捕まえにくく、手動動作確認（`pnpm dev` / `pnpm build:local && pnpm start`）に依存する。ただし顕在化が早く実害は dev 環境に限定される。

---

## ADR-004: Worker エントリの mode 切り替えは `@cloudflare/vite-plugin` の `config` カスタマイザで `main` を上書きする（実装時の発見）

### Status
Accepted（実装で確定）

### Context
ADR-003 / plan.md は「`tanstackStart({ server: { entry } })` を mode で切り替えれば、ビルドされる Worker のフェッチエントリが切り替わる」「`wrangler.toml` の `main` はバイパスされる」ことを前提にしていた。実装後の実測（`build:local` の出力 `dist/server/index.js` を grep）で、この前提が **誤り** であることが判明した:

- `tanstackStart({ server: { entry } })` を mode で dev エントリに切り替えても、`dist/server/index.js` のルートは変わらなかった（dev-only コードが載らない）。
- `wrangler.toml` の `main` を `app/server.cloudflare.dev.ts` に書き換えると、初めて dev-only コードが出力に載った。

すなわち `@cloudflare/vite-plugin`（v1.36.4）は **`wrangler.toml [main]`（＝解決済み Worker 設定の `main`）をビルドの Worker エントリとして採用**しており、tanstackStart の `server.entry` は Worker ルートを決定しない。旧構成が機能していたのは `main` と `server.entry` が同一ファイル（`app/server.cloudflare.ts`）を指していて衝突しなかったため。両者が食い違うと `main` が勝つ。

`wrangler.toml [main]` は静的な TOML 値で mode 分岐できず、かつ `pnpm dev` / `pnpm build:local` / `pnpm build`（deploy 前ビルド含む）はいずれも `wrangler.toml` を読むため、TOML だけでは prod ビルドに dev エントリが混入するリスクがある。

### Decision
`@cloudflare/vite-plugin` の `EntryWorkerConfig.config`（`WorkerConfigCustomizer`）を使い、解決済み Worker 設定の `main` を mode で上書きする。**カスタマイザは差分（変更したいフィールドだけ）を返す**:

```ts
cloudflare({
  viteEnvironment: { name: "ssr", childEnvironments: ["rsc"] },
  config: () =>
    mode === "production" ? undefined : { main: "app/server.cloudflare.dev.ts" },
})
```

- `production`（`pnpm build` / `deploy:*`）: `undefined`（＝差分なし）を返し `wrangler.toml [main]`（＝prod エントリ `app/server.cloudflare.ts`）のまま。
- それ以外（`pnpm dev` / `pnpm build:local`）: `{ main: dev エントリ }` の**差分だけ**を返す。

**罠（実装中に発見・修正済み）**: `WorkerConfigCustomizer<true>` の型は `(config) => Partial<WorkerConfig> | void` で、返り値は解決済み設定に**マージ**される。当初 `{ ...config, main }` と**設定全体を spread して返した**ところ、`d1_databases` / `r2_buckets` / `services` / `definedEnvironments` 等の**配列バインディングが二重連結**され（例: d1 が 1→2、r2 が 2→4）、`wrangler dev` が `"DB assigned to multiple D1 Database bindings"` で起動不能になった。prod（`config` をそのまま返す経路）でも同様に二重化した。返すのは delta のみに限定することで解消。**この不具合はコード上の dev/prod 分離の grep 検証では捕まらず、実際に `pnpm build:local && pnpm start` / `pnpm build && pnpm start` でサーバーを起動して初めて顕在化する** — 構造検証だけでなくランタイム起動確認が必須。

tanstackStart 側の `server.entry` も同じ mode 分岐で dev/prod を揃える（Worker ルートは決めないが、tanstack のサーバーエントリ検出と整合させ意図を明示するため据え置き。カスタマイザを外して `server.entry` だけにすると dev-only コードが一切バンドルされないことを実験で確認済み ＝ 実効レバーは `main` 側）。

### Consequences
- 良い点: ADR-003 の狙い（AC-1〜AC-5、特に「prod へ dev 混入ゼロ」「誤設定は dev 機能停止側へ倒れる」）はそのまま満たす。production は常に `wrangler.toml [main]`（prod エントリ）へフォールスルーするため、dev パスの誤設定が prod バンドルに混入することは構造上あり得ない。dev エントリのパス誤りは `main` 解決失敗（ビルドエラー）として即顕在化し、silent fallback より安全側。
- 実測での裏取り（全経路をサーバー起動して確認）: ① `pnpm build`（production）→ JS バンドルに dev-only コード（`InlineRelayTrigger` / `buildDevObjectStorageResponse` 等）が全滅、`pnpm build:local` には載る（AC-1/AC-2）。② prod サーバーは `GET /` 200・`/sitemap.xml` 200 XML・`/dev/r2/x` はアプリの HTML 404（proxy 不発火）。③ dev サーバー（`build:local` / `pnpm dev` 両方）は `/dev/r2/x` が dev proxy の plain-text `Not Found`（proxy 発火）。④ dev エントリ経由で管理ダッシュボードが認証込みで描画（回帰なし）。
- トレードオフ: エントリ切り替えの実効レバーが tanstackStart ではなく `@cloudflare/vite-plugin` 側にある点はプラグイン実装依存。将来 `@cloudflare/vite-plugin` が `server.entry` を尊重する / `main` 解決を変えた場合は再確認が要る。`server.entry` の mode 分岐を冗長に残しているのはこの依存の明示と、両者を常に一致させておく保険。
