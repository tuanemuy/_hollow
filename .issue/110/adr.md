# ADR — Issue #110: wrangler.toml [env.consumer] に R2 / LLM / RELAY bindings を配る

## ADR-001: R2 バケットを 2 種類に分割 (temp-files / objects)

### Status
Proposed

### Context
ingestion の一時ファイル (短命、TTL 短い) と export artifact / media (長期保存) はライフサイクルが異なる。1 バケットを prefix で論理分割する案 (例: `tanstack-start-template-r2` 内で `temp/`, `objects/` プレフィックス) もあったが、運用面で:

- R2 lifecycle policy (object expiration) はバケット単位
- API token (presign 用 access key) の scope もバケット単位
- 削除事故時の blast radius を分離したい

### Decision
Pulumi `cloudflare.R2Bucket` で `${prefix}-temp-files` と `${prefix}-objects` の 2 バケットを作成する。binding 名は `TEMP_FILES` / `OBJECT_STORAGE` (UPPER_SNAKE)、bucket 名は kebab-case (Cloudflare 規約)。`location` は指定せず Cloudflare auto に倒す (`@pulumi/cloudflare.R2Bucket` は location optional、default で auto 選択。GDPR 等で固定が必要なら別 Issue で対応)。

### Consequences
- 良い点:
  - 将来 temp-files に lifecycle policy (24h 自動削除) を設定可能
  - 削除事故が片方に閉じる
  - presign 用 API token の scope を `objects` バケットのみに絞れる (temp-files は data-plane binding のみで足りる)
- トレードオフ:
  - Pulumi コードが数行増える
  - bucket 名の同期面が 2 倍 (template / vars / DI で 2 箇所)
  - `location` 未指定 = Cloudflare 側のデフォルト地理配置に従う。法務的要件があれば再検討必要

---

## ADR-002: LLM 実 adapter 切替 — env override 経路のみ本 Issue で wire、DB 経由動的解決は別 Issue

### Status
Proposed

### Context
Issue 本文 LLM bullet には:
> - **LLM provider**: `llmProvider` / `ocrProvider` / `speechRecognitionProvider` / `officeExtractor` / `pdfExtractor`（実体 adapter への切替）

> - **ADMIN_LLM_API_KEY**: env override 用

とあり、env override 経路と DB 経由の admin 設定経路の両方が要件。現実の制約として:

1. `AnthropicLLMProvider` のみ実 adapter 存在、他 4 種 (OCR / Office / PDF / Speech) は Stub のみ (ADR-003 で別途扱う)
2. `createRequestContainer` は現在 `llmProvider: new StubLLMProvider()` をハードコードしており、env override も DB 経由も wire されていない

選択肢:
1. 本 Issue で env override + DB 経由動的解決の両方を wire (大規模変更)
2. 本 Issue で env override のみ wire、DB 経由動的解決は別 Issue
3. 本 Issue では secret 配布までに留め、wire は全て別 Issue

### Decision
選択肢 2 を採用。本 Issue では:

- `createRequestContainer` の `llmProvider` を `adminLlmApiKey && adminLlmModel ? new AnthropicLLMProvider({apiKey, model}) : new StubLLMProvider()` の三項分岐に変更 (既存 `secretBox` パターンに完全準拠)
- `ADMIN_LLM_MODEL` env を `wrangler.toml [vars]` で配布 (公開情報、secret 化しない)
- `ADMIN_LLM_API_KEY` は SOPS secret で配布

別 Issue で扱うべきこと:
- DB 経由動的解決層 (`LLMConfigResolver` 等の per-request 解決機構)
- env override と DB 保存値の優先順位ルール
- per-call 内での `SecretBox.decrypt` のキャッシュ戦略
- `AnthropicLLMProvider` の `model` 名解決方法 (admin 設定 vs env)

