# 実装計画 — Issue #96: `createRequestContainer` の `as unknown as RequestContainer` キャストを撤廃し、未配線ポートをコンパイル時に検出可能にする

**Issue:** #96
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

`app/core/application/di/serverCloudflare.ts` の `createRequestContainer` が末尾で `as unknown as RequestContainer` キャストしているため、`RequestContainer` 型が要求する 11 ポートが未配線のまま型システムを通過している。Issue #59 / PR #95 は `usageMetricsProvider` だけ単発配線で暫定対応したが、同種の未配線ポートが残っており、対応する usecase 経路に到達した時点で `TypeError: Cannot read properties of undefined (reading '...')` が再発する潜在リスクがある。

本Issueでは:

1. `as unknown as RequestContainer` キャストを撤廃し、object literal の末尾を `satisfies RequestContainer` で受ける（→ 今後 `RequestContainer` にポートが追加された場合もコンパイル時に検出される）
2. 全 11 ポートを既存 adapter（Stub / 既存実装）で配線する
3. typecheck が通る状態で `RequestContainer` の全フィールドが配線済みになる
4. 既存の admin / 取り込み / エクスポート 動線が runtime で TypeError を出さない

## スコープ

### 含まれるもの

- `createRequestContainer` の return literal を `satisfies RequestContainer` で型検査可能にする
- 11個の未配線ポート（`objectStorage`, `llmProvider`, `ocrProvider`, `speechRecognitionProvider`, `officeExtractor`, `pdfExtractor`, `tempFileStorage`, `promptResolver`, `secretBox`, `llmConnectionTester`, `adminSettingsEnv`）の配線
- 既存 adapter で配線できないポート（`objectStorage`, `tempFileStorage`, `llmProvider`, `secretBox`）に対する MVP Stub / Null 実装の新規追加（既存ファイルに append）
- `ServerEnv` / `RequestServerConfig` への optional な secret/env 追加（`SECRET_BOX_MASTER_KEY?`, `ADMIN_LLM_API_KEY?`）
- DI smoke test の追加（`__tests__/serverCloudflare.test.ts` に append）

### 含まれないもの

- `wrangler.toml` への R2 binding / secrets の追加（本番デプロイ作業として別Issue）
- `AnthropicLLMProvider` 等の実 adapter 配線（admin settings 駆動の lazy resolution が必要なので別Issue）
- `RequestContainer` の構造変更（on-demand 化、sub-container 分離）
- テストハーネス側（`__tests__/helpers.ts`）の変更（既に全ポート配線済み）
- ingestion / media / export 系 usecase の機能実装

## 真の未配線ポート一覧

`createRequestContainer` の return literal と `RequestContainer` 型の差分から確定:

| ポート | 既存 adapter | 配線方法 |
|---|---|---|
| `objectStorage` | `R2ObjectStorage`（R2 binding 必須） | `StubObjectStorage`（新規・既存ファイル append） |
| `llmProvider` | `AnthropicLLMProvider`（apiKey/model 必須） | `StubLLMProvider`（新規・既存ファイル append） |
| `ocrProvider` | `StubOCRProvider` | 既存 Stub を `new` |
| `speechRecognitionProvider` | `StubSpeechRecognitionProvider` | 既存 Stub を `new` |
| `officeExtractor` | `StubOfficeExtractor` | 既存 Stub を `new` |
| `pdfExtractor` | `StubPDFExtractor` | 既存 Stub を `new` |
| `tempFileStorage` | `R2TempFileStorage`（R2 binding 必須） | `StubTempFileStorage`（新規・既存ファイル append） |
| `promptResolver` | `D1PromptResolver` | `new D1PromptResolver(db)` |
| `secretBox` | `WebCryptoSecretBox`（master key 必須） | env から条件付きで構築 + 未設定時 `NullSecretBox`（新規・既存ファイル append） |
| `llmConnectionTester` | `HttpLLMConnectionTester` | `new HttpLLMConnectionTester()` |
| `adminSettingsEnv` | 値オブジェクト | `{ apiKey: env.ADMIN_LLM_API_KEY ?? null }` |

## 実装ステップ

### 1. `StubLLMProvider` を新規追加

- **対象ファイル:** `app/core/adapters/llm/llmProvider.ts`（既存 `AnthropicLLMProvider` の隣に append）
- **変更内容:** `LLMProvider` を実装する `StubLLMProvider` クラスを追加。`structureToHtml` / `suggestMetadata` の両方で `BusinessRuleError(IngestionErrorCode.UnsupportedFormat, "llm_not_implemented_in_mvp")` を throw（既存 `StubOCRProvider` / `StubOfficeExtractor` / `StubPDFExtractor` / `StubSpeechRecognitionProvider` と同じシグネチャ・コード）。
- **理由:** `AnthropicLLMProvider` は admin が D1 に保存した `LLMConfig`（apiKey/model）が必須で、container 構築時には実体化できない。既存 `Stub*` 群は `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)` を投げて ingestion worker のリトライポリシー上 **non-retryable** として `failed` 遷移させる設計。`LLMUnavailableError` は port doc 上 retryable 扱いで worker が無駄に再試行するため不適切。Stub 群全体でエラー種別を統一する。

