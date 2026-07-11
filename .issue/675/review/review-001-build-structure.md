# レビュー — Issue #675 / PR #833（観点: Build 設定 & 構造保証 / バンドル衛生）

**対象 PR:** #833
**レビュー日:** 2026-07-11
**観点:** エントリ選択の正しさ、mode 分岐の倒れ方（AC-5）、DCE 撤去の妥当性（AC-6）、JSDoc 整合（AC-6）、prod 構造保証（AC-1/AC-2）、prod スモーク（AC-9）
**参照:** `.issue/675/plan.md`（受け入れ基準）/ `.issue/675/adr.md`（特に ADR-003/ADR-004）

## 総評

Build/構造保証の観点で、本 PR は AC-1/AC-2/AC-5/AC-6/AC-9 をすべて満たしている。dev-only アダプター（`InlineRelayTrigger` / `devObjectStorageHandler`）の実 import 元が `app/server.cloudflare.dev.ts` 1ファイルに限定され、prod エントリ（`app/server.cloudflare.ts`）の import グラフから物理的に消えていることをコードで裏取りした。エントリ選択は `@cloudflare/vite-plugin` の `config` カスタマイザで `main` を delta のみ上書きする形になっており、型契約（`Partial<WorkerConfig> | void`）に正しく沿う。ADR-004 で記録されたバインディング二重連結バグ（全体 spread による配列マージ）は修正済みで、ランタイム起動（`pnpm build:local && pnpm start` / `pnpm build && pnpm start`）で裏取り済み。`pnpm typecheck` は pass（exit 0）を確認した。

**要修正（Blocker）はゼロ。** 唯一の留意点は「構造保証の実効レバーがプラグイン実装依存であり、それを守る恒常的な自動ガードが撤去された」点で、これは ADR で意図的に選択された設計判断だが、バンドル衛生の観点から defense-in-depth として一言残す（W-001）。

## 検証したこと（合格）

### エントリ選択の正しさ

- `vite.config.cloudflare.ts:34-35` の `config: () => mode === "production" ? undefined : { main: DEV_SERVER_ENTRY }` は、`node_modules/@cloudflare/vite-plugin/dist/index.d.mts:78-80` の `WorkerConfigCustomizer<true> = Partial<WorkerConfig> | ((config: WorkerConfig) => Partial<WorkerConfig> | void)` に適合。**差分のみ返す契約**を守っており、`undefined`（=void, 差分なし）で `wrangler.toml [main]`（prod エントリ）へフォールスルー、非 production では `{ main }` の1フィールドだけを返す。
- 全体 spread（`{ ...config, main }`）に戻すと `d1_databases` / `r2_buckets` / `services` / `definedEnvironments` 等の配列がマージで二重連結される旨は、ADR-004 の Decision/罠節と `vite.config.cloudflare.ts:32-33` のコメントの双方に正しく説明されている。ADR-004 は「grep では捕まらずサーバー起動で初めて顕在化」と実測経緯まで記録しており、根拠が明確。

### mode 分岐の倒れ方（AC-5）

- `package.json:9-11,23,37` を確認: `dev` / `build:local`（`--mode development`）→ mode=development → dev エントリ、`build` / `deploy:staging` / `deploy:production`（素の `vite build`）→ mode=production → prod エントリ。分岐は綺麗に prod/dev に割れている。
- production を明示条件（真）側に置くため、`DEV_SERVER_ENTRY` のパス誤指定は **非 production 時のみ** `{ main: 誤パス }` を注入し、wrangler の `main` 解決失敗（ビルドエラー）として即顕在化する。production は常に `wrangler.toml [main]`（`wrangler.toml:13` = prod エントリ）へフォールスルーするため、「prod に dev 混入」は構造上起こり得ない。誤設定は「dev 機能停止」側に倒れる — AC-5/ADR-003 の主張は正しい。
- tanstackStart `server.entry` の mode 分岐（`vite.config.cloudflare.ts:43-47`）は、ADR-004 が「Worker ルートを決めるのは `main` 側であり `server.entry` は実効レバーではない」と実験で確認済みと記録。冗長だが**害はない**。むしろ将来プラグインが `server.entry` を尊重する挙動に変わった場合でも既に mode で正しく分岐済みのため安全側に働く（保険）。削除も可だが、両者を一致させておく現状の判断は妥当（N-002）。

