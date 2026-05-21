# PR Review #001 — refactor(llm): provider-agnostic LLM adapter abstraction (#122)

**PR:** #130
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 8
- Notes: 多数
- Verdict: **BLOCKED**

---

## Adapter Layer

### Blockers
- なし

### Warnings
- **[W-A-001]** JSDoc 内に rename 前のファイル名 `anthropicMessagesClient.ts` が残っている
  - 場所: `app/core/adapters/anthropic/llmProvider.ts:53`、同 `:153`
  - 理由: ADR-006 で `anthropicMessagesClient.ts` → `messagesClient.ts` に rename を実施したが、`AnthropicLLMProvider` の class-level JSDoc と `invoke()` 内コメントは古いファイル名で参照している。grep でファイルを見失う原因になる
  - 提案: 2 箇所とも `messagesClient.ts` に書き換える

- **[W-A-002]** factory の error message が "Unsupported LLM provider" 固定で OCR/PDF でも同じ文言
  - 場所: `app/core/application/di/llmProviderFactory.ts:39, 57, 75`
  - 理由: `createOCRProvider` / `createPDFExtractor` から throw されても "LLM provider" と語っているので、stack trace だけ見たときに OCR/PDF 文脈で起こったことが分からない
  - 提案: 3 つの factory それぞれで "Unsupported LLM/OCR/PDF provider" のように識別子を分離

- **[W-A-003]** factory 3 つが DRY 違反気味（provider 追加時に 3 箇所 switch 同期が必要）
  - 場所: `app/core/application/di/llmProviderFactory.ts:31-77`
  - 理由: switch case が散らばる構造
  - 提案: 本 PR のスコープ外（YAGNI 採用済み、ADR-007）。次の provider 追加時に provider-registry pattern を検討
  - **判断:** 後回し（次の Issue で扱う領域）。本 PR では対応しない

### Notes
- **[N-A-001]** Phase A の `git mv` 純粋 rename が確実に rename detection を引き起こしている（`git log --follow` で過去履歴が辿れる）
- **[N-A-002]** `adapters/anthropic/` と `adapters/stub/` の双方向 cross-leak がないことを確認（grep 0 件、JSDoc の参照のみ）
- **[N-A-003]** Stub 5 種すべてで `BusinessRuleError` の error code 文字列が rename 前と完全一致で維持
- **[N-A-004]** adapter 層が他 provider adapter を import していないことを確認
- **[N-A-005]** driver-specific error translation（HTTP 429 → `LLMRateLimitError` 等）が破壊なし
- **[N-A-006]** test 移動先の相対 import が rename 後のファイル名と整合
- **[N-A-007]** `HttpLLMConnectionTester` の `switch (cfg.provider)` + `never` exhaustive が `LLMConfig.provider` 単一 literal の現状で compile-time 検証が効いている

---

## Application / DI Layer

### Blockers
- なし

### Warnings
- **[W-D-001]** `ADMIN_LLM_PROVIDER` が未知値でも `apiKey` か `model` のいずれかが欠けていると `default: throw` に到達せず Stub に silent fallback
  - 場所: `app/core/application/di/serverCloudflare.ts:329-336`, `:347-354`, `:357-365`
  - 理由: ADR-007 が掲げる「設定ミスを早期に表面化」原則と緊張する。`ADMIN_LLM_PROVIDER=openai` を入れたまま `ADMIN_LLM_API_KEY` を入れ忘れたオペレーターは provider 名タイポに気付かない
  - 提案: ADR-007 の Consequences に lazy validation の補足を追記（`buildXxx` 経由では key/model 不在時にさらに lazy になる旨）

### Notes
- **[N-D-001]** factory のシグネチャ `Readonly<{ provider: string; apiKey: string; model: string }>` は ADR-003 / ADR-007 と完全整合
- **[N-D-002]** `default: throw` のメッセージが provider 名を含み一意に判定可能
- **[N-D-003]** `createRequestContainer` 内 3 箇所で `(adminLlmProvider, adminLlmApiKey, adminLlmModel)` 順に正しく呼ばれている
- **[N-D-004]** `ServerEnv.ADMIN_LLM_PROVIDER` と `readRequestServerConfig` の conditional spread が既存パターンを完全踏襲、`exactOptionalPropertyTypes` 規約準拠
- **[N-D-005]** `RequestServerConfig.adminLlmProvider` の JSDoc が既存パターンと整合
- **[N-D-006]** factory が adapter を import する向きは composition root として CLAUDE.md と整合（ADR-001）
- **[N-D-007]** `LLMProvider` (domain literal) と `LLMProvider` (port interface) の名前衝突なし
- **[N-D-008]** factory unit test が 3 関数 × (anthropic + unsupported) を網羅、empty-string ケースも入っている

---

## Test Layer

### Blockers
- なし

