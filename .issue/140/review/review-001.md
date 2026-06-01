# PR Review #001 — refactor(#140): provider-registry pattern for adapter factories

**PR:** #399
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（Adapter 1 / Application·DI 1 / Test 3 ※Adapter と Application·DI の W-001 は同一論点）
- Notes: 多数（すべて良い点・確認事項）
- Verdict: **BLOCKED**（Warning 残のため。完了条件は Blocker 0 かつ Warning 0）

検証（各レビュアーが実機実行で確認）:
- `pnpm typecheck` PASS（エラー0）
- `./node_modules/.bin/biome lint ./app` PASS（変更ファイルに警告0、既存 11 警告は無関係ファイル）
- `pnpm test:unit` 159 files / 2950 tests PASS
- `pnpm test:integration` 42 files / 528 tests PASS（W-I-005 新規 3 ケース含む）

---

## Adapter / Infrastructure

### Blockers
なし

### Warnings
- **[A-W-001]** `lookupProviderAdapter` の `as Record<string, ProviderAdapter>` cast が型安全性を一段下げる（`registry.ts:62-66`）。ただし「網羅性は `Record<LLMProviderId>` で compile-time 保証、runtime lookup は env/DB 由来の string なので cast」という役割分担が明確で JSDoc も理由を説明済み。→ **許容（意図的トレードオフ）**。

### Notes（要点）
- ping ラッパの reason→error 変換が `exactOptionalPropertyTypes` 下で正しい（anthropic 直 forward、openai/gemini は成功時 error field 不在）。旧 dispatcher と同一 shape で挙動不変。
- baseURL 吸収が現挙動と不変（`toOpenAIConfig` の null/空文字→省略、gemini/anthropic は無視）。
- 依存方向 clean（registry→barrel は値、barrel→registry は `import type` のみ、値循環なし、messagesClient へ逆流なし）。
- スコープ外変更の混入なし（adapter 内部・port 契約・factory 外部 signature 不変）。

## Application / DI

### Blockers
なし

### Warnings
- **[D-W-001]** `lookupProviderAdapter` 経由のため `Record<LLMProviderId, ProviderAdapter>` の網羅性 INVARIANT が呼び出し側に伝播せず、到達不能 undefined ガードが残る。入力が string 由来である以上正しい設計判断で、コメントで明示済み。→ **許容（A-W-001 と同一論点）**。

### Notes（要点）
- factory 外部 API 不変、unsupported throw prefix（LLM/OCR/PDF）維持。
- dispatcher 挙動不変（空 apiKey ガード・latency・maskSecrets・error 省略時 field 有無）。
- `resolveConsumerLlmConfig` は export 付与のみ（I/O・優先順位ロジック不変）。
- `LLMFactoryConfig.baseURL` の `string|null` 化は拡大方向で呼び出し側互換。
- INVARIANT コメント更新が実態と一致。レイヤー依存方向健全。

## Test

### Blockers
なし

### Warnings
- **[T-W-001]** barrel 固有ロジック（openai `toOpenAIConfig` の null/空文字→省略、openai/gemini の reason→error）が dispatcher テスト経由でしか担保されず、`registry.test.ts` が薄い。→ **修正対象**: registry.test.ts に barrel 単体の直接 assertion を追加。
- **[T-W-002]** `registry.test.ts` の ping テストが実ネットワーク fetch に依存（`timeoutMs:1` で AbortError 誘発）。unit test の純粋性が損なわれ、CI のネット遮断環境で挙動が変わりうる。アサーションも `typeof result.ok === "boolean"` と弱い。→ **修正対象**: `pingXxx` を `vi.mock` し shape を厳密 assert。
- **[T-W-003]** `lookupProviderAdapter("typo") → undefined` の契約が直接テストされていない。→ **修正対象**: registry.test.ts に追加。

### Notes（要点）
- 受け入れ基準「既存全件 PASS（挙動不変）」を満たす。factory test / connectionTester test が回帰防波堤として機能。
- W-I-005 達成（`resolveConsumerLlmConfig` 直呼びで env override を `resolved.baseURL` 直接 assert、env非空>DB / env未設定→DB / env空文字→DB の 3 ケース網羅）。
- **[T-N-001]** PR 説明・plan.md・testing.md の件数記載（1786/362, 1788/363）が実測（2950/528）と乖離。合否に影響しないが要訂正。
- `.only`/`.skip`/`.todo` の混入なし。

---

## 仕分け

- **修正する（このラウンドで対応）:** T-W-001 / T-W-002 / T-W-003（すべて `registry.test.ts` 単一ファイルに閉じる）、T-N-001（PR 説明・docs の件数訂正）
- **許容（修正不要）:** A-W-001 / D-W-001 — env/DB 由来 string を runtime lookup するための意図的トレードオフで、網羅性は registry 定義時に `Record<LLMProviderId, ProviderAdapter>` で compile-time 保証済み。JSDoc/コメントで明示されており、両レビュアーとも「対応不要」と判断。

## Design Decisions

特になし（plan.md / adr.md で既出の判断の範囲内）。
