# ADR — Issue #141: feat(llm): unified error sanitizer for connection-ping / provider responses

## ADR-001: sanitizer の配置レイヤー

### Status

Proposed

### Context

LLM 接続 ping / provider レスポンスの error 文字列を sanitize するモジュールをどのレイヤーに置くか。候補は次の 3 つ:

1. `app/core/application/llm/sanitizeErrorReason.ts`
2. `app/core/adapters/sanitizer/`（既存）に追加
3. `app/lib/sanitizeErrorReason.ts`

`probe` の orchestrator (`HttpLLMConnectionTester`) は application 層にあり、error 正規化は application が担っている。一方で `messagesClient.ts` の `detailSuffix` 組立ては adapter 側で行われる。

### Decision

**`app/core/application/llm/sanitizeErrorReason.ts`（案 1）を採用する。**

理由:

- probe の orchestrator が application 層にあり、error 正規化は application の責務。
- `app/core/adapters/sanitizer/` には既に `htmlSanitizer.ts`（note 本文の HTML body sanitizer）が存在し、責務が違う別物。意味が濁る。
- pure function なので adapter からも問題なく import 可能。CLAUDE.md は `app/lib/` を「全レイヤーから依存可能な構造的 primitive」と定義しているが、LLM provider 固有のエラー語彙を持つ本モジュールは「構造的 primitive」ではないため `app/lib/` は不適切。

### Consequences

- 良い点: application 層から adapter への一方向 import は hexagonal における外向き依存ではなく、pure function 共有の自然な形。**既存の `app/core/adapters/d1/` 配下が既に `@/core/application/errors`, `@/core/application/ports/clock`, `@/core/application/execution/unitOfWork` 等を import している pattern と整合**。adapter（port 実装側）が application が定義した契約を import するのはむしろ port 実装の自然な形であり、CLAUDE.md の依存方向ルール `presentation → application → domain` には抵触しない。
- トレードオフ: なし（既存パターンに沿う）。

### 補足: `SanitizedErrorReason` の位置付け

`SanitizedErrorReason` の値（`timeout`/`network`/`auth_failed`/...）は `lower_snake_case` で偶然 CLAUDE.md の `*ErrorCode` 命名規則と揃っているが、これは **UI 表示用 prefix であり `*ErrorCode` / `kind`-tagged serialized form とは別系統**である。`errorCodeNaming.test.ts` の検査対象外であり、誤って `*ErrorCode` 型に流用しないこと。

---

## ADR-002: dispatcher 最終 fallback sanitize の導入（masking のみ）

### Status

Proposed

### Context

probe 側で sanitize を適用すれば dispatcher (`HttpLLMConnectionTester`) は通過のままで良い。だが将来 provider 追加時に probe で sanitize を忘れた場合、admin UI へ生 message が再び露出するリスクが残る。

初版は「dispatcher で `sanitizeErrorReason` を再適用」案を検討したが、probe 側で既に `toReasonString(sanitizeErrorReason(error))` を通した文字列（例: `"network: fetch failed"`）に対して再度 `sanitizeErrorReason` を適用すると、入力が `Error` インスタンスではなく文字列のため `instanceof Error` ベースの category 判定が `unknown` に落ち、`"unknown: network: fetch failed"` のような二重 prefix を発生させる。冪等性が破綻する。

### Decision

**dispatcher の `ping` 戻り値構築直前で `maskSecrets()` のみを通す薄い防御層を追加する。**

`maskSecrets` は純粋な文字列→文字列変換で、`***` 化済みの文字列を再度通しても変化しない自明な冪等性を持つ。category 漏れは UI 整合性の問題で secret 漏洩ではないため、防御層の対象は masking に絞る。

### Consequences

- 良い点: probe 追加時の masking 漏れに対するフォールバックが効く。冪等性が自明（実装上の落とし穴がない）。
- トレードオフ: dispatcher が application 層の `maskSecrets` に明示依存する。category 漏れは検出できないが、それは secret 漏洩ではないため許容範囲。

---

## ADR-003: URL の query は whitelist せず丸ごと潰す

### Status

Proposed

### Context

masking strategy として、(a) 既知 secret key 名（`key|token|secret|password|authorization|api[_-]?key`）の値のみ `***` に置換するか、(b) URL の query 全体を `?…` に潰すかの選択。Azure baseURL の `api-version=2024-02-01` のような診断に有用な query を残したい動機もあるが、未知 key 名の secret（独自プロキシ等）が将来発生した時に漏洩する。

### Decision

**URL を見たら origin + path のみ残し、query 全体を `?…` に潰す。**

加えて、URL の外（`Bearer xxx`、文中の `key=xxx`、単発の高エントロピー token）にも個別に masking を適用する。

### Consequences

- 良い点: 未知の secret key 名に対しても安全側に倒れる。Workers の `TypeError: fetch failed at <full-URL>` のような形式に対して堅牢。
- トレードオフ: 接続失敗時に診断有用な query（`api-version` 等）が見えなくなる。ただし管理者は自分が設定した値を知っているため運用上の影響は最小限。

---

## ADR-004: `messagesClient.ts` には masking のみ適用

### Status

Proposed

### Context

`messagesClient.ts` の `throwForStatus()` は `body.error?.message` を `detailSuffix` として組み込み、各 `*ErrorMapper.unknown` 等に渡している。各 mapper は HTTP status 経由で既に category 化された error class（`LLMRateLimitError` / `LLMUnavailableError` / `LLMAuthenticationError` 等）を返す。ここで sanitizer の category 化も適用すると、二重 prefix（`rate_limited: ...` のような category 文字列を既に category 化された error の message に埋める）になり、mapper の責務が崩れる。

### Decision

**`messagesClient.ts` には masking のみを適用し、category 化はしない。**

`maskSecrets(text: string): string` を sanitizer から別途 export し、`messagesClient.ts` はこちらだけを使う。

### `cause` 経路の取り扱い

mapper には現状 `cause: error` を渡している。これは保持する。理由:

- `*Error extends Error` の `message` には sanitize 済みの固定文言 + sanitize 済み `detailSuffix` のみが入る。
- `error.cause` の中身は標準のシリアライズ経路（`error.message` / `JSON.stringify(error)` / `toSerialized()`）では露出しない。
- 本リポジトリには `cause` を再露出する logger 実装は存在しない（実装時に `grep -r "\.cause" app/core --include "*.ts"` で最終確認）。

将来 `cause.message` をログ等に再露出する箇所が発生した場合は、その時点で別途 sanitize 適用を検討する。

### log 経路

adapter は直接 `console.log` / `logger` を呼ばず、throw された error が presentation 層の serializer・log 層を通る。`message` に sanitize 済み文字列のみが入る設計のため、log 経路も masking 適用の範囲に含まれる。Issue 要件 3 の「log への混入も同時に sanitize」はこの間接適用で達成される。

### Consequences

- 良い点: 既存 mapper の責務が保たれる。secret-like pattern の漏洩は防げる。`cause` チェーン経路に対する安全性が明文化される。
- トレードオフ: sanitizer に二つの API（`sanitizeErrorReason` と `maskSecrets`）が並ぶ。ただし内部実装で共通化できるため重複コストは低い。
