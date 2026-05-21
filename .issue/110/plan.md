# 実装計画 — Issue #110: wrangler.toml [env.consumer] に R2 / LLM / RELAY bindings を配る

**Issue:** #110
**作成日:** 2026-05-21
**複雑度:** 中〜大規模

---

## 目的

Issue #57 (PR #108) で queue consumer から `runIngestionJob` / `runExportJob` を dispatch する配線を入れたが、現状 `[env.consumer]` には D1 binding しか無く、本番では R2 / LLM / RELAY 経路が Stub / Noop に縮退する。本 Issue では:

1. consumer worker が本番相当の adapter (`R2TempFileStorage` / `R2ObjectStorage` / `WebCryptoSecretBox` / `AnthropicLLMProvider` / `ServiceBindingRelayTrigger`) を経由して dispatch を実行できる状態にする
2. Pulumi 側に R2 バケット 2 種を新設し、staging/production テンプレートと local dev wrangler.toml を同期させる
3. 必要な secret (`SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY` / `R2_*`) の配布パイプライン (`workerSecretSpecs` / `.dev.vars.example` / `secrets/*.json.example`) を整備する

## スコープ

### 含まれるもの

- Pulumi: R2 バケット 2 種 (`temp-files`, `objects`) のリソース宣言
- `wrangler.toml` (local), `infra/templates/wrangler.staging.toml.tmpl`, `infra/templates/wrangler.production.toml.tmpl` の以下を変更:
  - top-level (`[env.web]` 相当) と `[env.consumer]` に R2 binding 2 種 (`TEMP_FILES`, `OBJECT_STORAGE`) を追加
  - `[env.consumer]` に RELAY Service Binding を追加
  - `[vars]` および `[env.consumer.vars]` に `R2_OBJECT_BUCKET_NAME` と `ADMIN_LLM_MODEL` (公開情報) を追加
- `infra/scripts/renderWrangler.ts` の StackOutput / vars マッピング更新
- `infra/src/secrets.ts` の `workerSecretSpecs` を web/consumer に対し以下 secret 追加:
  - `SECRET_BOX_MASTER_KEY` (base64 32 bytes)
  - `ADMIN_LLM_API_KEY` (Anthropic API key、env override 用)
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (presign 用 SigV4 credentials)
- `infra/secrets/{staging,production}.json.example` を新 key のプレースホルダで更新
- `.dev.vars.example` を新 key のプレースホルダで更新
- DI (`app/core/application/di/serverCloudflare.ts`) に以下:
  - `ServerEnv` 型に R2 binding (optional)、R2 credentials env vars (optional)、`ADMIN_LLM_MODEL` (optional) を追加
  - `RequestServerConfig` に対応する optional フィールド追加 (`tempFilesBucket?`, `objectStorageBucket?`, `r2PresignConfig?`, `adminLlmModel?`)
  - `readRequestServerConfig` で新 binding を既存 truthy 三項分岐パターンで spread
  - `createRequestContainer` で以下を三項分岐 (既存 `secretBox` パターンに完全準拠):
    - `tempFileStorage`: `R2TempFileStorage` / `StubTempFileStorage`
    - `objectStorage`: `R2ObjectStorage` / `StubObjectStorage` (bucket + presign credentials 全揃いが条件)
    - `llmProvider`: `AnthropicLLMProvider` / `StubLLMProvider` (`adminLlmApiKey && adminLlmModel` 揃いが条件)
  - `createConsumerContainer(env, ctx?)` のシグネチャに `ctx?` を追加し、`readRequestServerConfig(env, ctx)` 経由で `waitUntil` を bridge → `ServiceBindingRelayTrigger` 有効化
