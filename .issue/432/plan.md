# 実装計画 — Issue #432: testLLMConnection の env apiKey 判定も length>0 に揃える (ADR-002 残存不整合)

**Issue:** #432
**作成日:** 2026-06-03
**複雑度:** 小規模

---

## 目的

`testLLMConnection` の env apiKey presence 判定を `envApiKey.trim().length > 0` から
`envApiKey.length > 0` に変更し、ADR-002（`length > 0`、trim しない、4 field 共通）を
env apiKey presence 判定の全経路（DI / view.ts / updateLLMConfig / `assertEnvOverride`）で
一貫させる。#147 で潰した admin/consumer 乖離と同種の細い再発リスク（whitespace-only env key）を
接続テスト経路からも除去する。

## スコープ

### 含まれるもの
- `app/core/application/adminSettings/testLLMConnection.ts:88` の
  `envApiKey.trim().length > 0` → `envApiKey.length > 0`
- whitespace-only env key の回帰テスト追加（既存 integration test の
  `describe("testLLMConnection")` ブロック）

### 含まれないもの
- 同ファイル 97行目 `resolvedKey.trim().length === 0`（解決後の鍵が実質空かのガード。
  env presence 判定とは別文脈。Issue 本文で明示的にスコープ外）
- 他経路（DI / view.ts / updateLLMConfig / `assertEnvOverride`）は #147 / #143 で既に
  `length > 0` 化済み。本 Issue では変更しない

## 実装ステップ

### 1. presence 判定を length>0 に変更

- **対象ファイル:** `app/core/application/adminSettings/testLLMConnection.ts:88`
- **変更内容:** `if (envApiKey !== null && envApiKey.trim().length > 0)` →
  `if (envApiKey !== null && envApiKey.length > 0)`
- **理由:** ADR-002「trim しない、4 field 共通」と一致させる。
  `serverCloudflare.ts:874` の `envApiKey !== undefined && envApiKey.length > 0` と同 semantics。

### 2. whitespace-only env key の回帰テスト追加

- **対象ファイル:** `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts`
  （`describe("testLLMConnection")` 内）
- **変更内容:** DB に有効な api key を永続化（`updateLLMConfig`, env なし）した上で、
  `adminSettingsEnv.apiKey = "   "`（whitespace-only）で `testLLMConnection` を呼ぶケースを追加。
  - 修正後: env が presence ありと判定され（`length > 0`）env 値が勝つ → resolvedKey は
    whitespace → 97行目の実質空ガードに掛かり `ok=false` /
    `"No api key available for the configured LLM provider"`、tester は **未呼出**（DB へフォールバックしない）。
  - 修正前: `trim().length > 0` が false → DB へフォールバック → tester が呼ばれ `ok=true` となり、
    このテストは失敗する（＝回帰を検出できる）。
- **理由:** 受け入れ基準「whitespace ケースの回帰テストを追加」。env presence 判定が
  length ベースで DB へフォールバックしないことを保証する。

## 設計判断

技術的な設計判断（トレードオフのある選択）はなし。ADR-002 既定方針への単純な追従。adr.md は作成しない。

## リスクと注意点

- 97行目の実質空ガードは変更しない。whitespace-only env key は presence ありと判定された後に
  「No api key available」で弾かれる挙動になる（DB へフォールバックしない）— これが本 Issue の意図。
- 既存の `describe("testLLMConnection")` の 4 ケースは env key が非空文字列なので影響なし。

## テスト方針

- `pnpm test:integration`（cloudflare:test ワーカー環境）で
  `adminSettings.integration.test.ts` の新規回帰テストを含む `testLLMConnection` 群が通ること。
- `pnpm typecheck && pnpm lint:fix && pnpm format`。

## レビュー履歴

小規模Issueのためレビューループはスキップ（issue-planner の小規模フロー）。
