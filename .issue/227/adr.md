# ADR — Issue #227: アップロード時のLLMレスポンスJSONパースを堅牢化する

## ADR-001: リトライを adapter 層内に閉じ込める

### Status
Proposed

### Context
LLM が JSON envelope 以外を返したときの対処として、(a) application 層に retry helper を追加 (b) queue worker でリトライ (c) adapter 層内で同期リトライ の選択肢があった。

CLAUDE.md の retry strategy:
> driver-level transient errors are retried inside the adapter; application code never sees them. There is intentionally no application-level OCC retry decorator.

`runIngestionJob` は `LLMRateLimitError` のみ throw（queue 再配信）し、`LLMUnavailableError` は即 `markFailed('llm_failure')` する設計になっている。LLM レスポンス形式ブレは driver-level transient（同じ呼び出しを瞬時にやり直して大半が解消する種類のエラー）。

### Decision
adapter 層の `llmProvider.ts` 内で、パース失敗時に **system prompt を強化して 1 回だけリトライ**する（初回呼び出し + リトライ 1 = 合計 2 attempts）。Issue 完了条件「最低 1 回はリトライ」を最小コストで満たす。失敗時の `LLMUnavailableError` メッセージは "after 1 retry" を含めて attempts 回数を明示する。application 層には変更を入れない。

