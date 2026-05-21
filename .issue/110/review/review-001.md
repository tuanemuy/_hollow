# PR Review #001 — feat(issue-110): wire R2 / LLM / RELAY bindings to [env.consumer]

**PR:** #112
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 15 (Infra: 8, Application DI: 3, Tests: 4)
- Notes: 16
- Verdict: **BLOCKED** (Warning に「wiring の正当性が実検証されていない」重大な構造的指摘 W-001 を含むため、修正後 再レビュー)

---

### Infrastructure & Wrangler Config

#### Blockers
なし

#### Warnings

- **[W-001]** `ADMIN_LLM_MODEL` がテンプレートでハードコードされ Pulumi 同期から外れている
  - 場所: `infra/templates/wrangler.staging.toml.tmpl:22,80` / `infra/templates/wrangler.production.toml.tmpl:22,80` / `wrangler.toml:33,111`
  - 理由: 他の bucket 名 / queue 名 / database id は全て Pulumi stack output → render placeholder 経由でリテラル化されており SSOT が一意。だが `ADMIN_LLM_MODEL` だけ 6 箇所に `"claude-3-5-sonnet-latest"` がリテラル散在。stage ごとにモデル差し替えのとき同期が必要で render 機構の利点が活きない
  - 提案: `renderWrangler.ts` の `vars` map に `ADMIN_LLM_MODEL` を追加、テンプレートを `${ADMIN_LLM_MODEL}` プレースホルダ化。`StackOutput` に追加するか、最低 default literal を render 側で持つ

- **[W-002]** `@pulumi/cloudflare.R2Bucket` の `location` 未指定挙動が SDK doc 上明言なし
  - 場所: `infra/src/r2.ts:22,26`
  - 理由: ADR-001 は「Cloudflare auto」と言い切るが Pulumi provider の挙動 (空 string でエラー / 自動配置 / hint) は実機なしで確認不能
  - 提案: testing.md / progress.md に「(ops) `pnpm infra:up:staging` で provider 挙動を smoke 確認」を明示。preview-only コマンドで PR merge 前に検証

- **[W-003]** `staging.json.example` / `production.json.example` が完全同一でファイル分割の意義が薄い
  - 場所: `infra/secrets/staging.json.example` 全体 / `infra/secrets/production.json.example` 全体
  - 理由: ADR-005「stage ごとに別 key」運用が強調されているがテンプレ上は何も差異がない。コピーミスで片方だけ更新する事故誘発
  - 提案: `_comment` フィールドに stage 名を埋めて grep 可能にする (現状 staging/production 文字列が本文に出ない)

- **[W-004]** `_dispatch_extras_comment` 等が SOPS encryption の対象に乗る恐れ (`.sops.yaml` 不在)
  - 場所: `infra/secrets/staging.json.example:3` / `infra/secrets/production.json.example:3`
  - 理由: default SOPS 設定では `_comment` 含む全 key が暗号化対象。暗号化済巨大文字列が `_comment` に残る運用上の不便
  - 提案: `.sops.yaml` で `unencrypted_suffix: _comment` を宣言、もしくはコメントを doc に追い出す

- **[W-005]** `_comment` 内の `sops -e -i` 指示と `secrets:edit:*` スクリプトの推奨が不一致
  - 場所: `infra/secrets/staging.json.example:2`
  - 理由: `runtime_cloudflare.md` に正しい `pnpm --filter @hollow/infra secrets:edit:{stage}` 手順あるが、`.json.example` の `_comment` は `sops -e -i` を推奨し、平文一瞬残るリスク
  - 提案: `_comment` を doc link に置き換え (W-004 と同時整理可能)

- **[W-006]** `workerSecretSpecs` に既存 `ADMIN_SETUP_TOKEN` が含まれていない
  - 場所: `infra/src/secrets.ts:18-63`
  - 理由: `ServerEnv.ADMIN_SETUP_TOKEN` は既に optional secret として DI が読む。`workerSecretSpecs` を spec SoT として位置付ける以上、本 PR で `dispatchExtras` 整理ついでに追記すべき
  - 提案: `web` だけに `ADMIN_SETUP_TOKEN` を追加。または ADR-007 周辺に「scope 外として別 Issue」と書き残す

