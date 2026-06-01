# PR Review #002 — refactor(#140): provider-registry pattern for adapter factories

**PR:** #399
**Date:** 2026-06-01
**Round:** 2回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0（A-W-001 / D-W-001 の cast は1周目からの許容済みトレードオフで新規 Warning ではない）
- Notes: 多数（修正確認・挙動不変確認）
- Verdict: **APPROVED**

検証（各レビュアーが実機実行）:
- `pnpm typecheck` PASS（エラー0）
- `pnpm test:unit` 159 files / 2960 tests PASS
- `pnpm test:integration` 42 files / 528 tests PASS（W-I-005 新規ケース含む）
- biome lint 変更ファイル警告0

---

## Test

### Blockers
なし

### Warnings
なし

### Notes（要点）
- **T-W-001 解消**: `registry.test.ts` が barrel 固有ロジックを直接 assert（openai baseURL null→省略 / 非null→転送、openai/gemini reason→error、成功時 error field 不在、gemini は baseURL 無視）。
- **T-W-002 解消**: `pingAnthropic/pingOpenAI/pingGemini` を `vi.mock` 化し実ネットワーク fetch を完全排除。弱い assertion を `toEqual` + `not.toHaveProperty` に強化。単体実行がネット非依存で安定。
- **T-W-003 解消**: `lookupProviderAdapter("typo") → undefined` 契約と既知 provider の同一参照を検証。
- mock の効き方健全（alias `@/...` と barrel の相対パスが tsconfigPaths で同一モジュールに解決され intercept が効く）。
- openai の空文字 baseURL 扱いは旧 dispatcher（`cfg.baseURL !== null`）と完全一致で挙動不変、追加担保不要。

## Adapter + Application/DI

### Blockers
なし

### Warnings
- **[W-001]（許容・対応不要）** `lookupProviderAdapter` の `as Record<string, ProviderAdapter>` cast。env/DB 由来 string を runtime lookup するための意図的トレードオフ。網羅性は定義時の `Record<LLMProviderId, ProviderAdapter>` が compile-time 保証。JSDoc 明示済み、両レビュアー「対応不要」。新規 Warning ではない。

### Notes（要点）
- 型エラー修正3点を確認、いずれも挙動不変:
  - `lookupProviderAdapter` 追加で factory（3関数）・dispatcher が統一。undefined ガードは factory では種別別 throw を兼ね、dispatcher では旧 default 相当 outcome（defensive net、コメント明記）。
  - anthropic barrel は `pingAnthropic` 直 forward（再構築による `error: string | undefined` 化を回避、`exactOptionalPropertyTypes` 厳守）。
  - dispatcher は `pingXxx` 直 import を撤去、残置は provider 非依存ロジックのみ。
- factory/dispatcher の外部 API・挙動が完全不変（unsupported throw prefix、空 apiKey ガード、maskSecrets、baseURL 吸収、reason→error）。
- 依存方向 clean（registry→barrel 値 / barrel→registry 型のみ、循環なし、名前衝突 alias 回避）。スコープ外混入なし。
- 既存 dispatcher テスト14ケースが registry indirection 越しに mock が効き回帰防波堤として機能。

---

## Design Decisions

- **DR-1（許容トレードオフ）**: `lookupProviderAdapter` の string-keyed cast。runtime 入力が env/DB 由来 string である以上、`Record<LLMProviderId>` の compile-time 網羅性保証と runtime lookup を分離するのが妥当。JSDoc で役割を明記し受容。別 Issue 不要（設計上の最適解）。

## 完了

2周目で Blocker 0 / Warning 0（許容済みトレードオフのみ）に到達。issue-implement Phase 3 の完了条件「1ラウンドクリーンで完了」を満たし **APPROVED**。