**リトライ呼び出し中の throw 伝播ルール (Review #001 B-001 で確定):** `invokeWithRetry` の 2 回目 invoke が `LLMRateLimitError` / `LLMQuotaExceededError` / `LLMTimeoutError` を throw した場合は **try/catch せず素通し**する。これにより `runIngestionJob` の queue 再配信 (`LLMRateLimitError` のみ re-throw) と `markFailed` のセマンティクスが保たれる。adapter 層が catch していいのは「2 回目で `extractJsonObject` がやはり null を返した／必須キーが欠落していた」というパース失敗のみで、その場合だけ `LLMUnavailableError("... after 1 retry")` を投げる。

### Consequences
- 良い点:
  - CLAUDE.md の retry strategy 原則に沿う
  - 同一 HTTP セッション内で即時リトライできるため、queue 再配信より低レイテンシ
  - application 層の単純さを保てる
  - `LLMUnavailableError` のセマンティクスは変えないため、`runIngestionJob` の `markFailed('llm_failure')` パスは継続。ユーザー向け再生成可能状態への変換は #221 で扱う
- トレードオフ:
  - 各 adapter にリトライロジックを書く必要がある（共通化は各 provider 内の小ヘルパーに集約）
  - リトライ回数は初回 + 1 回固定。`structureToHtml`（出力長め）と `suggestMetadata`（短め）で挙動を揃え、コスト最小スタートで実運用観測する方針。観測してリトライ 2 回必要なら別 Issue で拡張

---

## ADR-002: messagesClient.ts への変更は optional 引数追加のみ

### Status
Proposed

### Context
構造化出力 API を有効化するには、`callOpenAIMessages` / `callGeminiGenerate` の request body に `response_format` / `generationConfig.responseMimeType` を追加する必要がある。これらの共通クライアントは OCR / PDF / LLM 全てから呼ばれる。

選択肢:
- (a) LLM mode 専用ヘルパーを `messagesClient.ts` から派生して新設
- (b) `messagesClient.ts` に optional 引数を追加し、LLM mode のみ使う
- (c) LLM adapter を `messagesClient` から切り離し、独自 fetch を持たせる

### Decision
(b) を採用。`callOpenAIMessages` / `callGeminiGenerate` / `callAnthropicMessages` に optional 引数を追加し、指定された場合のみ request body に展開する:
- OpenAI: `options?: { responseFormat?: { type: "json_object" } }`
- Gemini: `options?: { responseMimeType?: string }`
- Anthropic: `prefill?: string`（指定時は `messages` 末尾に `{ role: "assistant", content: prefill }` を追加）

OCR/PDF からは何も渡さないので挙動不変。

### Consequences
- 良い点:
  - OCR/PDF パスへの breaking change なし
  - LLM 専用の構造化出力フラグを最小変更で導入
  - 既存テストの大半が動き続ける
  - Anthropic の prefill も同じ「optional 引数」パターンで揃う
- トレードオフ:
  - `messagesClient.ts` が LLM mode 専用フィールドを知ることになり、責務がわずかに広がる。ただし optional パラメータの素直な追加であり、副作用は最小
  - Gemini の `responseSchema` は本 Issue では入れない（`responseMimeType` で JSON 形式は保証され、必須キーは `requireString` で検知。`responseSchema` は messagesClient interface の拡張規模が大きく、Issue スコープを越える。将来拡張候補）

---

## ADR-003: Anthropic は構造化出力 API を本 Issue では実装しない

### Status
Proposed

### Context
Anthropic Messages API には OpenAI/Gemini のような `response_format: json_object` 相当の機能がなく、構造化出力には tool-use を強要する設計になる。本 Issue のスコープに tool-use 移行を含めると以下の波及が出る:

- tool 定義（structure / metadata 用に 2 種）
- `content` から `tool_use` ブロックを取り出すレスポンス抽出ロジック追加
- OCR/PDF と共有している `messagesClient.ts` の本格的な分岐
- レスポンス validation を tool-use の `input` JSON schema 経由で行うか否か

Issue の完了条件は「構造化出力 API を各プロバイダで有効化（対応していないモデル向けにフォールバックパーサー）」であり、Anthropic のような「構造化出力 API が素直に使えないプロバイダ」向けにフォールバックパーサーが用意されていれば条件を満たす。

### Decision
Anthropic は本 Issue では tool-use ベースの構造化出力 API を実装しない。代わりに:
- パーサー耐性（balanced-brace スキャナ、フェンス・前置きの吸収、配列フォールバック）
- system prompt 強化
- **リトライ時に `messages` 末尾へ `{ role: "assistant", content: "{" }` を prefill 追加**して、モデルに envelope を `{` から始めさせる（Anthropic の構造化出力の確立手法）
- リトライ（初回 + 1 回）

で対応する。tool-use 移行は別 Issue で扱う（Phase 4 で起票候補）。

### Consequences
- 良い点:
  - Issue のスコープ内で完了条件を満たせる
  - 大規模な tool-use 移行をスコープ外として正しく切り出せる
  - prefill 採用で tool-use なしでも envelope 形式の精度を実用上十分なレベルまで上げられる
- トレードオフ:
  - Anthropic だけ API レベルの JSON 強制がない。実運用でパース失敗率が他プロバイダより高い可能性。リトライ＋パーサー耐性＋prefill で吸収できる範囲を想定し、観測してから tool-use 移行を判断
  - prefill した `{` は応答 text に含まれない（Anthropic API の挙動）ため、parser はそのまま受け取ったレスポンスを処理すれば良い。テストで join 挙動を検証する

### 実装メモ (ADR-003 補足)
prefill した `{` を含まない継続だけが返るケース（`"html":"x", ...}` のような形）に備えて、Anthropic アダプタは 2 回目の検証を「素のレスポンス」と「`{` を再 prepend したレスポンス」の 2 段で行う。これは `extractJsonObject` 自体は外部に対して純粋であり、Anthropic prefill 固有の挙動を共通ユーティリティに漏らさないようにするための adapter-local な保険。テスト `recovers when the prefilled retry returns a \`{\`-less continuation` で挙動を固定。

---

## ADR-004: 共通パーサーは `app/core/adapters/llm/jsonEnvelope.ts` に新設

### Status
Proposed

### Context
3 アダプタの `parseJsonEnvelope` / `requireString` / `requireStringArray` がほぼ完全コピペになっている。共通化先の選択肢:

- (a) `app/lib/` — 全レイヤー共通のプリミティブ専用
- (b) `app/core/adapters/llm/` — adapter 層共通の純粋関数
- (c) 3 アダプタにコピペのまま

### Decision
(b) を採用。新規ディレクトリ `app/core/adapters/llm/` を作り、`jsonEnvelope.ts` を配置。3 アダプタからは `@/core/adapters/llm/jsonEnvelope` で import する。

`app/core/adapters/` 配下は既に provider 名以外のディレクトリ（`security/`, `markdown/`, `sanitizer/`, `export/`, `stub/`）が存在しており、「provider 単位で並ぶ」規約は厳密ではない。`llm/` は「LLM-port 共通の adapter-side ユーティリティ」というカテゴリで、これらと同じ位置付け（特定 provider に紐づかないが adapter 層に閉じた純粋関数群）。

### Consequences
- 良い点:
  - 1 箇所のロジック改善が 3 アダプタに即時反映される
  - balanced-brace スキャナの境界バグを 1 セットのテストで網羅できる
  - CLAUDE.md「Adapters: Concrete implementations of ports per provider」に違反しない — 純粋関数で外部リソースを持たない
  - 既存「非 provider のカテゴリディレクトリ」と同じ規約に乗る
- トレードオフ:
  - 新ディレクトリ追加。ただし将来「LLM provider 共通の構造的ユーティリティ」が増えれば自然な置き場

---

## ADR-005: OpenAI の構造化出力フラグは `json_object` を採用（`json_schema` は不採用）

### Status
Proposed

### Context
OpenAI の構造化出力は `response_format: { type: "json_object" }` と `response_format: { type: "json_schema", json_schema: {...} }` の二択がある。Issue 本文の改善方針1 にも両方が候補として記載されている。

- `json_object`: JSON 形式（オブジェクト）を強制するが、スキーマ検証は行われない。gpt-4o-mini 系を含む幅広いモデルで対応
- `json_schema`: 必須キー・型・enum まで API レベルで検証。`gpt-4o-2024-08-06` 以降の限定モデルでのみ対応

### Decision
本 Issue では `json_object` を採用する。

### Consequences
- 良い点:
  - gpt-4o-mini 等の互換モデルを含む広い範囲で動作する
  - 実装が単純（schema 定義不要）
  - 必須キー検証は既存の `requireString` / `requireStringArray` で十分カバー可能
  - パース失敗時のリトライ + パーサー耐性で envelope 形式違反は実用上吸収できる
- トレードオフ:
  - `json_schema` を使えば API レベルで必須キーの欠落も防げるが、本 Issue では `requireString` でエラーになりリトライで救う設計のため不要
  - 将来「JSON 形式は出るが必須キーが欠ける」率が高くなった場合は `json_schema` 移行を別 Issue で検討する