### 2. `StubObjectStorage` を新規追加

- **対象ファイル:** `app/core/adapters/cloudflare/r2ObjectStorage.ts`（既存 `R2ObjectStorage` の隣に append）
- **変更内容:** `ObjectStorage` を実装する `StubObjectStorage` クラスを追加。`put` / `get` / `stat` / `delete` / `presignDownload` / `presignUpload` の全メソッドを `async` で実装し、`StorageUnavailableError("object_storage_not_configured")` を throw（async なので Promise rejection になり port の `Promise<...>` シグネチャと整合）。未使用パラメータは `_` プレフィックス（`noUnusedParameters: true` 対応）。
- **理由:** `wrangler.toml` に R2 binding が未宣言なので `R2ObjectStorage` を即時投入不可。media / export 系 usecase に到達した時のみ明示的に fail する。

### 3. `StubTempFileStorage` を新規追加

- **対象ファイル:** `app/core/adapters/cloudflare/r2TempFileStorage.ts`（既存 `R2TempFileStorage` の隣に append）
- **変更内容:** `TempFileStorage` を実装する `StubTempFileStorage` クラスを追加。全メソッドを `async` で実装し、`TempFileStorageUnavailableError("temp_file_storage_not_configured")` を throw。未使用パラメータは `_` プレフィックス。
- **理由:** R2 binding 未宣言。ingestion 経路に到達した時のみ fail する。

### 4. `NullSecretBox` を新規追加

- **対象ファイル:** `app/core/adapters/security/secretBox.ts`（既存 `WebCryptoSecretBox` の隣に append）
- **変更内容:** `SecretBox` を実装する `NullSecretBox` クラスを追加。`encrypt` / `decrypt` の両方で `SecretBoxError(SecretBoxErrorCode.KeyUnavailable, "SECRET_BOX_MASTER_KEY is not configured")` を throw する（既存 `WebCryptoSecretBox.decodeMasterKey` が空文字・不正形式時に投げる `KeyUnavailable` と意味的に揃える）。
- **理由:** `SECRET_BOX_MASTER_KEY` が env 未設定の場合に container 構築段階で fail-fast すると、全リクエストが 500 になり `/admin` も含めて落ちる。`NullUsageMetricsProvider` と同じ思想で「未設定でも UI は描画、操作時に明示エラー」を採用する。`WebCryptoSecretBox` の master key 設定済みなら本実装を、未設定なら `NullSecretBox` を使う。なお master key が **設定されているが不正値** の場合は `WebCryptoSecretBox` のコンストラクタが eager に throw する仕様で、これは fail-fast が正しい挙動（運用ミスを即座に検出するため）。

### 5. `ServerEnv` / `RequestServerConfig` を拡張

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `ServerEnv` に optional な `SECRET_BOX_MASTER_KEY?: string` と `ADMIN_LLM_API_KEY?: string` を追加
  - `RequestServerConfig` に `secretBoxMasterKey?: string` と `adminLlmApiKey?: string` を追加
  - `readRequestServerConfig` で env → config に conditional spread（既存 `relay` / `adminSetupToken` パターン踏襲、`exactOptionalPropertyTypes` 違反を回避）
- **理由:** secret の読み込み経路は transport boundary（`readRequestServerConfig`）に集約する。`wrangler.toml` の更新は本Issueでは行わず、env 経由の optional 化にとどめる（後続 PR で wrangler に secret を足せば自動で実 adapter に切り替わる）。R2 binding は使わないので追加しない。

### 6. `createRequestContainer` に 11 ポート全配線 + キャスト撤廃

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - destructure 句を拡張: `const { binding: _binding, relay, waitUntil, adminSetupToken, secretBoxMasterKey, adminLlmApiKey, ...appConfig } = config;`（新規追加の `secretBoxMasterKey` / `adminLlmApiKey` を必ず destructure に含める。`...appConfig` の rest spread に漏れ込むと `config: appConfig satisfies AppConfig` が excess property で typecheck エラーになるため必須）
  - 11 ポートを以下のように配線:
    - `objectStorage: new StubObjectStorage()`
    - `llmProvider: new StubLLMProvider()`
    - `ocrProvider: new StubOCRProvider()`
    - `speechRecognitionProvider: new StubSpeechRecognitionProvider()`
    - `officeExtractor: new StubOfficeExtractor()`
    - `pdfExtractor: new StubPDFExtractor()`
    - `tempFileStorage: new StubTempFileStorage()`
    - `promptResolver: new D1PromptResolver(db)`
    - `secretBox: secretBoxMasterKey ? new WebCryptoSecretBox(secretBoxMasterKey) : new NullSecretBox()`
    - `llmConnectionTester: new HttpLLMConnectionTester()`
    - `adminSettingsEnv: { apiKey: adminLlmApiKey ?? null }`
  - return literal 末尾の `} as unknown as RequestContainer;` を `} satisfies RequestContainer;` に変更
  - 関数の戻り型注釈 `: RequestContainer` は残す（呼び出し側の推論精度を保つ）
