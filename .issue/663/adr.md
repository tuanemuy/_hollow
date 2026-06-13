# ADR — Issue #663: ローカル検証環境（pnpm start）でのジョブ型エクスポート完走

## ADR-001: `pnpm start` の outbox 消費は wrangler multi-worker ではなく InlineRelayTrigger の var ゲート拡張で実現する

### Status
Proposed

### Context

`pnpm start`（`wrangler dev` 単体）では relay / consumer Worker（別エントリポイント）が起動せず、outbox イベントが消費されない。選択肢は大きく 2 つ:

1. **wrangler dev の multi-worker 起動** — `wrangler dev -c wrangler.toml -c <relay用toml> -c <consumer用toml>` のように同一 miniflare プロセスで複数 Worker を起動し、Service Binding と Local Queue を実経路で動かす。`--env` をコンフィグごとに指定できないため、relay / consumer 用にローカル専用の小さな toml を新規に切り出して bindings（D1 / R2 / Queue / Service Binding / vars）を重複定義する必要がある。
2. **InlineRelayTrigger のゲート拡張** — #66 で `pnpm dev` 用に導入済みの同一 isolate 内インライン dispatcher を、ローカル `wrangler.toml [vars]` の専用フラグ（`DEV_INLINE_RELAY = "true"`）でも有効化する。`import.meta.env.MODE === "production"` の Vite ビルド時定数化と組み合わせ、デプロイ成果物からの DCE（#66 ADR-003 の保証）を維持する。

### Decision

選択肢 2 を採用する。

- #66 が確立した「dev 環境の outbox は同一 isolate でインライン dispatch する」方針（ADR-001/002/003）の一貫した延長であり、`pnpm dev` と `pnpm start` で挙動が揃う。
- 選択肢 1 は wrangler.toml の bindings 重複（既に「named env へは継承されないため重複している」と注記されるほど同期コストが高い）をさらに増やし、ポート競合・起動順・cron 手動トリガ（`--test-scheduled`）などローカル特有の運用課題を持ち込む。実 Queue 経路（リトライ・DLQ・レイテンシ）の検証はもともと staging の責務であり（docs/runtime_cloudflare.md）、ローカルで実経路を再現する便益が複雑さに見合わない。
- フラグをローカル `[vars]` にのみ置くパターンは `R2_DEV_OBJECT_PROXY`（#657）の前例があり、運用ルールとして既に確立している。

### Consequences

- 良い点: 変更が小さい（ゲート式 + var + docs）。`pnpm dev` / `pnpm start` の検証体験が統一される。staging / production の実行経路・成果物は不変（DCE 維持）。
- トレードオフ: ローカルでは Queue 実経路（非同期・リトライ・DLQ）を検証できないまま — これは従来どおり staging で検証する。インライン dispatch は同期的で、1 kick = 1 バッチの制約（#66 ADR-002）も引き継ぐ。
- 注意: DCE 維持は「`MODE === "production"` 節が Vite で定数畳み込みされること」に依存する。ビルド後の grep 検証（docs 記載のコマンド）を受け入れ基準に含めて担保する。

### 追記（Round 1 レビュー反映）: DCE ゲートの構造

当初案は定数条件 `productionBuild`（`import.meta.env?.MODE === "production"`）を純関数 `resolveInlineRelayGate` の引数として渡す形だったが、**Rollup は関数呼び出しを越えて定数畳み込み（インライン展開）しない**ため、引数が定数化されても呼び出し結果は静的に `false` と判定されず、`InlineRelayTrigger` がバンドルに残る。よってゲートを 2 段に分離する:

