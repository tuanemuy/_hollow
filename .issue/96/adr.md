# ADR — Issue #96: `createRequestContainer` のキャスト撤廃と未配線ポート配線

## ADR-001: Stub adapter は既存ファイルに append する

### Status
Proposed

### Context

`createRequestContainer` で配線する 11 ポートのうち、Cloudflare runtime に実 adapter が無いもの（`objectStorage`, `tempFileStorage`, `llmProvider`, `secretBox`）には Stub / Null 実装が必要。これらの実装をどこに置くかの選択肢:

- (A) 既存ファイル（`r2ObjectStorage.ts`, `r2TempFileStorage.ts`, `llmProvider.ts`, `secretBox.ts`）に append
- (B) `serverCloudflare.ts` 内に module-scoped で閉じる
- (C) 新規 module（`unconfigured.ts` 等）に集約

### Decision

(A) を採用。既存ファイルに append する。

### Consequences

- 良い点:
  - 既存の `Stub*` 群（OCR/Office/PDF/Speech — `app/core/adapters/llm/*Provider.ts` に同居）と同じ「実装と Stub が同居」パターンに揃う
  - `NullUsageMetricsProvider` も `app/core/application/ports/usageMetricsProvider.ts` に export singleton として置かれており、port 側に Null 実装を併置する規約と整合
  - 新規ファイルを作らないため、レビューでファイル数の膨張がない
- トレードオフ:
  - 「Cloudflare 配線で R2 未宣言の暫定対応」というローカルな事情が adapter 側に滲み出る（エージェント2が懸念した点）
  - ただし将来 R2 binding を導入する PR で Stub を削除すれば自然に解消するため、永続的な負債にはならない

---

## ADR-002: `secretBox` 未設定時は `NullSecretBox` fallback を採用し fail-fast しない

### Status
Proposed

### Context

`secretBox` は admin が LLM api key を D1 に保存する際の暗号化（`AdminSettingsService.updateLLMConfig` with `apiKeySource='db'`）と復号（`TestLLMConnection` 経路）で使用される。master key が未設定の本番デプロイでも `/admin` ページ自体は描画できる必要がある（PR #95 が `usageMetricsProvider` で同じ問題を解いた経緯）。

選択肢:

- (A) `WebCryptoSecretBox.fromEnv(env)` を必須化し、未設定なら container 構築時 throw（fail-fast）
- (B) `NullSecretBox` fallback を採用し、未設定でも container 構築は成功させる（操作時に明示エラー）

### Decision

(B) を採用。`NullSecretBox` を新規追加し、`createRequestContainer` で `secretBoxMasterKey ? new WebCryptoSecretBox(...) : new NullSecretBox()` で分岐する。

### Consequences

- 良い点:
  - master key 未設定の本番でも `/admin` 系の他ページ（registration / metrics / users 等）は描画でき、運用フォールバックが効く
  - `NullUsageMetricsProvider` と同じ思想で port 側の「未設定でも落ちない」契約を一貫させる
  - 開発環境で `.dev.vars` に master key を書き忘れても dev サーバは起動できる
- トレードオフ:
  - master key 未設定状態で admin LLM 設定保存に到達すると `SecretBoxError(KeyUnavailable)` が発生する → これは正しい挙動（鍵が無ければ暗号化できない）
  - 将来「本番では master key 必須化したい」場合は、別 Issue で `readRequestServerConfig` 内で fail-fast に切り替える（本Issueはスコープを限定）

### 未設定 vs 不正値の挙動差

`SECRET_BOX_MASTER_KEY` の状態は 3 つに分かれる:

1. **env に存在しない（unset）** → `secretBoxMasterKey` が `undefined` → `NullSecretBox` を配線（操作時に `SecretBoxError(KeyUnavailable)` を throw）
2. **env に存在し、有効な base64 (32 bytes)** → `new WebCryptoSecretBox(key)` で正常配線
3. **env に存在するが不正値（空文字 / base64 not 32 bytes）** → `WebCryptoSecretBox` のコンストラクタが `decodeMasterKey` 内で eager に throw（`SecretBoxError(KeyUnavailable)`） → `createRequestContainer` 自体が落ち、全リクエストが 500 になる

ケース 3 は意図的に fail-fast にしている（運用ミスを即座に検出するため）。ケース 1 と 3 を分けることで「未設定で運用継続」と「不正値で即時障害検知」を両立させる。

---

