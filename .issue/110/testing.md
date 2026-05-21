# 動作確認計画 — Issue #110: wrangler.toml [env.consumer] に R2 / LLM / RELAY bindings を配る

**Issue:** #110
**作成日:** 2026-05-21

---

## 確認環境

### 検証環境の起動

ローカル開発サーバー (workerd + vite + miniflare R2 simulator)。`.dev.vars` に新規 5 key (`SECRET_BOX_MASTER_KEY`, `ADMIN_LLM_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) を投入してから起動する (空のままでも `Stub*` に倒れて起動はする)。

```bash
# 1. .dev.vars を更新
cp .dev.vars.example .dev.vars  # 初回のみ。以後は手動で新規 key を追記
# .dev.vars に SECRET_BOX_MASTER_KEY 等を埋める

# 2. local D1 マイグレーション (既存運用)
pnpm db:migrate

# 3. dev server 起動
pnpm dev
```

### デプロイ方法

#### Pulumi 経由で R2 バケット作成 + wrangler.toml 再生成 (本 Issue 起因の新規手順)

```bash
# staging に R2 バケット 2 種を provisioning
pnpm infra:up:staging

# Pulumi stack output を読み wrangler.staging.toml を再生成
pnpm infra:render:staging
```

#### SOPS 暗号化 secret の更新 (ops 担当が手動実行)

```bash
# staging
pnpm --filter @hollow/infra secrets:edit:staging
# editor で開いたら .json.example を参照しつつ新規 5 key を追加

# production
pnpm --filter @hollow/infra secrets:edit:production
```

#### Wrangler deploy

```bash
# staging 全 worker (dry-run で先に検証)
pnpm deploy:staging:all:dry
# OK なら本番 deploy
pnpm deploy:staging:all

# production も同手順
pnpm deploy:production:all:dry
pnpm deploy:production:all
```

#### Cloudflare 側のログ監視

```bash
# staging consumer ログ tail
wrangler tail --env consumer --config wrangler.staging.toml
```

---

## 確認項目

### 1. 静的検証 (型 / lint / format)

- **目的:** `ServerEnv` 拡張・`createConsumerContainer` シグネチャ拡張で既存型と矛盾が出ないこと
- **手順:**
  1. `pnpm typecheck`
  2. `pnpm lint`
  3. `pnpm format:check`
- **期待結果:** すべて 0 errors / 0 warnings
- **確認ポイント:** `RequestServerConfig` の optional フィールド追加で `exactOptionalPropertyTypes` 違反が無いこと

### 2. DI unit テスト (env → adapter マッピング網羅)

- **目的:** env binding の有無で `R2TempFileStorage` / `R2ObjectStorage` / `AnthropicLLMProvider` / `ServiceBindingRelayTrigger` が正しく切り替わること
- **手順:**
  1. `pnpm test:unit app/core/application/di/__tests__/serverCloudflare.test.ts`
- **期待結果:** 全テスト pass。特に以下が緑:
  - `TEMP_FILES` あり → `tempFileStorage instanceof R2TempFileStorage`
  - `TEMP_FILES` 無し → `tempFileStorage instanceof StubTempFileStorage`
  - `OBJECT_STORAGE` + R2 credentials 5 個全揃い → `R2ObjectStorage`
  - credentials のいずれか欠ける → `StubObjectStorage`
  - `ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL` 両揃い → `AnthropicLLMProvider`
  - どちらか欠ける → `StubLLMProvider`
  - `createConsumerContainer(env, ctx)` + `RELAY` あり → `relayTrigger instanceof ServiceBindingRelayTrigger`
  - `ctx` 無し or `RELAY` 無し → `relayTrigger === NoopRelayTrigger`
- **確認ポイント:** binding 名タイポ / 三項分岐条件のロジック反転を即検知

### 3. 統合テスト (実 R2 binding 経由 dispatch smoke)

- **目的:** miniflare の R2 simulator で `R2TempFileStorage.get` が実 binding 経由で動くこと
- **手順:**
  1. `pnpm test:integration app/worker/cloudflare/__tests__/handlers.integration.test.ts`
- **期待結果:** 全テスト pass。特に以下が緑:
  - 新規「実 R2 binding 経由で ingestion dispatch が動く」ケース: R2 に seed した bytes が `tempFileStorage.get` で取得され、`StubTempFileStorage` の spy が呼ばれていないこと
  - 既存「does NOT stamp when runIngestionJob throws LLMRateLimitError」が R2 binding ベースに書き換わって緑
- **確認ポイント:** miniflare の `r2Buckets: ["TEMP_FILES", "OBJECT_STORAGE"]` 設定が効いていること

### 4. wrangler render の整合 (Pulumi stack output → template → wrangler.toml)

- **目的:** `infra/templates/wrangler.{staging,production}.toml.tmpl` の `${R2_TEMP_FILES_BUCKET}` 等の placeholder が `renderWrangler.ts` の StackOutput とすべて解決すること
- **手順:**
  1. Pulumi stack に R2 bucket リソースを上げる (`pnpm infra:up:staging`)
  2. `pnpm infra:render:staging` を実行し、`wrangler.staging.toml` が生成されること
  3. 生成された `wrangler.staging.toml` を開き、`[env.consumer]` block に以下が解決済みで存在することを目視確認:
     - `[[env.consumer.r2_buckets]] binding = "TEMP_FILES" bucket_name = "hollow-staging-temp-files"` (期待値)
     - `[[env.consumer.r2_buckets]] binding = "OBJECT_STORAGE" bucket_name = "hollow-staging-objects"` (期待値)
     - `[[env.consumer.services]] binding = "RELAY" service = "hollow-staging-relay"` (期待値)
     - `[env.consumer.vars] R2_OBJECT_BUCKET_NAME = "hollow-staging-objects"` (期待値)
     - `[env.consumer.vars] ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"` (期待値)
- **期待結果:** render コマンドが unknown variable で throw しないこと、目視で binding 名と bucket 名が正しいこと
- **確認ポイント:** `renderWrangler.ts` の `vars` map と template の `${...}` placeholder が 1:1 対応

### 5. wrangler deploy dry-run (binding 解決確認)

- **目的:** `wrangler deploy --dry-run` で `[env.consumer]` の全 binding (R2 x2 + RELAY service + D1) が解決され、wrangler が validation を通すこと
- **手順:**
  1. `pnpm deploy:staging:consumer:dry`
- **期待結果:** 「dry run successful」相当のメッセージ。binding 名・型 mismatch エラーが出ないこと
- **確認ポイント:** 特に Service Binding `RELAY` が `wrangler.staging.toml` の `[env.relay]` の `name` と一致すること

### 6. local dev 起動 + ingestion smoke (env 空ケース = Stub 縮退)

- **目的:** `.dev.vars` を空のまま `pnpm dev` を起動し、Stub にきれいに倒れること
- **手順:**
  1. `.dev.vars` から本 Issue 追加 5 key を一時的にコメントアウト
  2. `pnpm dev` で server 起動
  3. ブラウザで admin にログインし ingestion を投入
  4. ログを観察
- **期待結果:**
  - server が `binding undefined` 等で起動失敗しないこと
  - ingestion 投入後、`StubTempFileStorage.get` 由来の `TempFileStorageUnavailableError` で job が `failed` になること (= Stub 経路が動いた証拠)
- **確認ポイント:** 既存挙動の維持 (回帰防止)

### 7. local dev 起動 + R2 / LLM 実 binding smoke (env 充足ケース)

- **目的:** `.dev.vars` に R2 credentials + `ADMIN_LLM_API_KEY` を投入し、実 binding 経路で dispatch が動くこと
- **手順:**
  1. `.dev.vars` に以下を投入:
     - `SECRET_BOX_MASTER_KEY=$(openssl rand -base64 32)`
     - `ADMIN_LLM_API_KEY=sk-ant-xxxxx` (実 Anthropic key、課金注意)
     - R2 credentials 3 種 (R2 dashboard で local-dev 用の read/write token を発行)
  2. `pnpm dev` で server 起動
  3. ブラウザで admin にログイン
  4. ingestion (HTML 形式) を投入 → consumer が dispatch して `AnthropicLLMProvider` 経由で構造化処理
  5. log で `[relay-trigger]` 系のエラーが出ないこと、`runIngestionJob` の `processing → previewing` 遷移が観測されること
- **期待結果:** ingestion job が `previewing` に到達し、admin UI で preview HTML が確認できる
- **確認ポイント:** R2 経路 + Anthropic API 課金経路が両方通る

### 8. admin 設定保存 + 復号動作確認 (`SecretBox` 通電)

- **目的:** admin UI で LLM api key を保存したとき、`SECRET_BOX_MASTER_KEY` で正しく暗号化・復号できること
- **手順:**
  1. `pnpm dev` 起動 (上記 7 の `.dev.vars` 投入済み)
  2. admin にログインし「設定 → LLM」を開き、Anthropic api key を入力して保存
  3. ページを再読込し、保存済み key が表示される (or マスクされる) こと
  4. admin で「接続テスト」ボタンを押し、key が復号されて Anthropic に到達することを確認
- **期待結果:** key が DB に保存され、読み出し時に `WebCryptoSecretBox.decrypt` で正しく復号される
- **確認ポイント:** `NullSecretBox` に倒れて `SecretBoxError(KeyUnavailable)` が出ないこと

### 9. staging deploy smoke (ops 担当の手動確認)

- **目的:** SOPS 投入 + Pulumi apply + render + deploy の全フローが通り、本番 worker で R2 / RELAY が wire されること
- **手順:**
  1. SOPS で staging.enc.json を更新 (新規 5 key を追加)
  2. `pnpm infra:up:staging` で Pulumi apply (R2 bucket 作成)
  3. `pnpm infra:render:staging` で wrangler.staging.toml 再生成
  4. `pnpm deploy:staging:all:dry` で dry-run
  5. `pnpm deploy:staging:all` で本 deploy
  6. `wrangler tail --env consumer --config wrangler.staging.toml` でログ監視
  7. staging admin で ingestion 投入
- **期待結果:**
  - deploy が validation エラーなく完了
  - consumer ログで `[relay-trigger] service binding kick failed` が出ないこと
  - ingestion が `previewing` まで到達
- **確認ポイント:** R2 経路 / Anthropic 経路 / RELAY 即時 publish 経路の 3 つすべて通電

---

## エッジケース・異常系

### 1. R2 credentials の partial 欠落 → StubObjectStorage 縮退

- **目的:** `R2_ACCOUNT_ID` だけ欠けたときに `R2ObjectStorage` を構築せず `StubObjectStorage` に倒れることを確認
- **手順:**
  1. `.dev.vars` で `R2_ACCOUNT_ID` のみコメントアウト
  2. `pnpm test:unit` の serverCloudflare.test.ts で partial 欠落ケースが緑
- **期待結果:** `objectStorage instanceof StubObjectStorage`
- **確認ポイント:** AND 条件が partial 欠落で正しく false 評価される

### 2. `ADMIN_LLM_API_KEY` だけ設定 (model 未設定) → StubLLMProvider 維持

- **目的:** api key だけ設定して `ADMIN_LLM_MODEL` 未設定なら Stub に倒れる安全動作
- **手順:**
  1. `.dev.vars` で `ADMIN_LLM_API_KEY` のみ設定、wrangler.toml の `ADMIN_LLM_MODEL` をコメントアウト
  2. `pnpm dev` で起動
  3. ingestion 投入
- **期待結果:** `AnthropicLLMProvider` の空文字 throw を回避し、`StubLLMProvider` 経由で `BusinessRuleError("unsupported_format")` 等で failed に倒れる
- **確認ポイント:** server 起動が throw しないこと

### 3. `RELAY` Service Binding が staging に向く（誤配線）テスト

- **目的:** dry-run で binding ミスを検出できること
- **手順:**
  1. wrangler.staging.toml の `[[env.consumer.services]] service` を意図的に存在しない名前に変更
  2. `pnpm deploy:staging:consumer:dry` を実行
- **期待結果:** wrangler が「Service binding 'RELAY' refers to nonexistent service 'XXX'」のような error で fail
- **確認ポイント:** 終了後は変更を rollback

---

## 既存機能への影響確認

- **既存 ingestion path (web 経由)**: `createRequestContainer` も同じ DI 経路で R2 binding が wired される。web 経由でも dispatch が `R2TempFileStorage` / `AnthropicLLMProvider` を通るようになる (副作用)。既存 web ingestion テストが緑のままであること
- **既存 export path**: `runExportJob` 経由で `objectStorage.put` が `R2ObjectStorage` 経由に切り替わる。export ジョブの artifact 生成が成功すること
- **既存 admin 設定保存**: `SecretBox` が `WebCryptoSecretBox` になり、保存値が永続化される (元々は `NullSecretBox` で保存時 throw だった可能性あり) — admin UI の「保存」操作が成功するようになる
- **既存統合テスト (handlers.integration.test.ts) の Stub spy 削除**: 削除した spy が他テストで参照されていないことを `grep` で確認
- **#57 ADR-003 既知制約 (LLMRateLimitError → processing 固定化)**: 本 Issue でも解消されない。挙動変化なし

---

## 確認チェックリスト

- [ ] `pnpm typecheck` pass
- [ ] `pnpm lint` pass
- [ ] `pnpm format:check` pass
- [ ] `pnpm test:unit app/core/application/di/__tests__/serverCloudflare.test.ts` pass
- [ ] `pnpm test:integration app/worker/cloudflare/__tests__/handlers.integration.test.ts` pass
- [ ] `pnpm infra:render:staging` が unknown variable で throw しない (Pulumi stack を staging に apply 済み前提)
- [ ] `pnpm deploy:staging:consumer:dry` が binding 解決エラー無しで pass
- [ ] `.dev.vars` 空ケースで `pnpm dev` 起動成功 + Stub 経路で ingestion が `failed` 到達
- [ ] `.dev.vars` 充足ケースで `pnpm dev` 起動成功 + 実 binding 経路で ingestion が `previewing` 到達 (Anthropic API 課金注意)
- [ ] admin UI で LLM api key 保存 → 再読込で復号成功
- [ ] (ops) staging deploy 後 `wrangler tail --env consumer` で `service binding kick failed` ログが出ない
- [ ] (ops) staging で ingestion 投入後、`previewing` 到達を tail ログで確認
- [ ] 既存 web ingestion テスト群が緑のまま (回帰なし)
- [ ] 削除した Stub spy が他テストで参照されていないこと (`grep -r "StubTempFileStorage.prototype" app/` で確認)

## 要確認

- production deploy 時の R2 bucket location (Cloudflare auto = どの region に置かれるか) — 法務的に固定が必要なら ADR-001 のフォロー Issue として起票