### Warnings
- **[W-T-001]** `createConsumerContainer` のテストに `ADMIN_LLM_PROVIDER` env を伝搬する経路の検証がない
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:747-765`
  - 理由: `createConsumerContainer` は `readRequestServerConfig(env, ctx)` 経由で `ADMIN_LLM_PROVIDER` を `adminLlmProvider` に詰める。conditional spread を新規追加しているのに、consumer 経路でも生きていることを担保する unit test がない
  - 提案: 既存 `"threads ServerEnv R2 + LLM bindings through to the right adapters"` ケースに `ADMIN_LLM_PROVIDER: "anthropic"` を追加し、別 1 ケースで `ADMIN_LLM_PROVIDER: "unsupported-x"` を渡したときに `createConsumerContainer(...)` が throw することを検証

- **[W-T-002]** `readRequestServerConfig` の `adminLlmProvider` conditional spread 自体に直接の unit test がない
  - 場所: `app/core/application/di/serverCloudflare.ts:246-248`
  - 理由: ADR-007 の core 要素である「env を生 string で受け取り、未設定なら config フィールド自体を omit する」挙動が、間接 (`createConsumerContainer` の instanceof) を介してしか確認されていない
  - 提案: `describe("readRequestServerConfig")` に set / unset の 2 ケースを追加し `Object.hasOwn(config, "adminLlmProvider")` で直接検証

### Notes
- **[N-T-001]** factory test の負経路カバレッジが網羅的（`"openai"` / `"gemini"` / `"azure-openai"` の 3 種類の plausible-but-unsupported provider 値）
- **[N-T-002]** factory test の assertion メッセージが完全一致ではなく明示的に provider 名を含めて検証
- **[N-T-003]** `serverCloudflare.test.ts` の `buildLlmProvider` / `buildOcrProvider` / `buildPdfExtractor` 各 describe ブロックが境界網羅
- **[N-T-004]** grep 検証 3 種すべて 0 件、plan の Phase E-1 検証項目を満たしている
- **[N-T-005]** `pnpm test:unit` 1599 / `pnpm test:integration` 352 すべて緑

---

## Configuration / Domain

### Blockers

- **[B-C-001]** `infra/templates/wrangler.staging.toml.tmpl` と `wrangler.production.toml.tmpl` に `ADMIN_LLM_PROVIDER` 追加が漏れている
  - 場所: `infra/templates/wrangler.staging.toml.tmpl:22, 80` と `infra/templates/wrangler.production.toml.tmpl:22, 80`
  - 理由: ローカル `wrangler.toml` には追加されているが、staging/production の template は更新されていない。これらは `infra/scripts/renderWrangler.ts` で実 deploy 用 `wrangler.staging.toml` / `wrangler.production.toml` を生成する SSOT。**本番 / staging worker に `ADMIN_LLM_PROVIDER` 環境変数が一切存在しない状態** で配備される（factory の default `"anthropic"` で動くため挙動は変わらないが、PR コメントが「明示的設定」を意図している点と矛盾、また既存 `ADMIN_LLM_MODEL` の配置パターン整合を破壊）
  - 提案: 両 template の `[vars]` 直後 `ADMIN_LLM_MODEL` 行に続けて `ADMIN_LLM_PROVIDER = "${ADMIN_LLM_PROVIDER}"` を追加、`[env.consumer.vars]` 内 (80 行目相当) にも同様に追加、`renderWrangler.ts:94` の `vars` リテラルにも `ADMIN_LLM_PROVIDER: "anthropic"` を追加

### Warnings

- **[W-C-001]** factory コメント (`wrangler.toml:34-36`) と template 配置パターンの sync 構造リスク
  - 場所: `wrangler.toml:34-36`
  - 理由: 将来 provider 追加時に同じ漏れが繰り返される構造的リスク
  - 提案: B-C-001 を直すついでに、template にも 1-2 行のミニマムコメント、もしくは `renderWrangler.ts` 内の「keep this value in sync with `wrangler.toml`」コメント拡張

- **[W-C-002]** `valueObject.ts` のコメントが domain 層から adapter / DI 層の具体ファイルパスを参照
  - 場所: `app/core/domain/adminSettings/valueObject.ts:119-121`
  - 理由: CLAUDE.md「Dependencies point inward」原則。コメントだけなのでビルド依存はないが、下層の場所変更時に silent な腐敗を起こす
  - 提案: invariant 中心の表現に書き換え。例: `// INVARIANT: every value here must have a matching case in the LLM/OCR/PDF factories — otherwise runtime DI throws. See app/core/application/di/llmProviderFactory.ts.`

### Notes
- **[N-C-001]** `LLM_PROVIDERS` 値 (`["anthropic"]`) が変更されていない点は scope と整合的
- **[N-C-002]** env 変数命名 `ADMIN_LLM_PROVIDER` は既存命名規約と prefix・粒度ともに整合
- **[N-C-003]** `wrangler.toml` の挿入位置が論理的にペアで読める良い配置
- **[N-C-004]** `[env.relay.vars]` / `[env.pruner.vars]` / `[env.dlq.vars]` に追加しない判断は正しい（これらは LLM を呼ばない）

---

## Design Decisions

このラウンドで見つかった設計判断:
- ADR-008 として **infra/templates と wrangler.toml の sync 規約** を追記する（B-C-001 対応）
- ADR-007 の Consequences に **`buildXxx` 経由での lazy validation の境界** を追記する（W-D-001 対応）
- W-A-003 (factory DRY) は YAGNI 採用済みで本 PR スコープ外、次の provider 追加 Issue で取り扱う
