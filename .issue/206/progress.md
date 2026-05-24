# Implementation progress — Issue #206

## 完了
- ステップ 1: `hash-wasm@^4.12.0` を `package.json` の `dependencies` に追加
- ステップ 2: `app/core/adapters/security/argon2id.ts` を新設 (hashArgon2id / verifyArgon2id / isArgon2idEncoded / WasmUnavailableError)
- ステップ 3: `Argon2idPasswordHasher` を Argon2id 化 (constructor 引数なしに簡素化、legacy PBKDF2 verify を private helper として温存)
- ステップ 4: `D1CredentialStore` を Argon2id 化 + lazy upgrade 実装 (maybeRehashLegacy)
- ステップ 5: DI 配線 (`serverCloudflare.ts`) は無変更を確認
- ステップ 6: 単体テスト追加 (`argon2id.test.ts`, `passwordHasher.test.ts`)
- ステップ 7: 統合テスト追加 (lazy upgrade iter=100,000 / 600,000 の 2 ケース、`identity.integration.test.ts` 内)
- ステップ 8: share-link round-trip は既存 `service.test.ts` で fake hasher が使われるため無変更で通る (確認済み)
- ステップ 9: `spec/adr/011-argon2id-migration.md` を新規作成、`.issue/206/adr.md` に ADR-005 を追記
- ステップ 10: bundle size 計測完了。staging dry-run で Total Upload 4596.58 KiB / gzip 969.67 KiB (5 MiB 未満)

## 未完了 / ユーザ確認待ち
- ステップ 11: staging deploy & smoke test — 本タスクのスコープ外。メインエージェント / オペレータ側で実行が必要
  - 受け入れ基準: 新規 admin signup の hash が `$argon2id$` で始まる
  - 受け入れ基準: 既存 PBKDF2 ユーザ (iter=100,000 / 600,000) で logIn → 成功 + DB の hash が Argon2id に上書きされる (lazy upgrade)
  - 受け入れ基準: 既存 PBKDF2 share-link が引き続き resolve できる、新規 share-link は `$argon2id$` で始まる
  - 受け入れ基準: cold start +500ms 以内

## 設計判断追加 (ADR-005)
`@cloudflare/vitest-pool-workers` が動的 WebAssembly compile を禁止するため、`hash-wasm` の lazy compile が test pool で `CompileError` を投げる現象を発見。
- 対応: `WasmUnavailableError` を共通モジュール (`security/argon2id.ts`) で公開し、両 adapter (D1CredentialStore / Argon2idPasswordHasher) の hash 経路で PBKDF2 (iter=600,000) に runtime fallback する
- production Workers は WASM compile を常に許可するため、fallback 経路は本番では発火しない (Argon2id 運用)
- lazy upgrade 統合テストは WASM availability の事前 probe で `ctx.skip()`
- staging smoke (ステップ 11) で「実環境で Argon2id hash が生成される」「lazy upgrade が機能する」を担保
- `.issue/206/adr.md` ADR-005 と `spec/adr/011-argon2id-migration.md` 末尾に判断を記録

## テスト結果
- `pnpm typecheck`: green
- `pnpm lint:fix`: green (既存の無関係な info 警告 1 件は本 PR スコープ外)
- `pnpm format`: green
- `pnpm test:unit`: 2409 / 2409 passed
- `pnpm test:integration`: 422 passed + 2 skipped (lazy upgrade tests — WASM 制約により expected skip)
- `pnpm build`: success
- `pnpm deploy:staging:dry`: Total Upload 4596.58 KiB / gzip 969.67 KiB
