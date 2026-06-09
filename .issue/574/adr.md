# ADR — Issue #574: P23 プロンプトプレビュー

## ADR-001: プレビュー対象は実行可能な4用途のみ（ocr_assist は非対応表示）

### Status
Accepted（ユーザー決定）

### Context
PromptPurpose は5用途（structure / title / directory / metadata / ocr_assist）。一方 `LLMProvider` port は `structureToHtml` と `suggestMetadata` の2メソッドのみで、ocr_assist に対応する実行経路が存在しない。`PromptResolver.IngestionPromptPurpose` も `structure|title|directory|metadata` の4値で ocr_assist を含まない。

### Decision
プレビュー対象は structure / title / directory / metadata の4用途。ocr_assist は LLM 実行経路が無いため、UI で「プレビュー非対応」と正直に表示し実行ボタンを出さない。ocr_assist 用の LLM メソッド新設は本 Issue のスコープ外。

### Consequences
- 良い点: 虚偽表示禁止に合致（実行できない用途を偽の出力で取り繕わない）。スコープが膨らまない。
- トレードオフ: ocr_assist のプレビューは別 Issue 余地として残る。

---

## ADR-002: structure / title / directory は structureToHtml の1呼び出しに集約する

### Status
Accepted

### Context
`structureToHtml(input)` は `prompt`（structure）/ `titlePrompt`（title）/ `directoryPrompt`（directory）の3フィールドを同時に受け、`{ html, titleSuggestion, directorySuggestion }` を1回で返す。port は用途別の分割実行を提供しない。

### Decision
structure / title / directory いずれのプレビューも `structureToHtml` を1回呼ぶ。編集中の用途のフィールドに `overridePrompt` を注入し、残り2用途は `promptResolver.resolveFor` の解決値を入れる。出力は対象用途に応じて表示（structure→html、title→titleSuggestion、directory→directorySuggestion）。

### Consequences
- 良い点: port 契約に忠実。実 LLM の実出力を正直に表示できる唯一の方法。
- トレードオフ: title/directory のプレビューでも構造化全体が走るため LLM コストが増える。UI で「構造化を伴うプレビュー」と明示し、コストはレート制限・サンプル長上限で抑える。

---

## ADR-003: 簡易レート制限は D1 テーブルで実装する

### Status
Accepted

### Context
プレビューは実 LLM 課金を発生させるため呼び出し回数の制限が必要（ユーザー決定）。汎用レート制限基盤は既存に無い。Cloudflare の永続バインディングはコンテナに `DB: D1Database` のみ配線済みで、KV / Durable Object は未配線。既存の D1 アトミック claim パターン（`idempotencyStore`: `INSERT ... onConflictDoNothing RETURNING`）がある。

### Decision
新規 D1 テーブル `prompt_preview_counters(user_id, window_start, count, PK(user_id, window_start))` + application port `PromptPreviewRateLimiter` + D1 adapter を本機能向け最小実装で追加。`tryConsume` は drizzle の `onConflictDoUpdate({ target, set: { count: sql\`count + 1\` }, setWhere: sql\`count < ${max}\` }).returning()` で競合安全に判定する（INSERT 成功時は count=1 を返す＝allowed、既存行で setWhere 不成立なら RETURNING 空＝denied、lost race の INSERT 失敗も RETURNING 空＝denied として同一視）。粒度は per-user・固定 window バケット（`window_start = floor(now/windowMs)`）。初期値は N=20 回 / 1 時間（要レビューで調整可）。

`idempotencyStore` の SQL 形状は `onConflictDoNothing().returning()`（DO NOTHING）であり本実装の DO UPDATE + setWhere とは別物。踏襲するのは「D1 の単一 statement アトミック claim」という考え方であって SQL 形状ではない。DO UPDATE + setWhere の drizzle 実例は `searchIndex` adapter にある。raw SQL は不要。

