# ADR — Issue #120: AnthropicLLMProvider helper migration

## ADR-001: 空 response → `LLMUnavailableError` は adapter 側で再導入する

### Status
Proposed

### Context

Issue #113 で導入された `callAnthropicMessages` helper は、response body に `text` content block が含まれない場合 (例: `content: []` / `content: [{type: "tool_use"}]` のみ / `content: [{type: "text", text: ""}]`) に空文字 `""` を返す仕様になっている。これは OCR / PDF port が空文字を許容する (downstream で `text.trim().length > 0` チェックして空なら OCR fallback に流す) ことに合わせた設計で、Issue #113 ADR-002 の Consequences で「`AnthropicLLMProvider` を後続で寄せる際は呼び出し側で空文字チェックを再導入」と明示されている。

一方 LLM port の JSON envelope contract (`structureToHtml` → `{html, titleSuggestion, directorySuggestion}`, `suggestMetadata` → `{tags, aliases}`) は空文字を許容しない (`JSON.parse("")` で envelope 不成立になる)。既存 `AnthropicLLMProvider.invoke()` は `if (text.length === 0) throw new LLMUnavailableError(...)` で明示的に弾いている。

選択肢:
1. helper の API を変更し `expectNonEmpty?: boolean` フラグを追加。LLM caller は true、OCR/PDF は false (default)
2. helper の戻り値を `string | null` に変更し、各 caller で扱う
3. helper の API は触らず、`AnthropicLLMProvider.invoke()` の helper 呼び出し直後に空文字チェックを残す
4. port 別の helper を分岐 (`callAnthropicMessagesExpectNonEmpty` 新設)

### Decision

選択肢 3 を採用。`AnthropicLLMProvider.invoke()` 内で helper 呼び出し後に `if (text.length === 0) throw new LLMUnavailableError("Anthropic response did not contain any text content")` を残す。

### Consequences

