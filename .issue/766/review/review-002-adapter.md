# レビュー review-002 — Adapter / Infrastructure 観点（PR #794 / Issue #766・2周目フルレビュー）

対象差分（ゼロベース再確認）:
- `app/core/adapters/gemini/speechRecognitionProvider.ts`（新規）
- `app/core/adapters/gemini/speechConnectionPing.ts`（新規・`pingGemini` 委譲）
- `app/core/adapters/gemini/index.ts`（変更・`geminiSpeechAdapter` 追加）
- `app/core/adapters/speech/registry.ts`（変更・`gemini` 1 行登録）
- `app/core/adapters/gemini/__tests__/{speechRecognitionProvider,speechConnectionPing}.test.ts`（新規）
- `app/core/adapters/speech/__tests__/registry.test.ts`（変更）

対称性の基準: `deepgram/speechRecognitionProvider.ts`、`openai/speechRecognitionProvider.ts`、`gemini/{messagesClient,connectionPing}.ts`、port `domain/ingestion/ports/speechRecognitionProvider.ts`。

## 1周目指摘の追跡

- **W-001（サイズガード headroom）— 適切に解消。**
  `MAX_REQUEST_BYTES` を 20 MiB → **18 MiB（18,874,368 バイト）** に変更。評価式は `Math.ceil(byteLength/3)*4`（= base64 の正確長、過大評価なし）で、エンコード文字列を確保する前に見積もる（メモリ二重確保回避）。
  - 18 MiB エンコードは decimal で ≈ 18.87 MB なので、Gemini の総リクエスト ~20,000,000 バイト上限まで **約 1.1 MB の headroom** を残す。JSON エンベロープ（`contents`/`inlineData` キー）+ `systemInstruction` プロンプト（数百バイト）を勘定に入れても総リクエストは 20 MB 未満に収まり、round-1 P-002 が指摘した「ガードを通過したのに Gemini が 4xx 拒否 → `runIngestionJob` が空 transcript に握り潰す」偽陽性経路を塞ぐ。
  - コメントが実体（「base64 音声分のみを 18MiB 弱で見積もり、残りを envelope/prompt の headroom として確保し decimal 20MB 未満に収める」）と一致するよう書き直されている。round-1 で「コメントと実装の齟齬」と指摘した点も解消。
  - テストが境界の両側をピン留め: raw 15 MiB+1（base64 ≈ 20.97 MB）→ reject・no fetch、raw 13.5 MiB（base64 = 18,874,368 = ちょうど上限、`>` ガードなので通過）→ fetch 到達。閾値の将来変更が両側で検知される。実測: 13.5 MiB は 3 で割り切れ、エンコード長がちょうど上限と一致する厳密境界。**解消を確認。**

- **W-002（speech probe の workerd `AbortError` reason 文字列が非対称）— 見送り継続が妥当。**
  `connectionPing.ts` L98 の `pingGemini` catch は `error instanceof Error && error.name === "AbortError"` のままで、workerd の `DOMException`(AbortError) は `Error` を継承しないため workerd 上では timeout が汎用 reason に落ちる（下記 W-001 再掲）。1周目の仕分け（共有 LLM probe 由来・ok/not-ok 不変・reason 文字列のみ）どおり機能影響はなく、見送りは引き続き妥当。本 PR で新たに悪化した点はない。

---

## Adapter / Infrastructure

### Blockers
- **[B-001]** なし

### Warnings

- **[W-001]**（carry-over・見送り継続）Gemini speech probe の workerd `AbortError` 分類が deepgram/openai speech probe より弱い
  - 場所: `app/core/adapters/gemini/connectionPing.ts:98`（`speechConnectionPing.ts` が委譲）
  - 理由: `pingGemini` の catch は `error instanceof Error && error.name === "AbortError"` のみ。workerd の `DOMException`(AbortError) は `Error` 非継承のため、workerd 上では probe timeout が「Request timed out after …ms」ではなく `sanitizeErrorReason` の汎用 transport reason に落ちる。deepgram/openai speech ping は `typeof DOMException !== "undefined" && error instanceof DOMException` の二段ガードを持つ。`transcribe` 経路は `messagesClient.isAbortError`（`DOMException` 先判定、L92-96）を使うため無事。`speechConnectionPing.test.ts` の timeout テストは Node 環境（Node の `DOMException` は `Error` 派生）で緑になり、この workerd 固有ギャップは露見しない。
  - 深刻度: 低。`ok:false` 自体は正しく返り接続テストの合否は不変。影響は workerd 上の **reason 文字列のみ**。共有 `pingGemini`（LLM probe）由来で gemini-speech 固有のリグレッションではなく、修正は共有 LLM probe の改変になるためスコープ過大。**1周目の見送り判断を維持。**

### Notes