- **理由:** Issue の核心。`satisfies` により未配線がコンパイル時に検出される状態を作る。配線方法は既存 `__tests__/helpers.ts` の `createTestContainer` の構造を参考にする。

### 7. DI smoke test を追加

- **対象ファイル:** `app/core/application/di/__tests__/serverCloudflare.test.ts`（既存ファイルに append）
- **環境前提:**
  - 既存テストは node-pool で実行される（既存 `readRelayTuning` / `readPruneTuning` 系と同じ）
  - `createRequestContainer` は `getDatabase(config.binding)` で drizzle wrapper を生成するのみ（queries は lazy なので fake `D1Database` = `{} as unknown as D1Database` でも instantiate は通る）
  - `WebCryptoSecretBox` の round-trip テストは `globalThis.crypto.subtle` 依存（Node 19+ 前提、`vitest` の node ランタイムで動く）
- **変更内容:**
  - `createRequestContainer` の smoke test を追加: 最小 config で呼んで戻り値の全フィールドが non-undefined であることを `Object.entries(container).forEach(([k, v]) => expect(v, k).toBeDefined())` 形式のループ assertion で検証（フィールド列挙ではなく構造アサーション）
  - `secretBox` の挙動:
    - master key 未設定で `NullSecretBox` が返り `encrypt` 呼び出しで `SecretBoxError(KeyUnavailable)` を throw
    - 設定済み（zero key `"AAAA...="` 等）で `WebCryptoSecretBox` が encrypt → decrypt round-trip できる
  - `adminSettingsEnv.apiKey`: `ADMIN_LLM_API_KEY` 不在で `null`、設定済みで該当値
  - Stub の throw 動作: `objectStorage.put()` で `StorageUnavailableError`、`tempFileStorage.put()` で `TempFileStorageUnavailableError`、`llmProvider.suggestMetadata()` で `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)` を throw
- **理由:** 将来 `RequestContainer` にポートが追加された場合、`satisfies` でコンパイル時検出される。加えて smoke test も追従させることで配線忘れを CI で多層的に防ぐ。ループ assertion 形式により field 追加時のテスト保守コストが上がらない。

### 8. typecheck / lint / format / test 実行

- `pnpm typecheck && pnpm lint:fix && pnpm format`（CLAUDE.md 指定の手順）
- `pnpm test:unit` で既存テストが全て PASS することを確認
- `pnpm test:integration` も実行（環境が許せば）

## 設計判断

詳細は `adr.md` 参照。サマリーは以下:

- **ADR-001**: Stub adapter は既存ファイル（`llmProvider.ts` / `r2ObjectStorage.ts` / `r2TempFileStorage.ts` / `secretBox.ts`）に append する。既存の `Stub*` 群（OCR/Office/PDF/Speech）と同じ「実装と Stub が同居」パターンに揃え、新規ファイルは作らない。
- **ADR-002**: `secretBox` 未設定時は `NullSecretBox` fallback を採用し、container 構築時 fail-fast はしない。`NullUsageMetricsProvider` と同じ思想で「未設定でも UI は描画、操作時に明示エラー」。
- **ADR-003**: `ServerEnv` 拡張は最小限（`SECRET_BOX_MASTER_KEY?` / `ADMIN_LLM_API_KEY?` のみ）。R2 binding は本Issueでは追加せず常に Stub 配線（YAGNI、別Issue で wrangler 更新）。
- **ADR-004**: `RequestContainer` 構造変更（on-demand 化）はしない。完了条件「全フィールド配線済み」を満たす最小変更にとどめる。

## リスクと注意点