### Consequences
- 良い点:
  - Issue 本文「`ADMIN_LLM_API_KEY`: env override 用」bullet に直接対応
  - env override の wire は既存 `secretBox` 三項分岐パターンと完全に同型で実装コスト極小
  - 動的解決層の設計を急がず別 Issue でじっくり議論できる
  - 本 Issue merge 直後から env override 経路で `AnthropicLLMProvider` が動く (secret を配って終わりではない)
- トレードオフ:
  - admin が DB に保存した暗号化 LLM 設定は引き続き `runIngestionJob` から解決されない (フォロー Issue で対応)
  - フォロー Issue を別途起票する必要 (Phase 4 で対応)

---

## ADR-003: OCR / Office / PDF / SpeechRecognition の実 adapter 実装は本 Issue から除外

### Status
Proposed

### Context
Issue 本文 LLM bullet に列挙されているが、`app/core/adapters/llm/` には:
- `llmProvider.ts`: `AnthropicLLMProvider` (実) + `StubLLMProvider`
- `ocrProvider.ts`: `StubOCRProvider` のみ
- `officeExtractor.ts`: `StubOfficeExtractor` のみ
- `pdfExtractor.ts`: `StubPDFExtractor` のみ
- `speechRecognitionProvider.ts`: `StubSpeechRecognitionProvider` のみ

これら 4 種は MVP 未対応で実体 adapter が存在しない。binding を配っても wire 対象が無い。

### Decision
本 Issue では:
- 上記 4 種は Stub のままにし、コード変更なし
- ADR で「実 adapter 不在のため別 Issue で実装後に wire」と明記
- Phase 4 で別 Issue 起票候補として整理

### Consequences
- 良い点: 不可能なことを Issue scope から外し、現実的な完了基準を持つ
- トレードオフ: Issue 本文の文字通りの記載と差が出る → plan.md / ADR で scope を明示

---

## ADR-004: `createConsumerContainer` のシグネチャに `ctx?` を追加

### Status
Proposed

### Context
`createConsumerContainer(env)` は内部で `createRequestContainer(readRequestServerConfig(env))` を呼ぶ。`createRequestContainer` 内の `relayTrigger` 三項分岐は:

```ts
relay && waitUntil ? new ServiceBindingRelayTrigger(relay, waitUntil, logger) : NoopRelayTrigger
```

