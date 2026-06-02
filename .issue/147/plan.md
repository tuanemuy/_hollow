# 実装計画 — Issue #147: refactor(adminSettings): align assertEnvOverride apiKey trim with ADR-002 (length>0)

**Issue:** #147
**作成日:** 2026-06-03
**複雑度:** 小規模

---

## 目的

`AdminSettingsService.assertEnvOverride` の env.apiKey presence 判定を `env.apiKey.trim().length === 0` から `env.apiKey.length === 0` に変更し、ADR-002（`length > 0`、trim しない、4 field 共通）に揃える。これにより whitespace-only な `ADMIN_LLM_API_KEY` のときに admin UI（「env で固定中」表示）と save 経路（`assertEnvOverride`）で生じる細い乖離を解消する。Issue #143 の ADR-008 で follow-up として記録された方針の実施。

## スコープ

### 含まれるもの

- `app/core/domain/adminSettings/service.ts:49` の判定を `env.apiKey === null || env.apiKey.length === 0` に変更
- 既存テスト `app/core/domain/adminSettings/__tests__/service.test.ts:83 "treats whitespace-only env.apiKey as missing"` を新仕様（whitespace は「設定あり」扱い）に合わせて反転

### 含まれないもの

- `app/core/application/adminSettings/testLLMConnection.ts:88`（`envApiKey.trim().length > 0`）— Issue 本文の影響範囲に含まれず、接続テスト経路は別文脈。スコープ外。
- DI（`serverCloudflare.ts`）/ view.ts / updateLLMConfig.ts — 既に `length > 0` で統一済み。変更不要。
- `valueObject.ts:224` の `apiKeyCiphertext.trim()` — ciphertext の判定であり env presence 判定とは別。スコープ外。

## 実装ステップ

### 1. service.ts の判定を length ベースに変更

- **対象ファイル:** `app/core/domain/adminSettings/service.ts`
- **変更内容:** 49行目 `if (env.apiKey === null || env.apiKey.trim().length === 0)` を `if (env.apiKey === null || env.apiKey.length === 0)` に変更
- **理由:** ADR-002「trim しない、4 field 共通」に揃え、DI / view / updateLLMConfig / consumer 経路と一貫させる

### 2. 既存テストを新仕様に合わせて反転

- **対象ファイル:** `app/core/domain/adminSettings/__tests__/service.test.ts`
- **変更内容:** `"treats whitespace-only env.apiKey as missing"`（83行目）を「whitespace-only env.apiKey は『設定あり』として env override を強制する」テストに書き換える。`apiKeySource: "db"` + `apiKey: "   "` のとき、戻り値が `apiKeySource === "env"` かつ `apiKeyCiphertext === null` になることを検証する。テスト名も実態に合わせて更新する。
- **理由:** `length === 0` 判定では `"   "`（length 3）は presence あり扱いになり、db source なら env override が強制されるため、旧期待値（`toBe(cfg)`）は成立しない

## 設計判断

技術的な設計判断（トレードオフのある技術選択）はなし。ADR-002 / ADR-008 で既に方針確定済みのため、本 Issue 専用の adr.md は作成しない。

## リスクと注意点

- whitespace-only apiKey を「設定あり」として扱うことで、`apiKeySource === "env"` 宣言時に `EnvOverrideMissingKey` を throw しなくなる（whitespace が env key として渡る）。これは ADR-002 の意図通り（consumer 経路と一致）で、whitespace を意図的に env apiKey に設定するのは非現実的なため実害なし。
- `null` 判定は維持するため、env 未設定（null）時の挙動は不変。

## テスト方針

- `pnpm test:unit` で `service.test.ts` がグリーンになること（反転したケース含む全6ケース）
- `pnpm typecheck && pnpm lint` で型・lint が通ること
- 純粋な domain ロジック変更でブラウザ操作要素なし → ブラウザ検証は対象外（後述 testing.md 参照）