### DCE 撤去の妥当性（AC-6）

- `docs/runtime_cloudflare.md` から旧「DCE gate（build-time）」箇条と後追い grep 検証コマンド（`grep -rn "InlineRelayTrigger..." dist/`）が撤去され、L52「Entry separation (build-time)」= import 経路不在による構造保証に置換されている。docs 全体を grep しても検証用 grep コマンドの残存は無い。
- 情報欠落なし: 旧 DCE 制約（`&&` 左辺の定数畳み込み・`import.meta` インライン参照）は構造分離後は無意味になるため撤去が正。撤去された「一回限りの構造検証（dist grep）」の知見は `.issue/675/manual-test/report.md` TC-1 に保存されている（恒常手順から外し、ワンタイム裏取りとして記録する plan step7 の設計どおり）。
- **#663 の「viteDev に簡略化するな」警告は保持されている**: `docs/runtime_cloudflare.md:55`（"do not collapse `resolveInlineRelayGate` to `viteDev`, or `pnpm start` regresses to Issue #663"）と `app/server.cloudflare.dev.ts:18-22` のコメント両方に残る。`pnpm build && pnpm start` で var が silently inert になる警告も docs L55 に保持。

### JSDoc 整合（AC-6）

- `inlineRelayTrigger.ts`: 旧 JSDoc（main 版 L63-64「that lives in the entry point's constant-folded DCE gate, verified by the post-build grep」）が撤去され、`inlineRelayTrigger.ts:26-29`「Wired exclusively from the dev entry ... The prod entry does not import this module, so it has no import path into staging/production bundles — **structurally, not by dead-code elimination**」に更新。ゲート JSDoc（L62-65）も「structurally unreachable in production regardless of these flags」に更新。旧「DCE ゲート/grep で保証」記述は残っていない（L29 の "dead-code elimination" は構造保証との**対比否定**表現で誤りではない）。
- `devObjectStorageHandler.ts:36-42`: 「wired by the dev entry (`app/server.cloudflare.dev.ts`) only when `R2_DEV_OBJECT_PROXY === "true"` ... The prod entry does not import this module, so it cannot reach a production bundle」に更新。

### AC-1/AC-2 の構造保証

- `grep -rn "adapters/cloudflare/inlineRelayTrigger|adapters/cloudflare/devObjectStorageHandler" app`（テスト除く）の実 import 元は **`app/server.cloudflare.dev.ts` のみ**。prod エントリ `app/server.cloudflare.ts` は該当 import を全削除し（diff で確認）、残るのは型 `RelayTrigger` の import のみ。prod エントリは `import.meta.hot` を参照するが（ALS の HMR ピン止め、build で undefined）、`import.meta.env.MODE/DEV` は参照しない。よって prod のモジュールグラフから両アダプターの load 経路が消える論理は妥当。`.issue/675/manual-test/report.md` TC-1/TC-2 が `pnpm build` 出力での全滅・`pnpm build:local` 出力での残存を実測で裏取り（minify 耐性のある文字列リテラル `inline-dev` / `/dev/r2/` を含む force-text grep）。
- `wrangler.toml [vars]` の dev フラグ（`R2_DEV_OBJECT_PROXY` / `DEV_INLINE_RELAY`）は **ローカル `wrangler.toml:39,48` のみ**に存在し、`wrangler.staging.toml` には無いことを確認（`wrangler.production.toml` は `.gitignore:18` で除外＝deployer ローカルにのみ存在するデプロイ設定）。report TC-1 の「`dist/server/wrangler.json` に残る `[vars]` は設定メタデータでありコードではない。本番デプロイは `wrangler.production.toml` を使うため無関係」という記述は正しい（`deploy:production` = `wrangler deploy --config wrangler.production.toml` で、`dist/server/wrangler.json` はデプロイ時のバインディング source ではない）。誤解を招く記述は無い。

