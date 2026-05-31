# 動作確認計画 — Issue #140: provider-registry pattern for adapter factories

**Issue:** #140
**作成日:** 2026-06-01

---

## 確認環境

本 Issue は LLM adapter factory / dispatcher の純粋な構造リファクタで、UI・ランタイム挙動の変更を伴わない。確認は自動テストと型チェックで完結する（ブラウザでの手動確認は不要）。

### 検証環境の起動

ブラウザ検証は不要。確認は以下のコマンドのみ:

```bash
pnpm typecheck                          # tsgo --noEmit（型整合 W-A-004 解消・registry 型保証の確認）
./node_modules/.bin/biome lint ./app    # lint（rtk による biome 改変回避のため直接実行 — MEMORY 参照）
./node_modules/.bin/biome format ./app  # format:check 相当
pnpm test:unit                          # vitest run --project unit
pnpm test:integration                   # vitest run --project integration
```

### デプロイ方法

なし（検証環境のみで確認できる。構造リファクタのためデプロイ前後で挙動は不変）。

## 確認項目

### 1. 型チェックで registry の網羅性・型整合が保証されること

- **目的:** `Record<LLMProvider, ProviderAdapter>` により provider 漏れがコンパイル時検出され、baseURL 型不整合（W-A-004）が解消されていることを確認する。
- **手順:**
  1. `pnpm typecheck` を実行
- **期待結果:** エラーゼロで完了。
- **確認ポイント:** `ProviderAdapter` の `satisfies` 制約、`LLMFactoryConfig` / `ProviderAdapterConfig` の `baseURL: string | null` 統一、barrel の `toOpenAIConfig` が `exactOptionalPropertyTypes` 下で通ること。

### 2. factory の外部 API と挙動が不変であること

- **目的:** `createLLMProvider` / `createOCRProvider` / `createPDFExtractor` が registry 化後も同一の port 実装を返し、unsupported provider で種別別メッセージを throw することを確認する。
- **手順:**
  1. `pnpm test:unit` を実行
- **期待結果:** `llmProviderFactory.test.ts` が全件 PASS。
- **確認ポイント:** 3 provider × 3 関数の instanceof 検証、unsupported provider の throw メッセージ prefix（`Unsupported LLM provider:` / `OCR` / `PDF`）が維持されていること。

### 3. dispatcher の ping 正規化が不変であること

- **目的:** `HttpLLMConnectionTester.ping` が registry 経由でも同一の `{ ok, latencyMs, error? }` を返すことを確認する。
- **手順:**
  1. `pnpm test:unit` を実行
- **期待結果:** `llmConnectionTester.test.ts` が全件 PASS。
- **確認ポイント:** baseURL null → field 省略、`reason`→`error` 変換、`error` 無し→field 無し、`maskSecrets` 適用、空 apiKey ガードが維持されていること。

### 4. env baseURL override の実効性が assertion されること（W-I-005）

- **目的:** export 化した `resolveConsumerLlmConfig` を直接呼び、env による baseURL override が `resolved.baseURL` に反映されることを確認する。
- **手順:**
  1. `pnpm test:integration` を実行
- **期待結果:** `createConsumerContainer.integration.test.ts` の新規ケースが PASS。
- **確認ポイント:** env > DB > Stub の優先順位、特に `ADMIN_LLM_BASE_URL` override が `resolved.baseURL` に直接反映されること。

## エッジケース・異常系

### 1. unsupported provider

- **目的:** registry に存在しない provider 文字列が来た場合の throw / outcome が現状と同じであることを確認する。
- **手順:** `pnpm test:unit`（factory の unsupported ケース）
- **期待結果:** factory は種別別メッセージで throw。dispatcher は型上到達不能だが undefined ガードで `{ ok: false, error: "Unsupported LLM provider: ..." }` 相当を返す。

## 既存機能への影響確認

- LLM / OCR / PDF を使う ingestion 経路（consumer worker）・admin の接続テスト UI は挙動不変であるべき。既存 1786 unit + 362 integration が全件 PASS することで担保する。

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラーゼロ
- [ ] `./node_modules/.bin/biome lint ./app` / `format ./app` がエラーゼロ
- [ ] `pnpm test:unit` 全件 PASS（registry 化前の件数を維持）
- [ ] `pnpm test:integration` 全件 PASS（W-I-005 の新規ケース含む）
- [ ] `llmProviderFactory.test.ts` / `llmConnectionTester.test.ts` が緑（回帰の主防波堤）