## ADR-003: `ServerEnv` 拡張は最小限（secrets のみ）。R2 binding は追加しない

### Status
Proposed

### Context

未配線ポートのうち `objectStorage` / `tempFileStorage` は本来 R2 binding が必要だが、現状 `wrangler.toml` に R2 bucket binding が未宣言。選択肢:

- (A) `ServerEnv` に R2 binding（`OBJECT_STORAGE?: R2Bucket`, `TEMP_FILES?: R2Bucket`）と presign 用の env をまとめて optional 追加し、binding があれば実 adapter、なければ Stub に分岐
- (B) R2 binding は `ServerEnv` に追加せず、常に Stub 配線（master key と admin api key の 2 つだけ optional 追加）

### Decision

(B) を採用。`ServerEnv` には `SECRET_BOX_MASTER_KEY?: string` と `ADMIN_LLM_API_KEY?: string` のみ optional で追加。R2 binding は本Issueでは扱わない。

### Consequences

- 良い点:
  - YAGNI: 本Issue の完了条件は「全フィールド配線済み」「TypeError を出さない」であり、R2 を実際に動かす必要はない
  - 後続 PR で R2 binding を `wrangler.toml` に追加するとき、`ServerEnv` と `createRequestContainer` を一緒に更新する責務範囲が明確
  - 本Issueの diff が小さく保たれ、レビュー容易性が高い
- トレードオフ:
  - R2 binding を投入する後続 PR では `ServerEnv` と `RequestServerConfig` の両方を拡張する必要が出る（本Issueの構造を踏襲するため負担は軽い）

---

## ADR-004: `RequestContainer` の構造変更（on-demand 化）はしない

### Status
Proposed

### Context

Issue 本文の「推奨アプローチ #3」では `RequestContainer` を「本当に全 request で必要なものと on-demand で良いものを分離」する案が示されている。例えば LLM/Storage を `Promise<...>` 化したり、sub-container に分割したり。

### Decision

本Issueでは行わない。`RequestContainer` 型は変更せず、全フィールドを eager に構築する現状の構造を維持する。

### Consequences

- 良い点:
  - 完了条件「全フィールドが配線済み」を満たすには配線するだけで十分
  - usecase / adapter / presentation 全層への波及を避けられる
  - PR を小さく保ち、レビュー容易性を維持
- トレードオフ:
  - cold start で全 Stub を eager に new する（軽量なので 1ms 未満の影響）
  - on-demand 化のメリット（実 adapter の lazy init による startup 軽量化）は別Issueに先送り

---

## ADR-005: production runtime の Stub と test harness の Fake は意図的に挙動差を許容する

### Status
Proposed

### Context

`createRequestContainer`（production runtime, Cloudflare）は未配線ポートに対して **操作時 throw する Stub**（`StubObjectStorage` / `StubTempFileStorage` / `StubLLMProvider` / `NullSecretBox`）を配線する。一方 `createTestContainer`（`app/core/application/__tests__/helpers.ts`）は **真のラウンドトリップ機能を持つ Fake / In-Memory 実装**（`InMemoryObjectStorage` / `FakeTempFileStorage` / `FakeLLMProvider` / `WebCryptoSecretBox(TEST_KEY)`）を配線する。

将来「production と test で同じ Stub を使えば差を埋められるのでは」というレビュー質問が想定される。なぜ production も `InMemoryObjectStorage` を流用しないかを明示する。

### Decision

挙動差を意図的に維持する。production は操作時 throw の Stub、test は真の機能を持つ Fake / In-Memory を採用する。

### Consequences

- 良い点:
  - **test の責務**: usecase / domain ロジックを「真の機能が動く前提」で検証する。`InMemoryObjectStorage` で put → get の round-trip が成立しないと export usecase のテストが書けない。
  - **production の責務**: 未設定の機能が「黙って成功する」のは最悪のシナリオ（データ消失リスク）。production Stub は「呼ばれたら明示的に失敗する」契約で、運用者が機能未設定に気付ける。
  - **fakes/ から prod への import 禁止**: `app/core/application/__tests__/fakes/` 配下は vitest 環境専用。prod runtime から import すると architectural smell（test 依存が prod に滲み出る）。Stub を adapter 配下に置くことでこの境界を保つ。
- トレードオフ:
  - 同じポートに対して 2 種類の MVP 実装が存在することになる（既存 `StubOCRProvider` 等と同じ構造）
  - 将来 R2 binding を投入する PR で production Stub を削除する必要がある（test Fake は維持）