### AC-9（prod スモーク）

- `app/server.cloudflare.ts:99-104` で sitemap 分岐が `preRoute` hook（早期 return）**より後・`defaultEntry.fetch` より前**に保存されており、分岐の出所を hook へ移す過程で順序を取りこぼしていない。prod default `createFetchHandler()`（hook 両方 undefined）は「override なし → sitemap 判定 → defaultEntry」の従来フローと等価。report TC-3（`GET /` 200・`/sitemap.xml` 200 XML・`/admin` 200）/ TC-4（`GET /dev/r2/x` はアプリの HTML 404 = proxy 不発火）で裏取り済み。

## Build & 構造保証

### Blockers

なし

### Warnings

- **[W-001]** 構造保証の実効レバー（`@cloudflare/vite-plugin` の `main` 上書き）がプラグイン実装依存であり、それを守る**恒常的な自動ガードが存在しない** / 場所: `vite.config.cloudflare.ts:34-35`、`docs/runtime_cloudflare.md:62`（撤去された grep） / 理由: ADR-004 自身が「plan の当初前提（`server.entry` で Worker エントリが切り替わる）は**誤り**で、`pnpm build:local` 出力を grep して初めて判明」「サーバー起動で初めて顕在化」と記録しているとおり、「どのファイルが `main` になるか」はプラグインのバージョン依存挙動（v1.36.4 で確認）。今回その唯一の後追いガード（dist grep）を恒常手順から撤去した。構造分離（import グラフ）は DCE より遥かに強い保証であり、`mode==="production"` 時に delta を返さない現構成では dev コードの prod 混入は起こりにくいが、将来のプラグインアップグレードで `config` カスタマイザの適用タイミングや `main` 解決が変われば、**回帰を CI で捕捉できない**（plan step7 の grep はワンタイム、テストは純関数単体のみで bundle 内容を検証しない）。 / 提案: 必須ではない（plan/ADR が恒常 grep 撤去を意図的に選択済み）。ただし defense-in-depth として、production build 出力に対する軽量スモーク（`pnpm build` 後に `dist/` を `inline-dev` / `/dev/r2/` の文字列リテラルで grep して空を確認する1行チェック）を CI に置くと、プラグイン挙動の回帰を早期に検知できる。構造保証を弱めず、撤去した裏取りの自動化版として整合する。

### Notes

- **[N-001]** エントリ選択・mode 分岐・二重連結バグの経緯が ADR-004 に実測ベースで克明に記録されており、"構造検証だけでなくランタイム起動確認が必須" という教訓まで残している点は、将来のプラグインアップグレード時の再確認ガイドとして非常に有用。
- **[N-002]** tanstackStart `server.entry` の mode 分岐（`vite.config.cloudflare.ts:43-47`）は Worker ルートを決めない冗長分岐だが、ADR-004 の記述どおり「実効レバー（`main`）と常に一致させておく保険」「将来 `server.entry` が尊重される挙動になっても安全側」という位置づけで、削除より現状維持が妥当。害はない。
- **[N-003]** dev エントリ `app/server.cloudflare.dev.ts:23-26` が `resolveInlineRelayGate({ viteDev, flag })` の両条件を逐語移設し、`viteDev` 単独への簡略化を禁じるコメント（#663 参照）を添えている点は、AC-7 の不変条件（`pnpm build:local` は `DEV=false` で `DEV_INLINE_RELAY` フラグ単独駆動）を正しく保全している。外側 DCE ゲート `MODE !== "production"` のみを撤去し、内側ランタイムゲートは温存する範囲設定は最小かつ論理的に正しい。
- **[N-004]** prod default の `export default createFetchHandler()`（`server.cloudflare.ts:111`）が dev import 時にも1つ未使用ハンドラを生成するが、`createFetchHandler` は副作用のないオブジェクト生成のみで無害（ADR-002 のトレードオフとして認識済み）。ALS/`installContainerStore` の top-level 単一初期化も維持されている。
