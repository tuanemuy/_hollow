# Plan Review Round 2 — Issue #675（視点: アーキテクチャ整合性・実現可能性・リスク）

対象: `.issue/675/plan.md` / `.issue/675/adr.md`
レビュー日: 2026-07-11
前提: Round 1（`round-1-arch-risk.md`）の指摘反映後の再確認

## 総評

**問題点（要修正）: ゼロ。** Round 1 で挙げた改善提案 S-001 / S-002 / S-003 はいずれも計画へ的確に反映されており、最重要だった DEV ゲート値問題（build:local は `NODE_ENV=production` により `import.meta.env.DEV=false` → `DEV_INLINE_RELAY` フラグ単独駆動）は、実コードの現状挙動・実コメント・docs 記述のいずれとも正確に一致していることを裏取りした。factory シグネチャ・hook 型・ALS 配置・mode 分岐・dev→prod 一方向 import はいずれも実コードで実現可能で、挙動不変のスコープも維持されている。以下は任意の軽微な明確化提案（S-001）1件のみ。

## Round 1 指摘の反映確認

- **S-001（DEV ゲート値・早まった簡略化の禁止）→ 反映済み。** AC-7（plan L23）が「`pnpm build:local && pnpm start` 出力（`import.meta.env.DEV=false`）では `viteDev=false` のため `DEV_INLINE_RELAY` フラグ単独で inline relay を駆動」「`viteDev` 単独へ簡略化していないことの裏取り」を明記。リスク節「`import.meta.env.DEV` の値（早まった簡略化の禁止）」（plan L181）、設計 dev エントリ記述（plan L117）、調査結果 L45、レビュー履歴 Round 1（plan L197）にも一貫して展開されている。**過不足なし。**
- **S-002（ADR-002 (a) のコンセプト漏れ）→ 反映済み。** ADR-002 Consequences（adr.md L44）に、選択肢 (b)（`server.cloudflare.shared.ts`）が dev-only 概念の prod ファイル残留を避けられる代替である旨を一行追記。判断の据え置き（(a) 続行）と代替の位置づけが明確。
- **S-003（deploy 経路の網羅・grep の minify 耐性）→ 反映済み。** AC-5（plan L21）と調査結果 L45 に「`deploy:staging` / `deploy:production` も素の `vite build`＝production mode → prod エントリ」を明記。ステップ7（plan L165）の grep 対象に minify 耐性のある文字列リテラル `inline-dev` / `/dev/r2/` と純関数シンボル `resolveInlineRelayGate` / `resolveDevObjectStorageGate` / `DEV_OBJECT_STORAGE_PATH_PREFIX` を追加。

## DEV ゲート値問題の裏取り（本 Round の主眼）

計画の中核主張「build:local（`NODE_ENV=production vite build --mode development`）では `MODE="development"`（＝dev エントリ選択・外側ゲート通過）だが `import.meta.env.DEV=false`（＝`viteDev` 側が偽）となり、`DEV_INLINE_RELAY` フラグ単独が `pnpm start` の inline relay を駆動する」を、実コードで確認した:

- **package.json L11:** `build:local` = `NODE_ENV=production vite build --mode development`。`--mode development` が `import.meta.env.MODE="development"` を与え、`NODE_ENV=production` が Vite の resolved production 判定を真にして `import.meta.env.PROD=true` / `DEV=false` を与える（Vite の `DEV`/`PROD` は `--mode` ではなく resolved `NODE_ENV` 由来という既知挙動）。
- **実コメントによる corroboration:** 現行 `app/server.cloudflare.ts` L60-63 が「`pnpm build:local` inlines `MODE` to `"development"` and the runtime gate falls back to the local-only `DEV_INLINE_RELAY` var」と明記。`docs/runtime_cloudflare.md` L53/L55 も同旨（`pnpm start` は `DEV_INLINE_RELAY` が担う／build:local は inline path を保持）。計画の主張はコメントと docs の双方に一致し、机上論ではない。
- **現行ランタイムゲート:** `resolveInlineRelayGate({ viteDev, flag })`（`inlineRelayTrigger.ts` L67-72）は `viteDev === true || flag === "true"`。build:local では `viteDev=false` のため `flag` 単独が有効。計画はこの純関数を**逐語移設**し `{ viteDev, flag }` 両条件を残す方針で、`viteDev` 単独簡略化を明示的に禁じている。**Issue #663 の「待機中」再発リスクを正しく封じている。**
- **外側 DCE ゲート撤去の妥当性:** 計画は外側 `MODE !== "production"` のみ撤去する。dev エントリは production ビルドに載らず（mode 分岐で prod エントリが選ばれる）、他の全経路（`pnpm dev` / build:local）では常に `MODE !== "production"`＝真であったため、撤去しても現行挙動は変わらない。構造分離が外側ゲートの役割を代替する。**論理的に正しい。**