### Consequences
- 良い点: 配線済み D1・既存のアトミック claim の考え方に沿い、競合安全な実カウンタを最小コードで実装。新規バインディング不要。drizzle API で表現でき raw SQL 不要。
- トレードオフ: 固定 window のため境界付近でバースト可能（厳密なスライディングウィンドウではない）。プレビュー用途には十分。古い window 行の掃除は pruner で後日対応（本 Issue 対象外）。KV/DO への移行余地は残す。
- 注意: 境界 count=max の挙動（「既存行で更新拒否＝RETURNING 空」と「lost race の INSERT 失敗＝RETURNING 空」を adapter が同一視して `allowed:false` とする）を integration test で固定する。

---

## ADR-004: サンプル長上限は 4000 文字、プロンプト長は既存 16KiB を流用

### Status
Accepted

### Context
LLM コストの主因は入力トークン数。サンプル入力欄とプロンプト欄の長さ上限が必要。プロンプトには既存の `PROMPT_TEMPLATE_MAX_BYTES = 16 KiB` 上限がある。

### Decision
`SAMPLE_TEXT_MAX_LENGTH = 4000` 文字をサンプル入力欄の上限とし、transport boundary（`inputValidator`）で検証。`overridePrompt` の上限は**保存側 schema と同じ 10,000 文字**に揃える（`PromptsForm/schema.ts` の保存用 `template.text` が `max(10_000)`。ドメイン VO は 16 KiB だが、プレビューで保存可能上限より長い入力を許すと UX が不整合になるため保存側に合わせる）。

### Consequences
- 良い点: プレビュー目的に十分な長さを確保しつつ課金を抑制。プレビューと保存で同じプロンプト上限になり一貫性を保つ。
- トレードオフ: 4000 文字を超える大きな文書のプレビューは切り詰めが必要（プレビュー用途では許容）。値はレビューで調整可。

---

## ADR-005: 実行不可状況（LLM 未設定等）は専用エラーコードに翻訳して正直に表示する

### Status
Accepted

### Context
- LLM 未設定のインスタンスでは `StubLLMProvider` が `new BusinessRuleError(IngestionErrorCode.UnsupportedFormat, "llm_not_implemented_in_mvp")` を throw する。すなわち **code = `unsupported_format`、message = `llm_not_implemented_in_mvp`**（当初 ADR の「code が llm_not_implemented_in_mvp」は誤り）。これをそのまま伝播すると `errorDisplay.ts` で「このファイル形式には対応していません…」と表示され、プレビュー文脈で無意味。
- LLM 障害（`LLMRateLimitError` / `LLMUnavailableError` / `LLMTimeoutError` / `LLMQuotaExceededError`）はいずれも `BusinessRuleError` ではなく素の `Error` 派生。
- レート制限超過は usecase 自身が throw する。
- 新規コード（`prompt_preview_rate_limited` / `llm_rate_limited` / `llm_quota_exceeded`）は現状 `errorDisplay.ts` のどの switch にも無く、追加しないと `BUSINESS_FALLBACK_MESSAGE`（汎用文言）に丸められて「正直な表示」が成立しない。

### Decision
`previewPrompt` usecase で LLM 呼び出しを try/catch し、次のとおり翻訳する:
- `isLLMRateLimitError` → `llm_rate_limited`
- `isLLMUnavailableError` / `isLLMTimeoutError` → `llm_failure`（既存コード流用）
- `isLLMQuotaExceededError` → `llm_quota_exceeded`
- `BusinessRuleError` で `code === "unsupported_format"` → `llm_preview_unavailable`（**プレビューパスはファイルを送らないため `unsupported_format` は StubLLMProvider 由来と一意に判定でき、message 文字列を sniff する必要はない**）。
- レート制限超過 → `prompt_preview_rate_limited`。