- **[W-007]** `docs/runtime_cloudflare.md` の Worker matrix の `App (fetch)` 行に dispatch-side secrets が記載されていない
  - 場所: `docs/runtime_cloudflare.md:36`
  - 理由: Consumer 行には secrets 列挙されているが App 行は無く、`workerSecretSpecs` (web も `dispatchExtras` を持つ) と不整合
  - 提案: App (fetch) 行に Consumer 行と同じ dispatch-side secrets を追加

- **[W-008]** stage 新規追加時の R2 API token 発行手順 doc 不足
  - 場所: `docs/runtime_cloudflare.md:64-82`
  - 理由: bucket 自体は Pulumi 経由だが ADR-005 で「access token は手動発行」と決めた以上、「Pulumi up → token 発行 → SOPS encrypt → deploy」の全体フロー doc が欠落
  - 提案: `One-time Cloudflare resource creation` 末尾に手順追記

#### Notes

- **[N-001]** plan / ADR / 実装の整合度は高い。`dispatchExtras` 抽出、`r2PresignReady` ガード、`exactOptionalPropertyTypes` を意識した spread、JSDoc に Stub フォールバック挙動を全て書き残す姿勢
- **[N-002]** wrangler env 非継承対策が手厚い (リマインダーコメントの重複配置)
- **[N-003]** `worker-configuration.d.ts` の ConsumerEnv interface に追加 binding が全て反映されている (binding 名タイポなし)
- **[N-004]** ADR-007 既知制約が JSDoc / docs 両方に書かれている
- **[N-005]** `R2_OBJECTS_BUCKET` を SSOT として binding と vars 両方に流す ADR-006 design が整合的に貼られている

---

### Application DI

#### Blockers
なし

#### Warnings

- **[W-001]** ⚠️ **重要** — `createConsumerContainer` の RELAY 経由 wiring を実際には verify していないテスト (Tests の W-001 と同一根本問題)
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:359-426`
  - 理由: 「wires ServiceBindingRelayTrigger when RELAY + ctx are both present」は `new ServiceBindingRelayTrigger(...)` をテスト内で別途構築して `instanceof` 確認するだけ。**`createConsumerContainer(env, ctx)` 内で `relayTrigger` が実際に `ServiceBindingRelayTrigger` として wire されたかは検証していない**。`relay && waitUntil` が逆になっても通る。ADR-004 の核心 (RELAY + ctx → ServiceBindingRelayTrigger) が regression guard で守られていない
  - 提案: `relayTrigger` 構築ロジックを `buildRelayTrigger(relay, waitUntil, logger): RelayTrigger` という pure 関数に切り出して export し、それを単体テストで `instanceof` 検証。または UnitOfWorkProvider に test seam (`@internal` getter) を入れる

- **[W-002]** `handleQueue` の `ctx.waitUntil` の ack 後 cancel JSDoc 表現が実態と乖離
  - 場所: `app/core/application/di/serverCloudflare.ts:365-368`
  - 理由: Workers の `ctx.waitUntil` は handler return 後でも isolate を keep alive する契約。「ack 前/後に cancel される」と読める書き方は誤解
  - 提案: 「kick is best-effort; if `waitUntil` is dropped (CPU limit, worker crash before the kick fetch completes), the relay safety-net cron picks the row up」のような正確な表現に

- **[W-003]** `RequestServerConfig` の destructuring が静かに増え続けるリスク
  - 場所: `app/core/application/di/serverCloudflare.ts:256-268`
  - 理由: `createRequestContainer` の手動 destructure → 残り `...appConfig satisfies AppConfig` 構造。今回 4 個追加で 10 個に。将来 destructure を忘れると non-SSR field が `appConfig` に紛れ込みリスク
  - 提案: `toAppConfig(config): AppConfig` ヘルパー導入 (構造的防止)。または本 PR scope 外として ADR で別 Issue 候補に記録

#### Notes

- **[N-001]** `r2PresignReady` 集約 boolean → 不揃いなら spread しない挙動正しい。空文字 falsy も `!!` で自然除外、`as` cast も narrowing 制約上やむを得ない。`exactOptionalPropertyTypes` 違反 avoid
- **[N-002]** `AnthropicLLMProvider` は `adminLlmApiKey && adminLlmModel` ガード後に構築。コンストラクタの空文字 throw に到達しない (二重防御)
- **[N-003]** `handleQueue` の `_ctx → ctx` リネーム + `createConsumerContainer(env, ctx)` 渡しは ADR-004 通り。`handleDlq` 側は dispatch しないので `_ctx` 維持で正しい
- **[N-004]** `createConsumerContainer` JSDoc が #57 ADR-002 制約解消、非対称性、deferred 項目を丁寧に明記
- **[N-005]** `secretBox` / `tempFileStorage` / `objectStorage` / `llmProvider` 分岐の対称性。条件数の差は本質的
- **[N-006]** `server.cloudflare.ts` の request-path 側も既に `readRequestServerConfig(env, ctx)` を呼ぶため `ctx?` 拡張で互換性破壊なし

---

### Test

#### Blockers
なし

#### Warnings

- **[W-001]** RELAY/NoopRelayTrigger テスト 3 件がトートロジー (Application DI W-001 と同一)
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:359-426`
  - 理由: 詳細は Application DI W-001 参照
  - 提案: 詳細は Application DI W-001 参照