## 実現可能性の再検証（実コードとの突き合わせ）

- **factory / hook 型:** `RelayTrigger` は `app/core/application/ports/relayTrigger.ts` L21 で `export interface`。`RequestServerConfig.relayTriggerOverride?: RelayTrigger`（`serverCloudflare.ts` L228）、`createRequestContainer` は `relayTriggerOverride ?? buildRelayTrigger(...)`（L739）。hook 返り値 `RelayTrigger | undefined` と型整合。**成立。**
- **preRoute 3値ゲート:** `resolveDevObjectStorageGate` は `pass`/`not_found`/`handle`（`devObjectStorageHandler.ts` L17-28）。現行フロー（`server.cloudflare.ts` L94-110）は `baseConfig` の `objectStorageBucket`/`r2PresignConfig` を参照し、404 早期 return を sitemap 判定より前に置く。計画の preRoute は `baseConfig` を受け取り同順序を保存する設計で、現行と一致。**成立。**
- **dev-only 依存の唯一 import 元:** grep により `InlineRelayTrigger` / `resolveInlineRelayGate` / `buildDevObjectStorageResponse` / `resolveDevObjectStorageGate` の実 import は `app/server.cloudflare.ts` のみと再確認（`serverCloudflare.ts` L220/L331 はコメント参照であり import ではない）。よって prod エントリからこの2アダプター import を外せば production グラフから構造的に消える。**中核前提は真。**
- **ALS/`installContainerStore` 配置・dev→prod 一方向 import:** `installContainerStore` は bare な top-level 副作用（`server.cloudflare.ts` L42）で、dev エントリの named import で prod モジュール top-level が一度だけ評価され store が確実にインストールされる。`import.meta.hot?.data` / `if (import.meta.hot)` ガードは build で undefined でも無害。循環なし（prod は dev を import しない）。**問題なし。**
- **mode 分岐:** `dev`=development / `build`=production / `build:local`=development（package.json L9-11）、deploy 系はすべて素の `vite build`＝production（L23,37…）。`mode === "production" ? prod : dev` は所望の対応を与え、silent fallback は安全側（prod 混入不能・dev 機能不全で即顕在化）に倒れる。**AC-5 の主張は正しい。**

## 改善提案（検討推奨）

- **[S-001]** AC-9 / ステップ8 の prod 機能スモークで、`pnpm preview` より `pnpm build && pnpm start`（production 出力を wrangler dev で起動）を第一選択として明記すると確実。優先度低。
  - 理由: `pnpm build`（`@cloudflare/vite-plugin`）は `.wrangler/deploy/config.json` を書き、`wrangler dev`（＝`pnpm start`）を production ビルド出力（`dist/server/index.js`＝prod エントリ）へリダイレクトする（docs L55 記載の既存挙動）。これは worker fetch エントリを workerd 上で実際に走らせるため、prod default（hook なし）が既存 fetch フローと等価に動くこと（AC-9 の閉じ）を最も忠実に検証できる。`pnpm preview`（`vite preview`）でも CF プラグインが workerd を立てるが、canonical な本番相当経路は build→start 側であり、docs の記述とも一貫する。計画は既に「`pnpm preview` もしくは production build を wrangler で起動」と両論併記で hedge しており実害はないため、優先順位を一言添える程度の微調整。

## 良い点

- **最重要の DEV ゲート値問題を、実コメント・docs・純関数実装の三点で裏取りした上で計画へ落としている。** Round 1 で指摘した NODE_ENV 相互作用が AC-7 の不変条件・リスク節・設計記述に一貫展開され、後続実装者の「`viteDev` 単独への簡略化」を構造・文言の両面で防いでいる。#663 再発リスクを正しく封じた。
- **外側 DCE ゲートの撤去範囲が最小かつ論理的に正しい。** 内側ランタイムゲート（`{ viteDev, flag }`）は逐語温存し、構造分離で不要になった外側 `MODE !== "production"` のみ落とす。全経路の現行挙動が保存されることを確認できる。
- **継ぎ目の選定が実コードのフローと一致。** factory + `relayTrigger`（config 内側）/ `preRoute`（storage.run 内・sitemap 前）は、現行 fetch の分岐順序（override 合成 → dev proxy → sitemap → defaultEntry）を忠実に写し、挙動不変を厳格にスコープしている。回帰面が fetch エントリ1ファイル＋vite＋docs＋JSDoc に限定され、既存純関数テストがそのまま回帰ガードになる。
- **Round 1 改善提案3件をすべて計画本文・ADR・AC・ステップに機械的漏れなく反映。** 反映箇所が AC / 調査結果 / リスク / レビュー履歴に多層で刻まれ、トレーサビリティが高い。