`readRequestServerConfig(env)` の 2nd 引数 (`ctx?`) が省略されると `waitUntil` が undefined になり、`RELAY` を `[env.consumer]` に bind しても `NoopRelayTrigger` に倒れる構造的問題がある (#57 ADR-002 で既知制約として記載済み)。

選択肢:
1. `createConsumerContainer(env)` のままで `relayTrigger` を後から差し替える
2. `createConsumerContainer(env, ctx?)` にシグネチャ拡張し `readRequestServerConfig(env, ctx)` に bridge
3. `RELAY` を bind しない (relay cron tick の 5 分待ちを受け入れる)

### Decision
選択肢 2 を採用。`createConsumerContainer(env, ctx?: { waitUntil(p: Promise<unknown>): void }): ConsumerContainer` に拡張。`handleQueue(batch, env, ctx)` が受け取る `ExecutionContext` を bridge する。

非対称性 (request 経路は `readRequestServerConfig(env, ctx)` 経由、consumer 経路は `createConsumerContainer(env, ctx)` 経由) は意図的:
- request 経路は server-function entry point で `ctx` を取り回し済 (既存)
- consumer 経路は handler の glue 層で `ctx` を bridge する必要 (本 Issue で追加)

### Consequences
- 良い点:
  - `runIngestionJob` / `runExportJob` の UoW commit で生成された二次イベント (`ingestion.previewAttached` 等) が relay cron tick (5 分) を待たずに即時 publish される
  - 既存の `createRequestContainer` の `relayTrigger` 分岐ロジックを再利用 (一貫性)
  - 既存テスト (`createConsumerContainer(env)` の `ctx` 省略呼び出し) は optional のため壊れない
  - **即時 publish は best-effort**: queue handler の ack 後に `ctx.waitUntil` の subrequest が cancel されるリスクは理論上あるが、relay safety-net cron (5 分間隔) が補償する (#57 PR と同じ safety-net 構造)
- トレードオフ:
  - シグネチャが optional パラメータで 1 つ増える
  - `ctx.waitUntil` で投げられた `RELAY.fetch` の subrequest billing が追加発生 (一発の fetch なので低コスト)

---

## ADR-005: R2 access key (presign 用) は手動発行 + SOPS secret、stage ごとに別 key

### Status
Proposed

### Context
`R2ObjectStorage` の `R2PresignConfig` には `accessKeyId` / `secretAccessKey` / `accountId` が必要 (S3-compatible SigV4)。これらの調達方法:

選択肢:
1. Pulumi `R2BucketAccessKey` 相当のリソースで完全自動化 (provider のサポート状況要確認)
2. Cloudflare dashboard で手動発行し SOPS-encrypted secret に格納
3. Worker binding (data-plane only) のみ使い presign 不要に縮退 (export download flow 自体を変える)

### Decision
選択肢 2 を採用。本 Issue では Cloudflare dashboard の「Manage R2 API Tokens」で `objects` バケットへの read/write 権限を絞った token を**stage ごとに別発行**し、`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID` として SOPS secret に格納する。

加えて `SECRET_BOX_MASTER_KEY` も**stage ごとに別キー**を生成 (`openssl rand -base64 32`)。staging と production で同一キーだと暗号化 DB row が両環境共通になる。

### Consequences
- 良い点:
  - Pulumi `R2BucketAccessKey` の provider 安定性確認や schema 移行リスクを回避
  - 既存 secret パイプライン (SOPS + `wrangler secret bulk`) に乗る
  - access key rotate は手動操作だが頻度低い (年 1 回程度)
  - stage 間の blast radius 分離 (R2 / SecretBox 両方)
- トレードオフ:
  - 完全自動化されず stage 新規追加時に dashboard 手作業が必要
  - `infra/secrets/*.json.example` のコメントに発行手順と「他 stage と共用しない」運用ガイドラインを書き残す必要

---

## ADR-006: R2 bucket 名は `[vars]` で配り、template では `${R2_OBJECTS_BUCKET}` を SSOT とする

### Status
Proposed

### Context
`R2PresignConfig.bucketName` は SigV4 presigned URL のパス展開に使われるため、`R2ObjectStorage` 構築時に実 bucket 名が必要。binding 名 (`OBJECT_STORAGE`) ではなく実 bucket 名 (`tanstack-start-template-objects` 等) が要る。

選択肢:
1. secret として SOPS に格納
2. wrangler `[vars]` に書く (公開情報扱い)
3. binding 名から推測 (`OBJECT_STORAGE` → `tanstack-start-template-objects` の規約マッピング)

### Decision
選択肢 2 を採用。`R2_OBJECT_BUCKET_NAME` を `[vars]` および `[env.consumer.vars]` に置く。

template 内では:
- `[[r2_buckets]] bucket_name = "${R2_OBJECTS_BUCKET}"` (binding 側)
- `[vars] R2_OBJECT_BUCKET_NAME = "${R2_OBJECTS_BUCKET}"` (DI 側 env var)

両方が同じ Pulumi stack output `${R2_OBJECTS_BUCKET}` を参照することで single source of truth (SSOT) を保つ。typo / 名前ズレが発生しない。

### Consequences
- 良い点:
  - bucket 名は機密ではない (S3 endpoint URL は presigned で配信される時点で露出する)
  - secret 表面積最小化
  - Pulumi render 時に stack output から流し込めるため typo リスク低い
  - binding side と DI side で同じ placeholder を共有 = ズレ不可能
- トレードオフ:
  - wrangler-configuration.d.ts などの auto-gen ファイルに bucket 名がリテラルで出るが、URL の構成要素なので問題なし

---

## ADR-007: `workerSecretSpecs` は spec 化のみ、per-worker filter の CI 実装は別 Issue

### Status
Proposed

### Context
現 CI deploy step は `sops -d ... | wrangler secret bulk` を 5 worker 全てに同一 file で push する (`workerSecretSpecs` は documentation のみで実行時 enforce されていない)。

`SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY` / R2 credentials を consumer に追加 = 同じ secret が web / relay / pruner / dlq にも push される。

選択肢:
1. 本 Issue で CI を改修し per-worker filter を実装
2. 本 Issue では `workerSecretSpecs` の spec 化のみ、enforcement は別 Issue

### Decision
選択肢 2 を採用。本 Issue では:
- `workerSecretSpecs` を documentation 契約として更新 (どの worker がどの secret を必要とするか明示)
- CI の per-worker filter 実装は別 Issue

### Consequences
- 良い点:
  - 本 Issue のスコープが「binding を配る」に絞られる
  - 後続 Issue で `workerSecretSpecs` 駆動の per-worker push を実装すれば自動的に最小化される (spec が先にある)
- トレードオフ:
  - 一時的に relay / pruner / dlq に不要な secret が push される (運用面では監査ログに余分なキーが残る程度の影響)
  - secret 漏洩面の minimal-privilege 原則からは外れる (relay / pruner / dlq には API key 等が不要)

---

## ADR-008: 統合テストで `Cloudflare.Env.TEMP_FILES` を narrow するための local helper

### Status
Proposed

### Context
`vitest.config.integration.ts` が `miniflare.r2Buckets: ["TEMP_FILES", "OBJECT_STORAGE"]` を設定するので、テスト実行時に `env.TEMP_FILES` は必ず存在する。しかし `wrangler types` が生成する `Cloudflare.Env` は top-level `[[r2_buckets]]` を `TEMP_FILES?: R2Bucket` (optional) として書き出すため、`env.TEMP_FILES.put(...)` は TypeScript で `'env.TEMP_FILES' is possibly undefined` エラーになる。

加えて `@cloudflare/workers-types` (npm) の `R2Bucket` 型と worker-configuration.d.ts (workerd ambient types) の `R2Bucket` 型は微妙にズレており (`R2Object.writeHttpMetadata(headers: Headers)` の `Headers` 由来が異なる)、`@cloudflare/workers-types` から import した `R2Bucket` を `env.TEMP_FILES` に代入すると `exactOptionalPropertyTypes: true` 下で型エラーになる。

選択肢:
1. `env.TEMP_FILES!` で各呼び出し箇所に non-null assertion (Biome の `noNonNullAssertion` で warn)
2. `env.TEMP_FILES?.put(...)` で optional chain (`put` の戻り値が `undefined` になり、`await` の意味が曖昧)
3. テスト内で一度だけ narrow するヘルパー関数を定義する

### Decision
選択肢 3 を採用。`handlers.integration.test.ts` の上部に `tempFilesBinding(): NonNullable<typeof env.TEMP_FILES>` を定義し、未設定時は明示的に throw する。返り値型は npm types から import せず、ambient `Cloudflare.Env.TEMP_FILES` から `NonNullable` で抽出する。

### Consequences
- 良い点:
  - call site が `tempFilesBinding().put(...)` で簡潔
  - 仮にビルド設定変更で `TEMP_FILES` が miniflare から消えると即座に明示的なエラーメッセージで気付ける
  - 二つの `R2Bucket` 型衝突を完全に回避 (npm types を import しない)
- トレードオフ:
  - 補助関数を 1 つ追加するコスト
  - `NonNullable<typeof env.TEMP_FILES>` は workerd の R2Bucket 型に依存するため、wrangler types を再生成するタイミングで型が変わる可能性 (実害は小さい — 仕様変更は workerd の API 仕様変更を意味する)
