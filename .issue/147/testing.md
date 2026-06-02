# 動作確認計画 — Issue #147: align assertEnvOverride apiKey trim with ADR-002

**Issue:** #147
**作成日:** 2026-06-03

---

## 確認環境

本 Issue の変更は `app/core/domain/adminSettings/service.ts` の純粋な domain ロジック（env.apiKey presence 判定）とそのユニットテストのみ。UI 操作・画面遷移を伴わないため、ブラウザ検証ではなくユニットテストで担保する。

### 検証環境の起動

ブラウザ検証は不要。以下のユニットテストで確認する。

```bash
pnpm test:unit
```

対象を絞る場合:

```bash
./node_modules/.bin/vitest run app/core/domain/adminSettings/__tests__/service.test.ts
```

### デプロイ方法

なし（domain ロジックのユニットテストのみで確認できる）。

## 確認項目

### 1. whitespace-only env.apiKey が「設定あり」として扱われる

- **目的:** `length === 0` 判定により `"   "`（whitespace のみ）が presence あり扱いになることを確認する
- **手順:**
  1. `pnpm test:unit` を実行する
  2. `assertEnvOverride` の whitespace ケースのテストを確認する
- **期待結果:** `apiKeySource: "db"` + `apiKey: "   "` のとき、戻り値が `apiKeySource === "env"` かつ `apiKeyCiphertext === null` になる
- **確認ポイント:** 旧テスト（`toBe(cfg)`）が新仕様に反転して PASS していること

### 2. env.apiKey === null の挙動が不変

- **目的:** null（env 未設定）時の挙動が従来通りであることを確認する
- **手順:**
  1. `pnpm test:unit` を実行する
- **期待結果:** db source + null は config 変更なし（`toBe(cfg)`）、env source + null は `EnvOverrideMissingKey` を throw する既存ケースが PASS する

## エッジケース・異常系

### 1. env source 宣言 + whitespace apiKey

- **目的:** `apiKeySource: "env"` 宣言時に whitespace apiKey が渡ると throw しなくなる（presence あり扱い）ことを確認する
- **手順:**
  1. service.ts のロジックを読み、`env.apiKey.length === 0` が false（whitespace）→ env source ならそのまま return される経路を確認する
- **期待結果:** `EnvOverrideMissingKey` は throw されない。ADR-002 の意図通り。

## 既存機能への影響確認

- `valueObject.ts` / `updateLLMConfig.ts` / `view.ts` / `serverCloudflare.ts` は変更しないが、4 field 共通の `length > 0` 判定に揃うことで整合する。`pnpm test` 全体がグリーンであることで回帰なしを確認する。

## 確認チェックリスト

- [ ] `pnpm test:unit` が全 PASS（反転した whitespace ケース含む）
- [ ] `pnpm typecheck` が通る
- [ ] `pnpm lint` が通る
- [ ] service.ts:49 の判定が `env.apiKey.length === 0` になっている