1. **DCE ゲート** — エントリポイント（`app/server.cloudflare.ts`）のトップレベルで `meta.env?.MODE !== "production" && resolveInlineRelayGate({ viteDev, flag })` と短絡 `&&` の左辺に定数条件を直接置く。Vite ビルドでは左辺が `false` に定数化され、右辺（純関数呼び出し・`InlineRelayTrigger` 参照）ごと除去される。
2. **実行時ゲート** — 純関数は `viteDev === true ∨ flag === "true"` のみを判定。「production ビルドで無効」の保証は純関数のロジックではなく、ビルド時に経路自体が存在しないこと（DCE）＋ビルド後 grep 検証が担う。単体テストの責務もそれに合わせて実行時判定（flag 厳密一致・viteDev 優先）に限定する。

## `import.meta` は中間変数に束縛せずインライン参照する

### コンテキスト

実装時、`const meta = import.meta as { env?: ... }` と一度変数に束縛してから `meta.env?.MODE` を参照する形でゲート式を書いたところ、`pnpm build` 後の DCE grep が失敗した（`InlineRelayTrigger` / `inline-dev` / `import.meta.env` がバンドルに残存）。Vite の define 置換は `import.meta.env.MODE` というプロパティアクセス式の構文パターンに対して働くため、中間変数を経由すると置換されず定数畳み込みが起きない。

### 決定内容

ゲート式の各参照は `(import.meta as { env?: { MODE?: string } }).env?.MODE` のように `import.meta` を式中に直接インラインで書く（既存の `DEV` 参照と同形）。エントリポイントのコメントにこの制約を明記した。

### 理由

インライン参照に戻したところ `vite build` で左辺が定数化され、DCE grep が通過（バンドルサイズも約 120 kB 減 = インライン経路一式の除去を確認）。plan.md ステップ 3 の注意書き（「効かない場合は参照形を調整」）に従った対応。

## `pnpm start` 検証は production ビルドではなく `pnpm build:local`（--mode development）の成果物で行う

### コンテキスト

ブラウザ検証（TC-1）で、`pnpm build && pnpm start` 環境では `DEV_INLINE_RELAY = "true"` が届いていてもインライン経路が一切有効化されず、outbox の `export.job.requested` が attempts 0 のまま放置されることが判明した。原因は plan の前提誤り: `pnpm start`（`wrangler dev`）は TS ソースを直接バンドルするのではなく、`pnpm build`（`@cloudflare/vite-plugin`）が書き出す `.wrangler/deploy/config.json` の **redirected config**（`dist/server/wrangler.json` → `dist/server/index.js`）を実行する。つまり `pnpm start` は常に Vite ビルド成果物を動かしており、production ビルドでは `MODE === "production"` が inline され DCE でインライン経路自体が消えているため、実行時ゲートに到達する余地がない。

### 決定内容

ローカル検証用ビルドスクリプト `"build:local": "NODE_ENV=production vite build --mode development --config vite.config.cloudflare.ts"` を追加し、`pnpm start` での検証は `pnpm build:local && pnpm start` で行う。

- `--mode local` は Vite が「`.local` postfix の .env ファイルと衝突する」として拒否するため使えない。`--mode development` を採用。
- Vite は非 production モードで `NODE_ENV` を development に倒すため、production 同等の挙動（minify 等の本番条件）に近づける目的で `NODE_ENV=production` を前置する。
- 既存の 2 段ゲート（エントリの `MODE !== "production"` 短絡 + `resolveInlineRelayGate`）は変更しない。

### 理由

- 「production バンドルにインライン経路を残す」案（DCE ゲートの撤廃・条件緩和）は、#66 以来の「デプロイ成果物に dev 経路が物理的に存在しない」保証（AC-2 の grep 検証）を壊すため不採用。
- wrangler dev の multi-worker 構成は ADR-001 で不採用済み（設定重複・運用複雑性）。
- `build:local` は検証時に明示的に選ぶビルドであり、デプロイスクリプト（`deploy:*` は全て素の `vite build`）には影響しない。DCE grep（AC-2）は引き続き素の `pnpm build` 成果物に対して実施し、`build:local` 成果物に経路が残るのは仕様（実機確認: `dist/server/index.js` に `InlineRelayTrigger` / `inline-dev` が残存し、`dist/server/wrangler.json` も生成される）。
