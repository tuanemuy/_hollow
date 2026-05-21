# 実装進捗 — Issue #110

実装は plan.md / testing.md のスコープに沿って一通り完了。以下は補足。

## 完了項目 (plan.md チェック対応)

| Step | 項目                                                              | 状態 |
| ---- | ----------------------------------------------------------------- | ---- |
| 1    | Pulumi: `infra/src/r2.ts` 新規 + `index.ts` で createR2Buckets 呼出 | done |
| 2    | `renderWrangler.ts` StackOutput / vars に R2 placeholder 追加      | done |
| 3a   | local + template top-level に R2 bindings / vars 追加              | done |
| 3b   | `[env.consumer]` に R2 / RELAY / vars 追加                         | done |
| 4    | `secrets.ts` の web/consumer に `dispatchExtras` 追加              | done |
| 5    | `infra/secrets/{staging,production}.json.example` 更新             | done |
| 6    | `.dev.vars.example` 更新                                          | done |
| 7    | DI: `ServerEnv` / `RequestServerConfig` 拡張 + 三項分岐 + JSDoc 更新 | done |
| 8    | `handlers.ts` で `ctx` を `createConsumerContainer` に渡す         | done |
| 9    | `vitest.config.integration.ts` に R2 binding + credentials 追加    | done |
| 10   | 統合テスト: R2 経由 dispatch smoke + 既存 spy workaround 撤去      | done |
| 11   | DI unit テスト: env→adapter instanceof 網羅                        | done |
| 12   | `docs/runtime_cloudflare.md` 補強                                 | done |

## 静的検証 / テスト結果

- `pnpm typecheck` — 0 errors
- `pnpm lint` (biome) — `app/components/ui/**` etc 除外で 0 issues
- `pnpm format:check` — clean
- `pnpm test:unit` — **1477 passed** (`serverCloudflare.test.ts`: 32 passed うち新規 13)
- `pnpm test:integration` — **350 passed** (`handlers.integration.test.ts`: 14 passed うち新規 1)

## 設計判断 (adr.md 追記)

- **ADR-008**: 統合テストで `env.TEMP_FILES` を narrow するための `tempFilesBinding()` ヘルパー導入と、`@cloudflare/workers-types` の `R2Bucket` 型を import しない理由

## 既知の制限・フォローアップ

### 本 Issue で意図的に解消されない (plan.md 「含まれないもの」)

- **LLM の DB 経由動的解決層**: 本 Issue は env override (`ADMIN_LLM_API_KEY` + `ADMIN_LLM_MODEL`) のみ wire。admin が DB に保存した暗号化 api key からの dynamic resolve は別 Issue (ADR-002)
- **OCR / Office / PDF / Speech**: 実 adapter 不在のため Stub 据え置き (ADR-003)
- **`workerSecretSpecs` per-worker filter の CI 実装**: 現状 spec のみ。relay/pruner/dlq にも secret が配送される (ADR-007)
- **wrangler.toml / secrets / .dev.vars の同期 enforcement 自動化**: 手動同期
- **web 側 export download presign 動作の明示検証**: 同じ DI 経路で配線されるため副作用として動くが、明示テストは別 Issue

### 実装中に観察した補足事項

- `createConsumerContainer(env, ctx)` の RELAY 経路 unit テストは「container が定義されている」「instanceof of ServiceBindingRelayTrigger を別途構築して assert」の間接アサーション。`unitOfWorkProvider` 内の `relayTrigger` は private で公開されないため。実 binding 経由の wiring 検証は統合テスト (handlers.integration.test.ts) で間接的にカバーされる
- `worker-configuration.d.ts` は `wrangler types` で自動生成・gitignore のため commit 不要。`pnpm dev` の predev / postinstall で再生成される
- 既存テスト `does NOT stamp when runIngestionJob throws LLMRateLimitError` は ADR-006 (#57) の予告通り `vi.spyOn(StubTempFileStorage.prototype, "get")` を撤去し、`env.TEMP_FILES.put(...)` で R2 に seed する形に書き換え済み
- handlers 統合テスト内の `StubTempFileStorage` import は新規 R2 smoke テストで「Stub spy が呼ばれていない」確認に使うため残置 (regression guard として有効)

### 手動 smoke (testing.md §7-9) は未実施

本実装はコード変更とテスト追加までで完了。以下は ops 担当の手動確認が必要:

- `.dev.vars` 充足ケースの `pnpm dev` smoke (Anthropic 課金が発生するため意図せず実行しない)
- staging Pulumi apply (`pnpm infra:up:staging`) と render → deploy
- SOPS で staging.enc.json / production.enc.json の暗号化更新 (本 PR では `.json.example` のみ更新)
- `wrangler tail --env consumer` での RELAY 即時 publish ログ確認

testing.md チェックリストの「(ops)」プレフィックス項目に対応。