- **[N-001]** port 契約 4 点が `callGeminiGenerate` 流用で完全充足。(1) `SpeechFailureError` のみ throw — `speechErrorMapper` が 4 カテゴリ（rateLimit/unavailable/timeout/quota）を collapse、api キー空・サイズ超過も `transcribe` 内で `SpeechFailureError`。(2) 空発話 → `extractTextContent` が空 parts で `""`。(3) workerd AbortError → `messagesClient.isAbortError`（`DOMException` 先判定）→ `mapper.timeout`。(4) HTTP 400 → `throwForStatus` 最終フォールスルー `mapper.unavailable`（messagesClient L267）→ `SpeechFailureError`。テストが 400/401/403/429/500/transport TypeError/abort/非JSON 2xx/空 parts を網羅。
- **[N-002]** inlineData + 認証形が Gemini 仕様・ocr/pdf と対称。`x-goog-api-key` ヘッダのみで URL に key を載せない（messagesClient L189）。テストが `url` に `key=`・apiKey が無いこと、`inlineData.{mimeType,data}` の base64 一致、`maxOutputTokens=16384` 上書き、locale のプロンプト織り込みまで検証。
- **[N-003]** サイズガードの設計が妥当かつ openai 25MiB プリフライトと対称。エンコード長を `Math.ceil(byteLength/3)*4` で文字列確保前に見積もり、18MiB 上限で decimal 20MB 未満の headroom を確保。deepgram がガードを持たないのは Deepgram 上限が緩いためで、これも意図的非対称として整合。
- **[N-004]** コンストラクタ既定の内部設定が `SpeechAdapterConfig={apiKey,model}` 契約と整合。`timeoutMs` 既定 120_000（openai/deepgram と対称）/ `maxTokens` 16_384（`callGeminiGenerate` 既定 4096 の長尺切れ回避、OCR/PDF と同値）を registry 経由では受け取れない分だけコンストラクタで焼き込み。`geminiSpeechAdapter.create` は `{apiKey, model}` のみ渡すため production は常に既定値で動く。
- **[N-005]** registry generic dispatch 網羅・value cycle 回避が同型。`speechProviderRegistry: Record<SpeechProviderId, SpeechAdapter>` に `gemini: geminiSpeechAdapter` を追加し網羅をコンパイル時強制。`index.ts`/`registry.ts` ともに `import type { SpeechAdapter }`（value import なし）で `speech/registry → gemini/index → speech/registry` の値グラフを非循環に保つ（openai/deepgram と同型）。`registry.test.ts` が `speechProviderRegistry.gemini` / `lookupSpeechAdapter("gemini")` の dispatch をピン留め。AC-4（env>db>stub + SecretBox）は registry 登録だけで request/consumer 両経路が generic に通り、adapter 側の契約変更なし。
- **[N-006]** `GeminiSpeechConfig.endpoint?` は現状デッドフィールド（`geminiSpeechAdapter.create` は渡さず、テストも global `fetch` を stub）。`GeminiSharedConfig` とのパリティで残すのは無害だが削除可能。1周目から不変。
- **[N-007]** safety-block / 拒否レスポンス（candidates はあるが text part 無し）は `""`（無発話）に collapse され失敗にならない。`callGeminiGenerate` 流用の必然で ocr/pdf と同挙動。AC-1 の実ファイル受理検証では「モデル拒否なのに空 transcript」を「無発話」と取り違えないよう、plan のとおり HTTP ステータスを直接確認する必要がある（adapter 単体では区別不能）。

---

## サマリ
- Blockers: 0 / Warnings: 1 / Notes: 7
- `[B-001]` なし
- `[W-001]`（carry-over・見送り継続）Gemini speech probe の workerd `AbortError` 分類が deepgram/openai speech probe より弱く reason 文字列のみ非対称 — `gemini/connectionPing.ts:98`
- `[N-001]` port 契約 4 点（4 カテゴリ→SpeechFailureError / 空 parts→"" / workerd abort→timeout / HTTP 400 経路）を `callGeminiGenerate` 流用で完全充足
- `[N-002]` inlineData + `x-goog-api-key` ヘッダ・URL に key 不在で ocr/pdf と対称
- `[N-003]` サイズガードが 18MiB エンコード見積もりで decimal 20MB 未満の headroom を確保、openai プリフライトと対称
- `[N-004]` コンストラクタ既定（timeout 120s / maxTokens 16384）が `SpeechAdapterConfig` 契約・registry generic dispatch と整合
- `[N-005]` registry generic dispatch 網羅（コンパイル時強制）と value-cycle 回避が openai/deepgram と同型、AC-4 は登録のみで両経路成立
- `[N-006]` `GeminiSpeechConfig.endpoint` はデッドフィールド
- `[N-007]` 拒否/safety-block が `""` に化けるため AC-1 はステータス直接確認が必須

---

### W-001（1周目）解消確認
**解消済み。** `MAX_REQUEST_BYTES` を 18MiB 化し、base64 エンコード長（`Math.ceil(byteLength/3)*4`、過大評価なし・文字列確保前に算出）で評価。18MiB エンコード ≈ 18.87 MB に対し Gemini 総リクエスト ~20MB まで約 1.1MB の headroom を残し、JSON エンベロープ + systemInstruction プロンプトを勘定に入れても 20MB 未満に収まる。コメントが実体に一致するよう更新され、境界テスト（raw 15MiB+1 reject / raw 13.5MiB ちょうど上限 pass）が両側をピン留め。round-1 P-002 の偽陽性経路（ガード通過→Gemini 4xx 拒否→空 transcript 握り潰し）は塞がれた。