新規コード（`llm_rate_limited` / `llm_quota_exceeded` / `llm_preview_unavailable` / `prompt_preview_rate_limited`）は `IngestionErrorCode`（または適切な `*ErrorCode` モジュール）に PascalCase key / lower_snake value で定数追加し、`errorDisplay.ts` の `renderIngestionBusinessMessage`（group a）に専用文言ケースを追加、`errorDisplay.test.ts` の `EXPLICIT_*_CODES` と `errorCodeNaming.test.ts` の固定 set にミラーする。

### Consequences
- 良い点: 虚偽表示禁止原則に合致し、ユーザーに実状を正しく伝える専用文言を表示できる。message sniff せず code 判定で済む。
- トレードオフ: LLM 未設定環境ではプレビューが使えないが、それが実状なので正しい挙動。新規コードの定数化・display・テストミラーの3点セット編集が必須（漏れると汎用フォールバックに戻る）。

### 補足: pipeline のエラー分類との差分
既存 `runIngestionJob` の `classifyPipelineError` は `LLMUnavailableError` / `LLMTimeoutError` のみを `llm_failure` に落とし、rate / quota はリトライ機構に委ねて明示分類しない。プレビューは同期 1 回実行でリトライが無いため、4 エラー型すべてを usecase で明示的に翻訳する（pipeline と方針が異なる点を記録）。

---

## ADR-006: rate limiter port は max/windowMs を adapter config で保持し port 契約からは外す（実装時判断）

### Status
Accepted（実装時）

### Context
`PromptPreviewRateLimiter.tryConsume(userId, now)` の戻り値に `retryAfterSec` を含めるか、N/window を port 契約に晒すか。

### Decision
- port 契約は `tryConsume(userId, now): Promise<{ allowed, retryAfterSec }>` の最小形に留め、`max` / `windowMs` は **adapter コンストラクタの config** に閉じる。usecase は閾値を知らず allowed だけを見る。
- `D1PromptPreviewRateLimiter` は drizzle `onConflictDoUpdate({ target:[userId,windowStart], set:{count: sql\`count + 1\`}, setWhere: sql\`count < ${max}\` }).returning()` の単一 statement でアトミックに claim。INSERT 成功（count=1）/ 既存行 count<max の UPDATE 成功 → allowed、既存行 count>=max（RETURNING 空）/ lost INSERT race → denied に同一視。raw SQL 不要。
- DI 定数 `PROMPT_PREVIEW_RATE_LIMIT = { max:20, windowMs:3_600_000 }` を `serverCloudflare.ts` に置き、RequestContainer に配線。テストコンテナ（d1/application 両 helper）にも同値を配線。

### Consequences
- 良い点: usecase が閾値非依存になり、調整は DI 定数の一点変更で済む。adapter SQL は ADR-003 の方針どおり競合安全。
- トレードオフ: `retryAfterSec` は固定 window 境界までの秒数（厳密なスライディングではない）。プレビュー用途には十分。

---

## ADR-007: `llm_failure` は型強制（`as IngestionErrorCode`）で流用する（実装時判断）

### Status
Accepted（実装時）

### Context
`llm_failure` は `IngestionErrorCode` 列挙の正式メンバーではなく pipeline 識別子（`classifyPipelineError` 直書き）。`BusinessRuleError<TCode>` の型引数を満たす必要がある。

### Decision
unavailable / timeout の翻訳先 `llm_failure` は `errorDisplay.ts` group (b) に既存マッピングがあるため、新規 `IngestionErrorCode` 定数化はせず `new BusinessRuleError("llm_failure" as IngestionErrorCode, ...)` で流用する。新規4コード（`llm_rate_limited` / `llm_quota_exceeded` / `llm_preview_unavailable` / `prompt_preview_rate_limited`）のみ定数化し、group (a) に専用文言を追加。

### Consequences
- 良い点: 既存の `llm_failure` 表示文言と一貫。新規定数を最小限に抑える。
- トレードオフ: 1 箇所だけ型強制が入る。`llm_failure` は元々 group (b) の識別子なので enum 化しない方が出所の意味（pipeline 識別子）と整合する。

---