- **[W-002]** `vitest.config.integration.ts` で `R2ObjectStorage` 用 credentials / `OBJECT_STORAGE` バケットを wire しているが、使う統合テストが 1 件もない
  - 場所: `vitest.config.integration.ts:32, 64-71`
  - 理由: 設定漏れ regression が別経路 (web 側 export ダウンロード) で初めて発覚し、CI から気付けない
  - 提案: 最小限「`OBJECT_STORAGE.put → R2ObjectStorage 経由 get/stat」smoke 1 ケース追加、または `// TODO: 別 Issue で wire` コメント明示

- **[W-003]** 「partial R2 credentials → StubObjectStorage 縮退」テストが 1 ケースのみ
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:446-458` と `:297-302`
  - 理由: 5 連 AND チェックの 1 個欠落 1 ケースでは、極性反転や条件落ちを catch しきれない
  - 提案: `it.each([...])` で 5 個欠落パターン回す、または空文字 `""` ケースで truthy 意味論を pin

- **[W-004]** `ServiceBindingRelayTrigger` import と `fakeFetcher` がほぼ未使用 (misleading)
  - 場所: `app/core/application/di/__tests__/serverCloudflare.test.ts:12, 258, 376-381`
  - 理由: W-001 のトートロジー文で 1 回 instanceof チェックされるのみ。レビュー / 将来リファクタで混乱
  - 提案: W-001 を解決すれば自然に解消

#### Notes

- **[N-001]** ADR-008 の `tempFilesBinding()` ヘルパーは `@cloudflare/workers-types` と workerd ambient の `R2Bucket` 型 skew 回避設計が明文化されており、call site も読みやすい
- **[N-002]** 既存 `vi.spyOn(StubTempFileStorage.prototype, "get")` 撤去 + 新規 R2 smoke の double assertion (`R2 spy 呼ばれた AND Stub spy 呼ばれてない`) で DI regression を直接検出
- **[N-003]** 単体テストの責任分担 (instanceof 網羅) / 統合テストの責任分担 (smoke) が plan.md 通り。`vitest.config.integration.ts` で意図的に LLM env 未設定で StubLLMProvider 維持コメントも明示的
- **[N-004]** 「bucket 単体でも presign 単体でも不可」テスト (line 297) が非対称 truthy 条件を pin している
- **[N-005]** 新規 R2 smoke の status assertion は判別力ゼロだが害なし (spy assertion が本質)

---

## Design Decisions

特になし。修正の中で `buildRelayTrigger` を pure 関数に切り出す案は ADR-008 の系譜 (テスト境界の小さなヘルパー) なので ADR-009 として記録する。