- 良い点:
  - Issue #113 ADR-002 Consequences に明示された設計合意通り
  - helper の API contract (Issue #113 で固定、OCR/PDF も依存) を変更しない → 波及ゼロ
  - 「OCR/PDF: 空 OK, LLM: 空 NG」の port 別意味論を adapter 層に閉じ込められる
  - 1 行 (`if (text.length === 0) throw new LLMUnavailableError(...)`) で済む
  - error message を既存と完全に同一文字列 (`"Anthropic response did not contain any text content"`) に維持できるため、上位 retry policy / integration test への影響なし
- トレードオフ:
  - 各 caller が自前で空文字チェックを書く必要 (現状は LLM のみだが将来 caller が増えたら同じ pattern を踏む)。ただし helper の JSDoc 末尾に明記済みなので、新規 caller がレビューで気付ける構造

---

## ADR-002: `llmConnectionTester.ts` は helper に寄せない

### Status
Proposed

### Context

Issue #120 本文で「`app/core/adapters/llm/llmConnectionTester.ts` も同様に helper に寄せられないか検討」と明示されている。Issue #113 ADR-002 でも `llmConnectionTester` を 4 番目の helper consumer 候補として挙げていた。

`HttpLLMConnectionTester.pingAnthropic` の契約と `callAnthropicMessages` の契約を比較:

| 項目 | `callAnthropicMessages` | `pingAnthropic` |
|---|---|---|
| 失敗時 | throw (mapper で型変換) | never throws、`{ ok, error }` struct を返す |
| 目的 | text 抽出 | 認証 / 到達性確認 (text は捨てる) |
| 401 / 404 の扱い | mapper.unavailable で throw | 「provider 応答あり (credentials 誤り)」として `ok: false, error: <provider message>` を struct で返す |
| latency 計測 | なし | `Date.now()` 計測あり |
| `system` prompt | 必須 (`string`) | なし |
| content | `readonly AnthropicContentBlock[]` (構造化) | raw string `"ping"` (1-token request) |
| max_tokens | default 4096 | 1 (cost 最小化) |
| timeout default | 60000ms | 10000ms |
| provider switch | Anthropic 固定 | `switch (cfg.provider)` で将来追加予定 |

選択肢:
1. 寄せない (本 Issue で touch しない)
2. helper を 2 段に分割: 下層 `executeAnthropicRequest(config, payload): Response | Error` を新設、上層 `callAnthropicMessages` がそれを使う + `pingAnthropic` も下層を使う
3. helper の API に `mode: "throw" | "result"` を追加して `pingAnthropic` も `callAnthropicMessages` 経由にする

### Decision

選択肢 1 を採用。`llmConnectionTester.ts` は本 Issue で触らない。

### Consequences

- 良い点:
  - 契約が真逆 (throw vs never-throw) なため、寄せると `try/catch` で全周囲を包んで struct に reify する wrapper が必要 → コード行数が減らないどころか増える方向 (重複削減の本来目的に反する)
  - `pingAnthropic` の特殊事情 (1-token / raw string content / latency 計測 / 401/404 を「応答あり」扱い / provider switch) は helper の責務範囲外であり、押し込むと helper の API が肥大化
  - `pingAnthropic` の HTTP 部分は本質的に Anthropic auth probe であり、汎用 messages API call とは責務が異なる (`messages[0].content` を `string` vs `AnthropicContentBlock[]` で送るかも違う)
  - Issue 本文「検討」に対して「検討して見送り」で要件充足
- トレードオフ:
  - HTTP fetch + AbortController + status text 取得の部分に表面的な重複が残る (~30 行)。ただし重複の質が helper consumer の 3 ファイル (LLM/OCR/PDF) とは異なる (status → error class マッピングが不要、struct 返却前提) ため、寄せても削減にならない
  - 将来 OpenAI / Gemini を追加するときに `pingOpenAI` / `pingGemini` が並ぶ予定なので、共通化するなら `pingXxx` レイヤーで抽象を作るのが筋 (helper への合流ではない)

選択肢 2 (2 段分割) は将来 provider が増えたタイミングで再検討する価値があるが、現時点では YAGNI。

---

## ADR-003: `llmErrorMapper` は module-scoped const として定義する

### Status
Proposed

### Context

`AnthropicErrorMapper` を `AnthropicLLMProvider` に inject する位置をどこに置くか。

選択肢:
1. module-scoped const として `llmProvider.ts` の上部で 1 度だけ生成
2. class の instance field として constructor で構築 (`this.errorMapper = { ... }`)
3. `invoke()` 内で inline object literal として毎回構築

### Decision

選択肢 1 を採用。`ocrProvider.ts` / `pdfExtractor.ts` と完全に同じパターン。

### Consequences

- 良い点:
  - mapper は完全に pure (closure capture も状態も持たない) なので instance / call ごとに別個に保持する理由がない
  - module-scoped で 1 度だけ生成 → instance 数 × call 数の object allocation を回避 (worker 環境で重要)
  - OCR / PDF と一貫したパターン → 新規 caller を追加するとき pattern matching で書ける
- トレードオフ:
  - module-scoped 変数はテストでの mock 差し替えが困難。ただし error class の constructor 自体を mock することは想定外であり、`fetch` を mock すれば挙動は完全に観測可能なので問題なし

---

## ADR-004: `AnthropicLLMConfig` 型は `AnthropicSharedConfig` の型エイリアスとして export を維持する

### Status
Proposed

### Context

`AnthropicLLMConfig` は現状 `Readonly<{ apiKey; model; endpoint?; apiVersion?; timeoutMs?; maxTokens? }>` で、`anthropicMessagesClient.ts` の `AnthropicSharedConfig` と structurally 完全に同型。helper 移行に伴い、`AnthropicLLMConfig` の独自定義は不要になる。

選択肢:
1. `AnthropicLLMConfig` を削除し、caller は `AnthropicSharedConfig` を直接 import
2. `AnthropicLLMConfig = AnthropicSharedConfig` の型エイリアスとして残す
3. `AnthropicLLMConfig` を `Readonly<AnthropicSharedConfig>` のような wrapper として残す

### Decision

選択肢 2 を採用。

### Consequences

- 良い点:
  - 既存 caller (`serverCloudflare.ts` で `new AnthropicLLMProvider({ apiKey, model })`) は型推論で動くため import 変更不要
  - 型エイリアスの名前で「LLM 用の config」というドメイン的なラベルが残り、grep しやすい
  - 将来 LLM 固有のフィールド (例: `temperature?`) を足したくなった場合に、エイリアスを `Readonly<AnthropicSharedConfig & { temperature?: number }>` に進化させやすい
- トレードオフ:
  - 型エイリアスが薄い間接層になる (見る人によっては「なぜエイリアスがあるのか」が分かりにくい可能性)。JSDoc で「LLM 用 caller の型ラベル」と明記してフォロー

---

## ADR-005: `parseJsonEnvelope` / `requireString` / `requireStringArray` は adapter 内に残す

### Status
Proposed

### Context

`AnthropicLLMProvider` には JSON envelope のパースとフィールド検証ロジック (`parseJsonEnvelope` / `requireString` / `requireStringArray`) がある。一見 HTTP 部分と同じく helper 化候補に見えるが、これらは LLM port (`structureToHtml` / `suggestMetadata`) の JSON envelope contract に特化している。

選択肢:
1. adapter 内に残す
2. helper (`anthropicMessagesClient.ts`) に移す
3. 新規 `anthropicJsonEnvelope.ts` に切り出す

### Decision

選択肢 1 を採用。adapter 内に残す。

### Consequences

- 良い点:
  - OCR / PDF は純テキスト返却なので JSON envelope パースは不要 → helper に移すと不要な依存が広がる
  - LLM port 固有の制約 (envelope shape、code fence ストリップ、必須キー検証) が adapter 内に閉じる
  - 将来 LLM port の envelope shape が変わるとき、adapter 内で完結して修正できる
- トレードオフ:
  - もし将来別 provider (OpenAI / Gemini) でも同じ envelope contract を採用する場合は、provider-agnostic な envelope util として切り出す価値が出てくる。その時は Issue #122 (provider 抽象化) の流れで再検討