- `app/worker/cloudflare/handlers.ts` で `_ctx` を `ctx` にし `createConsumerContainer(env, ctx)` に渡す
- 統合テスト (`app/worker/cloudflare/__tests__/handlers.integration.test.ts`) で:
  - miniflare の `r2Buckets` を使い実 R2 binding 経由の dispatch を smoke (1 ケース)
  - 既存 `vi.spyOn(StubTempFileStorage.prototype, "get")` workaround を削除 (#57 ADR-006 の予告通り)
- DI unit テスト (`app/core/application/di/__tests__/serverCloudflare.test.ts`) で env→adapter マッピング (binding 有 / 無、`instanceof` で判定) を網羅
- `vitest.config.integration.ts` に `r2Buckets: ["TEMP_FILES", "OBJECT_STORAGE"]` と R2 credentials test 値を追加
- `docs/runtime_cloudflare.md` の Secrets/Worker matrix 章を補強

### 含まれないもの

- **LLM provider の DB 経由動的解決層 (`InstanceSettings.llm` から SecretBox.decrypt 経路)**: 本 Issue では env override (`ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL`) のみを wire する。admin が DB に保存した暗号化キーから動的に provider を構築する `LLMConfigResolver` 層は別 Issue (env と DB の優先順位ルール、per-call resolution、キャッシュ戦略を別途設計するため)
- **OCR / Office / PDF / SpeechRecognition の実 adapter 実装**: 実体ファイルが存在しない (Stub のみ)。MVP 未対応 (ADR-003 参照)
- **per-worker 単位での `wrangler secret bulk` push の filter**: 現 CI は全 worker に同一 secret file を push (`workerSecretSpecs` は spec 化のみ)。secret 表面積最小化は別 Issue で
- **wrangler.toml / secrets.ts / .dev.vars.example の同期 enforcement 自動化** (CI スクリプト等)
- **web (request path) 側の export download presign の動作確認**: 本 Issue は consumer 経路の dispatch 検証を主眼。web 側は同じ DI 経路で同じ adapter が wire されるため副作用として動くが、明示検証は別 Issue で

## 実装ステップ

### 1. Pulumi: R2 バケットリソース新設

- **対象ファイル:**
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/src/r2.ts` (新規)
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/src/config.ts`
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/src/index.ts`
- **変更内容:**
  - `config.ts` `resourceNames` に `tempFilesBucket: ${prefix}-temp-files` / `objectsBucket: ${prefix}-objects` を追加
  - `r2.ts` 新規: `createR2Buckets(cfg): { tempFiles, objects }` を `cloudflare.R2Bucket` で 2 個作成。`location` は指定せず Cloudflare auto に倒す (ADR-001 参照)
  - `index.ts` で `createR2Buckets(cfg)` を呼び、stack output に `tempFilesBucketName` / `objectsBucketName` を追加
- **理由:** 本番 R2 バケットは Pulumi 宣言的管理 (既存 D1 / Queue と同じパターン)。bucket 名は worker 起動時にバインドされるが、SigV4 presign URL 生成のため adapter 内で実バケット名も保持する必要があり、render 時に env vars 経由で配る

### 2. renderWrangler.ts に新規 stack output と placeholder を追加

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/infra/scripts/renderWrangler.ts`
- **変更内容:**
  - `StackOutput` 型に `tempFilesBucketName: string` / `objectsBucketName: string` を追加
  - `vars` map に `R2_TEMP_FILES_BUCKET` / `R2_OBJECTS_BUCKET` を追加
- **理由:** template 側で `${R2_TEMP_FILES_BUCKET}` 等を参照できるようにする。未知変数があれば render 時に throw (既存挙動) で同期漏れ検出

### 3. wrangler.toml templates + local に R2 / RELAY binding 追加

- **対象ファイル:**
  - `/Users/hikaru/github.com/tuanemuy/hollow/wrangler.toml`
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/templates/wrangler.staging.toml.tmpl`
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/templates/wrangler.production.toml.tmpl`

#### 3a. top-level (web worker) に追加

local (`wrangler.toml`) の場合:

```toml
[vars]
APP_URL = "http://localhost:8787"
R2_OBJECT_BUCKET_NAME = "tanstack-start-template-objects"
ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"

[[r2_buckets]]
binding = "TEMP_FILES"
bucket_name = "tanstack-start-template-temp-files"

[[r2_buckets]]
binding = "OBJECT_STORAGE"
bucket_name = "tanstack-start-template-objects"
```

template (`wrangler.{staging,production}.toml.tmpl`) の場合:

```toml
[vars]
APP_URL = "${APP_URL}"
R2_OBJECT_BUCKET_NAME = "${R2_OBJECTS_BUCKET}"
ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"

[[r2_buckets]]
binding = "TEMP_FILES"
bucket_name = "${R2_TEMP_FILES_BUCKET}"

[[r2_buckets]]
binding = "OBJECT_STORAGE"
bucket_name = "${R2_OBJECTS_BUCKET}"
```

#### 3b. `[env.consumer]` block に同型追加 (wrangler 非継承のため重複宣言)

local の場合:

```toml
[env.consumer.vars]
APP_URL = "http://localhost:8787"
R2_OBJECT_BUCKET_NAME = "tanstack-start-template-objects"
ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"

[[env.consumer.r2_buckets]]
binding = "TEMP_FILES"
bucket_name = "tanstack-start-template-temp-files"

[[env.consumer.r2_buckets]]
binding = "OBJECT_STORAGE"
bucket_name = "tanstack-start-template-objects"

[[env.consumer.services]]
binding = "RELAY"
service = "tanstack-start-template-relay"
```

template の場合 (`${...}` プレースホルダで同型)。既存 comment (env 非継承の注意書き) に R2 binding / RELAY service binding / `R2_OBJECT_BUCKET_NAME` / `ADMIN_LLM_MODEL` の重複宣言が同様に必要であることを追記。

- **理由:** AC「`[env.consumer]` に必要な binding を追加 (main / staging / production の各設定ファイル)」を満たす。wrangler の env 非継承挙動 (CLAUDE.md 規約) に従い重複宣言。`R2_OBJECT_BUCKET_NAME` は SigV4 presign のパス展開で実 bucket 名が必要 (ADR-006)。`ADMIN_LLM_MODEL` は公開情報なので vars 扱い (ADR-002)

### 4. infra/src/secrets.ts に新規 secret を追加

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/infra/src/secrets.ts`
- **変更内容:**
  - 新規 `dispatchExtras` 配列 (定数) を定義し以下:
    - `SECRET_BOX_MASTER_KEY`
    - `ADMIN_LLM_API_KEY`
    - `R2_ACCOUNT_ID`
    - `R2_ACCESS_KEY_ID`
    - `R2_SECRET_ACCESS_KEY`
  - `web` と `consumer` の secret list を `[...shared, ...dispatchExtras]` で構成
  - relay / pruner / dlq には追加しない (これらは dispatch しないため不要)
  - JSDoc に「consumer が DB に保存された暗号化 LLM api key を復号するために `SECRET_BOX_MASTER_KEY` を必要とする」「`ADMIN_LLM_API_KEY` は env override 用」「`R2_*` は `R2ObjectStorage` の presign URL 生成 (SigV4) に使用」を明記
- **理由:** AC「`workerSecretSpecs` に consumer 用の secret を追加」を満たす。`workerSecretSpecs` は現状 spec 化のみで実 enforce されない (ADR-007) ため、本変更は documentation 契約として残す

### 5. infra/secrets/{staging,production}.json.example を更新

- **対象ファイル:**
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/secrets/staging.json.example`
  - `/Users/hikaru/github.com/tuanemuy/hollow/infra/secrets/production.json.example`
- **変更内容:** 新規 5 key のプレースホルダ + コメント:
  - `SECRET_BOX_MASTER_KEY`: 生成手順 `openssl rand -base64 32` を明記。**stage ごとに別キーを発行すること** (staging と production で共用しないこと、共用すると暗号化 row が両環境共通になる、ADR-005)
  - `ADMIN_LLM_API_KEY`: Anthropic API key (`sk-ant-...`)
  - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`: Cloudflare dashboard 「Manage R2 API Tokens」で `objects` バケットへの read/write 権限を絞った token を**stage ごとに別発行**して取得 (ADR-005)
- **理由:** ops 担当が SOPS 暗号化 (`sops -e -i ...`) 前のキー集合を把握できるようにする。本 PR で実 enc.json は更新できない (ops 手作業)

### 6. .dev.vars.example を更新

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/.dev.vars.example`
- **変更内容:** 新規 5 key + コメント:
  - `SECRET_BOX_MASTER_KEY=""` (生成手順 `openssl rand -base64 32`)
  - `ADMIN_LLM_API_KEY=""` (Anthropic key。`ADMIN_LLM_MODEL` (vars 側) と両方揃ったときのみ `AnthropicLLMProvider` が wire される。空のままなら `StubLLMProvider` 維持)
  - `R2_ACCOUNT_ID=""` / `R2_ACCESS_KEY_ID=""` / `R2_SECRET_ACCESS_KEY=""` (R2 dashboard 「S3 API Tokens」で発行。ローカル開発用は read-only 権限のキーを別途発行することを推奨。未設定で `StubObjectStorage` 維持)
- **理由:** AC「`.dev.vars.example` を更新」を満たす。bucket 名と `ADMIN_LLM_MODEL` は `wrangler.toml [vars]` で配るため `.dev.vars` 側には含めない

### 7. DI: ServerEnv 拡張 + adapter 切替分岐 (LLM 含む)

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `ServerEnv` に追加 (全 optional):
    ```ts
    TEMP_FILES?: R2Bucket;
    OBJECT_STORAGE?: R2Bucket;
    R2_ACCOUNT_ID?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    R2_OBJECT_BUCKET_NAME?: string;
    ADMIN_LLM_MODEL?: string;
    ```
  - `RequestServerConfig` に対応する optional フィールド:
    ```ts
    tempFilesBucket?: R2Bucket;
    objectStorageBucket?: R2Bucket;
    r2PresignConfig?: R2PresignConfig;
    adminLlmModel?: string;
    ```
  - `readRequestServerConfig` で既存の truthy 三項パターン (`env.X ? { x: env.X } : {}`) を踏襲して spread:
    - `env.TEMP_FILES` truthy のみで `tempFilesBucket` を spread
    - `env.OBJECT_STORAGE && env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_OBJECT_BUCKET_NAME` 全 truthy のとき `objectStorageBucket` + `r2PresignConfig` を spread
    - `env.ADMIN_LLM_MODEL` truthy のときのみ `adminLlmModel` を spread (既存の `env.ADMIN_LLM_API_KEY ? ...` と同パターン)
    - 空文字は既存 truthy 判定で自然に除外される (`""` は falsy)。trim 等の追加正規化は不要
  - `createRequestContainer` で以下の三項分岐 (既存 `secretBox` パターンに完全準拠):
    - `tempFileStorage`: `tempFilesBucket ? new R2TempFileStorage(tempFilesBucket) : new StubTempFileStorage()`
    - `objectStorage`: `objectStorageBucket && r2PresignConfig ? new R2ObjectStorage(objectStorageBucket, r2PresignConfig) : new StubObjectStorage()`
    - `llmProvider`: `adminLlmApiKey && adminLlmModel ? new AnthropicLLMProvider({ apiKey: adminLlmApiKey, model: adminLlmModel }) : new StubLLMProvider()`
  - `createConsumerContainer(env, ctx?: { waitUntil(p: Promise<unknown>): void }): ConsumerContainer` にシグネチャ拡張
  - 内部: `createRequestContainer(readRequestServerConfig(env, ctx))` で `ctx` を bridge
  - JSDoc:
    - `createConsumerContainer` の RELAY 既知制約 (#57 ADR-002) を「**Issue #110 で解消**: `RELAY` を `[env.consumer]` に bind し、`handleQueue` から `ExecutionContext` が渡されると `ServiceBindingRelayTrigger` が選ばれる。即時 publish は best-effort で、queue handler の ack 後に subrequest が cancel されても relay cron (5 分) が補償する (safety-net 構造)」に更新
    - `createConsumerContainer` JSDoc に「`ctx` を受け取るのは consumer 経路だけで、request 経路は server-function entry が `readRequestServerConfig(env, ctx)` を呼んで `createRequestContainer(config)` に渡す」非対称の理由を明記
    - LLM 動的解決層 (DB 経由) は別 Issue (env override のみ wire 済) を明記
    - OCR / Office / PDF / Speech は本 Issue では Stub 据え置きを明記 (ADR-003)
- **理由:** 既存 `secretBox` の三項分岐パターン (`secretBoxMasterKey ? new WebCryptoSecretBox : new NullSecretBox`) を踏襲。ServiceBindingRelayTrigger は `relay && waitUntil` 両方必要なため、Queue handler の ExecutionContext を bridge する必要がある。`AnthropicLLMProvider` の env override 経路を本 Issue で wire することで Issue 本文「実体 adapter への切替」「`ADMIN_LLM_API_KEY`: env override 用」両 bullet に直接対応

### 8. handlers.ts: ctx を createConsumerContainer に渡す

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/app/worker/cloudflare/handlers.ts`
- **変更内容:**
  - `handleQueue(batch, env, _ctx)` の `_ctx` underscore を外して `ctx` にリネーム
  - `const container = createConsumerContainer(env, ctx);` に変更
- **理由:** ステップ 7 と対。`ctx.waitUntil` を `ServiceBindingRelayTrigger` の kick 経由で `RELAY.fetch` の生存期間延長に使う

### 9. vitest.config.integration.ts に R2 binding 追加

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/vitest.config.integration.ts`
- **変更内容:** miniflare config に追加:
  ```ts
  r2Buckets: ["TEMP_FILES", "OBJECT_STORAGE"],
  bindings: {
    // ...existing...
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-key-id",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_OBJECT_BUCKET_NAME: "test-objects",
    // ADMIN_LLM_* は意図的に未設定 → AnthropicLLMProvider への切替は単体テストで instanceof 検証
  },
  ```
- **理由:** 統合テストが real R2 binding 経由で `R2TempFileStorage` / `R2ObjectStorage` を駆動できるようにする。`AnthropicLLMProvider` への切替は単体テストで instanceof 確認するため、統合テストで env を入れて実 Anthropic API に当たらないようにする

### 10. handlers.integration.test.ts: 実 R2 経由 dispatch を smoke

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/app/worker/cloudflare/__tests__/handlers.integration.test.ts`
- **変更内容:**
  - 新規 1 ケース追加「実 R2 binding 経由で ingestion dispatch が動く」:
    - `env.TEMP_FILES.put(tempStorageKey, fixtureBytes)` で R2 に seed
    - `ingestion.created` event を投げて `handleQueue` 実行
    - **期待挙動:** `tempFileStorage.get` が R2 bytes を返した後、後段の `StubLLMProvider` (テスト env では `ADMIN_LLM_MODEL` 未設定で Stub に倒れる) が `BusinessRuleError("unsupported_format")` 等を投げ、`runIngestionJob` の `markFailedSafely` で `failed` に畳まれる
    - **assertion:** job が `pending` から遷移していること (= R2 bytes 取得経路が動いた間接証拠)、`vi.spyOn(StubTempFileStorage.prototype, "get")` 等の Stub spy が呼ばれていない (= 実 R2 経路が走った直接証拠)
  - 既存「does NOT stamp when runIngestionJob throws LLMRateLimitError」テストの `vi.spyOn(StubTempFileStorage.prototype, "get")` workaround を、`env.TEMP_FILES.put(...)` で R2 に bytes を入れる形に書き換える (#57 ADR-006 の予告に基づく)
  - **責任分担:** DI の `instanceof` 確認 (binding 有 → 実 adapter / 無 → Stub) はステップ 11 の単体テストに寄せる。本ステップは「実 R2 binding 経由で fetch まで通る」smoke のみに絞る (miniflare 起動コスト最小化)
- **理由:** AC「統合テスト / smoke test で実 adapter 経由の dispatch が動くことを確認」を満たす

### 11. serverCloudflare.test.ts: env→adapter マッピングを網羅 (instanceof)

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/app/core/application/di/__tests__/serverCloudflare.test.ts`
- **変更内容:**
  - 「`TEMP_FILES` binding 有 → `tempFileStorage instanceof R2TempFileStorage` / 欠 → `StubTempFileStorage`」
  - 「`OBJECT_STORAGE` + R2 credentials (5 個) 全部揃い → `R2ObjectStorage` / どれか欠 → `StubObjectStorage`」(欠ける case は credentials のうち 1 個欠ける partial 例で代表)
  - 「`ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL` 揃い → `AnthropicLLMProvider` / どちらか欠 → `StubLLMProvider`」
  - 「`createConsumerContainer(env)` が `RequestContainer` 全フィールド + `outboxRepository` / `idempotencyStore` / `indexJobRepository` を返す」
  - 「`createConsumerContainer(env, ctx)` で `ctx.waitUntil` 経由の `relayTrigger` が `ServiceBindingRelayTrigger` (RELAY あり) / `NoopRelayTrigger` (RELAY 無 or ctx 無)」
- **理由:** binding 切替の regression guard。binding 名タイポや三項分岐の壊れを即検出。`instanceof` 確認はここに集約し、統合テスト (ステップ 10) は「実 binding 経由で経路が動く」smoke のみ担う

### 12. docs/runtime_cloudflare.md を補強

- **対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow/docs/runtime_cloudflare.md`
- **変更内容:**
  - 「One-time Cloudflare resource creation」に `wrangler r2 bucket create ...` 手順を追記 (Pulumi 経由なら不要だが、stage 新規追加時の手順として)
  - 「Secrets and vars」章に新規 5 key の説明を追加。`ADMIN_LLM_API_KEY` には「**LLM adapter wire 条件: `ADMIN_LLM_MODEL` (vars) と本キー両方揃ったとき `AnthropicLLMProvider` が wire される。本 Issue 後の段階では env override のみで DB 経由動的解決は未実装 (別 Issue)**」を明記
  - 「Worker matrix」の consumer 行に `RELAY` Service Binding と R2 bindings、新 secret を追記
  - 「Local dev」セクションに「`.dev.vars` で R2 credentials を空のままにすれば `StubObjectStorage` / `StubLLMProvider` に倒れる。miniflare の R2 simulator が provision するので `TEMP_FILES` binding 自体は空 bucket として常時存在する」を明記
  - 「Deployment 前に SOPS enc.json を更新」note を追加 (PR では .json.example のみ更新、実 enc.json は ops 担当の手作業)
- **理由:** runtime 手順書としての正確性

## 設計判断

詳細は `.issue/110/adr.md` を参照。

- **ADR-001:** Pulumi 側に R2 バケット 2 種を新設 (temp-files / objects の分離)、`location` は Cloudflare auto
- **ADR-002:** LLM 実 adapter 切替 (StubLLMProvider → AnthropicLLMProvider) は本 Issue で **env override 経路のみ wire**。DB 経由動的解決層は別 Issue
- **ADR-003:** OCR / Office / PDF / SpeechRecognition の実 adapter 実装は本 Issue から除外 (実体不在)
- **ADR-004:** `createConsumerContainer` のシグネチャに `ctx?` を追加 (RELAY ServiceBinding 有効化のため)。ack 後 cancel は relay cron が補償する safety-net 構造
- **ADR-005:** R2 access key (presign 用) は Cloudflare dashboard で手動発行し SOPS-encrypted secret に格納 (Pulumi `R2BucketAccessKey` 自動化は別 Issue)。stage ごとに別 token / 別 master key を強制
- **ADR-006:** R2 binding を `TEMP_FILES` / `OBJECT_STORAGE` に命名し、bucket 名 (`R2_OBJECT_BUCKET_NAME`) は公開情報として `[vars]` に置く。template では `${R2_OBJECTS_BUCKET}` を single source of truth とする (binding bucket_name と vars 側 `R2_OBJECT_BUCKET_NAME` 両方に同じ placeholder を埋める)
- **ADR-007:** `secret_bulk` の per-worker filter は現状 CI 未対応のため、`workerSecretSpecs` は spec 化のみに留める

## リスクと注意点

- **既存統合テストの挙動変化:** `handleQueue → runIngestionJob → tempFileStorage.get` が Stub なら即 `TempFileStorageUnavailableError → failed`、R2 binding 有効後は空バケットなら `TempFileNotFoundError → failed`。エラーコード分類が変わるため、テスト assertion を seed 前提に書き換える
- **`R2PresignConfig` の credentials secret 漏洩リスク:** SOPS encryption 必須。`.dev.vars` 用は Cloudflare で読み取り専用キーを別途発行することを `.dev.vars.example` コメントで推奨
- **Pulumi `R2Bucket` apply は実 bucket provisioning を伴う:** staging で先に検証 → production の順で apply。release notes に明記
- **wrangler env 非継承の罠:** top-level に R2 bindings を入れても `[env.consumer]` には伝播しない。両方に重複宣言が必要 (CLAUDE.md 規約と整合)
- **stage ごとに `SECRET_BOX_MASTER_KEY` を別キーに:** staging と production で同一キーだと DB 暗号化 row が両環境共通になる。secrets/*.json.example のコメントに明記
- **本 Issue 後も LLM の DB 経由動的設定は機能しない:** admin UI で保存した暗号化 LLM 設定は本 Issue merge 後も `runIngestionJob` から解決されない (env override のみ wire)。Phase 4 で別 Issue 起票
- **OCR / Office / PDF / Speech は本 Issue 後も Stub のまま:** `runIngestionJob` の対応形式は LLMProvider 単独が扱う `html` / `markdown` などに限られ、`pdf` / `audio` / `office` は引き続き未対応。Phase 4 で別 Issue 起票
- **既知の `LLMRateLimitError → processing 状態固定化` (#57 ADR-003):** 本 Issue で解消されない。引き続き admin 手動 retry 経路に依存
- **wrangler / secrets / .dev.vars の同期は手動:** enforcement 自動化は別 Issue。本 PR では 3 ファイル同時更新で人力同期
- **`workerSecretSpecs` は現 CI で実 enforce されない:** `wrangler secret bulk` は 5 worker 全てに同一 file を push する (ADR-007)。よって本 Issue で追加する 5 secret も relay / pruner / dlq に配送される。secret 表面積最小化は本 Issue scope 外で別 Issue
- **過去 ADR (#57 ADR-002) の Status 更新方針未定:** 本 PR では `serverCloudflare.ts` JSDoc 更新のみ。`.issue/57/adr.md` の Status を `Superseded by #110` に書き換えるかは project policy 次第 (未定)。レビューで議論

## テスト方針

- `pnpm typecheck` — `ServerEnv` / `RequestServerConfig` / `createConsumerContainer` シグネチャ拡張の型整合
- `pnpm test:unit app/core/application/di/__tests__/serverCloudflare.test.ts` — env → adapter マッピングの instanceof 網羅
- `pnpm test:integration app/worker/cloudflare/__tests__/handlers.integration.test.ts` — miniflare R2 binding 経由の dispatch smoke (1 ケース) + 既存 LLMRateLimitError テストの R2 ベース書き換え
- `pnpm lint:fix && pnpm format` — Biome 整形
- 手動 smoke (本 PR 後の deploy):
  - staging に SOPS 投入後 deploy → `wrangler tail --env consumer --config wrangler.staging.toml` で `[relay-trigger] service binding kick failed` ログが出ないこと、R2 経由ログを確認
  - admin 設定保存 → 保存済み api key 復号動作確認 (`SecretBox.decrypt` の通電確認)
  - `ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL` 投入後の ingestion で `AnthropicLLMProvider` 経由 (LLM 課金発生に注意) のスモーク

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | ○ (LLM env override wire) | ○ (全体構造) |
| 取り込んだ点 | ADR-006 fixture 履歴記述、Pulumi R2 リソース分離方針 | LLM env override wire (`AnthropicLLMProvider`)、`serverCloudflare.test.ts` の `instanceof` 網羅 | 全体構造、R2 2-bucket 分離、Pulumi resource 命名、`ctx` 引数追加方針 |

ベースは Agent 3 (シンプルさ) の構造に Agent 2 の LLM env override wire を統合。Agent 1 の「`R2ObjectStorage` を別 Issue にする」案は不採用 (3 つの secret を SOPS にまとめて配るだけで完遂可能、コストに見合う)。

## レビュー反映

### 修正した点

- **[Coverage P-001]** LLM env override 経由 `AnthropicLLMProvider` wire を本 Issue 内に取り込み:
  - ADR-002 を「env override 経路のみ wire / DB 経由動的解決は別 Issue」に修正
  - ステップ 7 の `createRequestContainer` 三項分岐に `llmProvider` を追加
  - ステップ 3 の `[vars]` / `[env.consumer.vars]` に `ADMIN_LLM_MODEL` を追加
  - ステップ 6 の `.dev.vars.example` コメント更新 (使用条件明記)
  - ステップ 11 のテストに `ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL` 揃い → `AnthropicLLMProvider` を追加
- **[Coverage P-002]** リスクに「`workerSecretSpecs` 未 enforce で全 worker に secret 配送」を明記
- **[Coverage S-001]** ステップ 12 に local dev R2 挙動明記 (空 credentials → Stub 縮退、miniflare R2 simulator 自動 provision)
- **[Coverage S-002]** ADR-005 と secrets/*.json.example コメントに「stage ごとに別 token / 別 master key」を明記
- **[Coverage S-003]** ステップ 10 のテスト assertion を「`pending` 遷移 + Stub spy 不呼出」に具体化
- **[Coverage S-004]** 「含まれないもの」の web 側 export download presign 検証は別 Issue を明記 (既存通り)
- **[Feasibility P-001]** ステップ 3 のコードブロックを 3a (top-level) / 3b (env.consumer) に整理。local と template の両方を併記
- **[Feasibility P-002]** ステップ 10 (integration smoke) と ステップ 11 (DI instanceof) の責任分担を明記
- **[Feasibility P-003]** ADR-004 に「ack 後 cancel は relay cron が補償する safety-net 構造」追記
- **[Feasibility S-001]** ADR-006 を「`${R2_OBJECTS_BUCKET}` を SSOT として template の binding と vars 両方に埋める」と明記
- **[Feasibility S-002]** ステップ 7 から trim 等の独自正規化記述を削除し「既存 truthy 三項パターンに揃える」に修正
- **[Feasibility S-003]** ステップ 7 の `createConsumerContainer` JSDoc に「`ctx` 受け取りは consumer 経路のみ、request 経路は server-function entry が呼ぶ」非対称理由を明記
- **[Feasibility S-005]** ステップ 1 / ADR-001 に「`location` は Cloudflare auto」を明記

### 取り込んだ改善提案

- **[Coverage S-001 / S-002 / S-003 / S-004]**: 上記の通り plan / ADR 内に反映
- **[Feasibility S-001]**: 取り込み済
- **[Feasibility S-005]**: 取り込み済

### 見送った提案とその理由

- **[Feasibility S-004]** 過去 ADR (#57 ADR-002) の Status 更新方針: project policy 未定のためレビュー時議論に倒す (リスク欄に追記済)
- **[Feasibility S-006]** ADMIN_LLM_API_KEY 未使用期間の注記: Coverage P-001 採用で env override wire を本 Issue 内に取り込んだため、未使用期間は発生しない (本 Issue merge 後すぐ wire される) → 不要