- **既存動線のエラー種別の変化**: 現状 `as unknown as` 下では未配線ポートに触ると `TypeError` で 500 になる。Stub 配線後は `StorageUnavailableError` / `LLMUnavailableError` / `SecretBoxError` 等の明示的な error type で fail する。完了条件「TypeError を出さない」は満たすが、ユーザー体験上の 500 自体は消えない（機能実装は別Issue）。
- **`SECRET_BOX_MASTER_KEY` 未設定での admin/llm 経路**: admin が LLM api key 保存・テストを実行すると `SecretBoxError` が出る。これは正しい挙動（鍵未設定で暗号化できない）。
- **`exactOptionalPropertyTypes`**: 既存の `relay` / `adminSetupToken` の conditional spread パターンを新規 env でも厳密に踏襲。`secretBoxMasterKey: undefined` を直接書かない。
- **テストハーネスとの差**: test harness（`createTestContainer`）は in-memory / fake で全ポートを真に配線するが、production runtime では多くが Stub。test と production の挙動差は意図的（test では真の機能を検証するため）。
- **PR #95 の `usageMetricsProvider`**: 既に `NullUsageMetricsProvider` で配線済み。本Issueでは触らない。
- **`SystemError` vs domain error**: `Storage*Error` / `LLMUnavailableError` / `SecretBoxError` は既に domain port 側で定義済み。新たに `SystemError` 系を作る必要はない。

## テスト方針

### 自動テスト

- **typecheck**: `pnpm typecheck` が `satisfies RequestContainer` で通る（→ 全フィールド配線済みの compile-time guarantee）
- **DI smoke test（新規）**: `createRequestContainer` の戻り値全フィールド non-undefined、Stub の throw 動作、`secretBox` の env 分岐、`adminSettingsEnv.apiKey` の env 分岐
- **既存 unit / integration test**: regression なし（test harness は別経路で配線済み）

### ブラウザ手動検証

- `/admin` / `/admin/metrics` が 200 で描画される（PR #95 の挙動維持）
- `/admin/llm` が 200 で描画される（既存 `LLMConfig` 未保存の初期状態。`AdminSettingsService` がページ描画時点で decrypt を呼ばないため `NullSecretBox` が副作用を出さないことの確認）
- `/admin/registration` 等の他 admin ページが 200 で描画される
- DevTools コンソール・サーバログに `Cannot read properties of undefined` 系の TypeError が出ない
- media upload / export job 等を試行すると `StorageUnavailableError` 系の明示エラー（500 にはなるが TypeError ではない）

## レビュー反映

### 修正した点

- **[P-001 coverage] / [P-003 feasibility]**: `StubLLMProvider` のエラーを `LLMUnavailableError`（retryable）から `BusinessRuleError(IngestionErrorCode.UnsupportedFormat, "llm_not_implemented_in_mvp")`（non-retryable）に変更。既存 `Stub*` 群と統一し、ingestion worker のリトライ動作を整合。実装ステップ #1 を更新。
- **[P-001 feasibility]**: 実装ステップ #6 に destructure 句の明示を追加。`secretBoxMasterKey` / `adminLlmApiKey` を `...appConfig` の rest spread から除外しないと `satisfies AppConfig` で typecheck が落ちる。
- **[P-002 coverage]**: ブラウザ手動検証に「`/admin/llm` の 200 描画確認」を追加。`AdminSettingsService` が描画時点で decrypt を呼ばない前提を明文化。
- **[P-002 feasibility]**: 実装ステップ #7 のテスト方針に環境前提（fake `D1Database`、drizzle lazy、Node 19+ の crypto.subtle）を明記。

### 取り込んだ改善提案

- **[S-001 coverage] / [S-001 feasibility]**: 実装ステップ #4 で `SecretBoxError(SecretBoxErrorCode.KeyUnavailable, "SECRET_BOX_MASTER_KEY is not configured")` を明示。
- **[S-002 feasibility]**: smoke test を field 列挙ではなく `Object.entries(...).forEach` のループ assertion に統一（field 追加時のテスト保守コスト削減）。
- **[S-003 feasibility]**: ADR-002 に「未設定（fallback）」と「不正値（fail-fast）」の挙動差を実装ステップ #4 と ADR-002 で明文化。
- **[S-004 feasibility]**: 実装ステップ #2 / #3 で Stub メソッドを `async` 実装にし、unused param に `_` プレフィックス（`noUnusedParameters: true` 対応）を明記。
- **[S-003 coverage]**: production Stub と test Fake の意図的な挙動差を **ADR-005** として独立。

### 見送った提案とその理由

- **[S-001 coverage] (step 0 の数値検証)**: 実装ステップ #6 / #8 の `pnpm typecheck` 実行で同等の検証が行われるため、独立ステップとしては冗長。計画の「真の未配線ポート一覧」表で既に確定済み。
- **[S-004 coverage] (wrangler.toml ガード)**: ADR-003 で「R2 binding は本Issueでは追加しない」を明記しており、レビュー時のスコープ判定には十分。コミット粒度ルールまで書くと plan が冗長になる。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ | × | × |
| 取り込んだ点 | Stub 同居パターン、`NullSecretBox` fallback | DI smoke test 必須化 | R2 binding を ServerEnv に追加しない |
| 主な差異 | R2 env 全部追加を縮小 | Stub の serverCloudflare 内同居を不採用（既存パターン優先） | NullSecretBox 採用で fail-fast を回避 |
