# レビュー review-001 — Adapter / Infrastructure 観点（PR #794 / Issue #766）

対象差分:
- `app/core/adapters/gemini/speechRecognitionProvider.ts`（新規）
- `app/core/adapters/gemini/speechConnectionPing.ts`（新規）
- `app/core/adapters/gemini/index.ts`（変更・`geminiSpeechAdapter` 追加）
- `app/core/adapters/speech/registry.ts`（変更・1 行登録）
- `app/core/adapters/gemini/__tests__/{speechRecognitionProvider,speechConnectionPing}.test.ts`（新規）
- `app/core/adapters/speech/__tests__/registry.test.ts`（変更）

対称性の基準: `deepgram/{speechRecognitionProvider,speechConnectionPing,index}.ts`、`openai/speechRecognitionProvider.ts`、`gemini/{messagesClient,ocrProvider,connectionPing}.ts`、port `domain/ingestion/ports/speechRecognitionProvider.ts`。

AC 検証結果（Adapter 関連）:
- **AC-2（registry 登録 + probe）— 充足。** `speechProviderRegistry: Record<SpeechProvider, SpeechAdapter>` に `gemini: geminiSpeechAdapter` を追加。網羅はコンパイル時に強制され、`registry.test.ts` が dispatch（`speechProviderRegistry.gemini` / `lookupSpeechAdapter("gemini")`）をピン留め。probe は `pingGeminiSpeech`→`pingGemini` 委譲で 2xx → `{ok:true}`。
- **AC-4（env>db>stub + SecretBox）— 充足（generic dispatch による）。** `SpeechAdapterConfig={apiKey,model}` 契約は無傷。`geminiSpeechAdapter.create` は `{apiKey, model}` のみ受け取り、`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` は provider 非依存のまま。registry 登録だけで request / consumer 両経路が通る。adapter 側の契約変更なし。
- **AC-5（回帰テスト境界 + dispatch）— 充足、openai/deepgram と対称かつより網羅的。** 2xx(transcript)/HTTP 400(未対応 mime→unavailable)/401・403(quota)/429(rateLimit)/500(unavailable)/transport TypeError/timeout(DOMException AbortError)/非 JSON 2xx/空 parts→""/空 key(no fetch)/サイズ超過(no fetch)/base64 送信形・`x-goog-api-key` ヘッダ・URL に key 不在・masking を網羅。registry dispatch もカバー。

---

## Adapter / Infrastructure

### Blockers
- なし

### Warnings

- **[W-001]** サイズガードの閾値 `MAX_REQUEST_BYTES = 20 * 1024 * 1024` が「base64 音声単体・MiB・エンベロープ headroom ゼロ」で、P-002 が塞ごうとした穴を一部残している
  - 場所: `app/core/adapters/gemini/speechRecognitionProvider.ts` L43 / L110-116
  - 理由: 本ガードの設計意図（ADR-001・round-1 P-002）は「Gemini が 4xx 拒否し `runIngestionJob` が空 transcript に握り潰す payload を adapter で先に弾く」こと。ところが実装は (a) 上限を **20 MiB = 20,971,520 バイト**（≈ 20.97 MB）とし、Gemini が文書化する総リクエスト上限「約 20 MB」(decimal 20,000,000) より **約 970KB 緩い**。(b) 評価対象が **base64 音声単体のみ**で、JSON エンベロープ + `systemInstruction`(プロンプト) を勘定に入れていない（コメント・ADR は「総リクエストサイズ」と書くが実際は音声分のみ）。実測: raw ≈ 15 MiB のファイルは base64 だけで 20,971,520 バイト = ちょうど 20 MiB に達し（ガードは `>` なので通過）、ここにエンベロープ + プロンプトが乗ると総リクエストは 20.97 MB 超。録音 UI の `maxIngestionBytes` 既定 32 MiB の下で 14〜15 MiB の実録音は現実的に到達し、**ガードを通過したのに Gemini が 4xx 拒否 → 空 transcript に化ける**（P-002 が指摘した偽陽性経路そのもの）。round-2 arch-risk S-002 が「JSON エンベロープ分の headroom を一言」と促していたが、実装には反映されていない。
  - 提案: 閾値を decimal **20,000,000** ベースにするか、エンベロープ + プロンプト想定分（数百バイト〜1KB）を差し引いた値にする。あるいは ADR が併記した代替「raw 約 14MiB」（base64 ≈ 19.57 MB < 20 MB、実測 over=false）に下げ、コメントを「base64 音声分のみを 20MiB 弱で見積もり（エンベロープ分の headroom は別途）」と実体に合わせる。深刻度は中: 影響はサイズ帯の最上端の薄い band に限られ、挙動は degraded（空 transcript）で停止はしないが、まさに本 Issue の中核リスクの取りこぼしなので明示しておく。

- **[W-002]** Gemini speech probe の workerd AbortError 分類が deepgram/openai speech probe より弱い（probe 対称性の主張と齟齬）
  - 場所: `app/core/adapters/gemini/connectionPing.ts` L98（`pingGemini`、`speechConnectionPing.ts` が委譲）
  - 理由: `pingGemini` の catch は `error instanceof Error && error.name === "AbortError"` のみで、**workerd の `DOMException`(AbortError) は `Error` を継承しない**ため、workerd 上では probe の timeout が「Request timed out after …ms」ではなく汎用 transport reason に落ちる。deepgram/openai の speech ping は `typeof DOMException !== "undefined" && error instanceof DOMException` の二段ガードを持ち workerd でも timeout を正しく表示する。本 PR は ADR-002 でこの `pingGemini` を speech ping に流用し「openai/deepgram と対称」を謳うが、abort 分類だけは非対称。`transcribe` 経路は `messagesClient.isAbortError`（L92-96、`DOMException` を先に判定）を使うため無事。`speechConnectionPing.test.ts` の timeout テストは Node 環境（Node の `DOMException` は `Error` 派生）で緑になるため、この workerd 固有のギャップはテストでは露見しない。
  - 影響/深刻度: 低〜中。`ok:false` 自体は正しく返るので接続テストの合否は変わらず、影響は workerd 上での **reason 文字列のみ**。ただし `connectionPing.test.ts` 群が「workerd でも timeout を分類できる」前提を取っていない点とあわせ、deepgram/openai speech ping との対称性主張は厳密には成立していない。
  - 提案: `pingGemini` の catch を deepgram/openai 同型（`DOMException`+`Error` 二段）に揃える。これは LLM probe も同時に改善する。本 PR スコープ外と判断するなら、speech ping の「対称」記述に「abort 分類は `pingGemini` 既存挙動を継承（workerd では reason 文字列のみ非対称）」と注記する。※ `pingGemini` 自体は既存コードであり本 PR の新規バグではないが、speech 用に採用し対称性を主張した時点でレビュー対象。

### Notes

- **[N-001]** port 契約は `callGeminiGenerate` 流用で完全充足。`speechErrorMapper` が 4 カテゴリ（rateLimit/unavailable/timeout/quota）すべてを `SpeechFailureError` に collapse し、HTTP 400 は `throwForStatus` の最終フォールスルー（`messagesClient.ts` L267 `mapper.unavailable`）経由で `SpeechFailureError` になる。空 parts → `extractTextContent` が `""`（空発話契約）、workerd `DOMException`(AbortError) → `messagesClient.isAbortError`（`DOMException` 先判定）→ `mapper.timeout`。ocr/pdf・deepgram/openai と振る舞いが一致し、テストが全カテゴリ（400/401/403/429/500/transport/abort/非JSON/空 parts）を網羅。
- **[N-002]** inlineData / 認証形が Gemini 仕様・ocr/pdf と対称で正しい。`x-goog-api-key` ヘッダのみ・URL に key を載せない（`messagesClient` L189）。テストが `url` に `key=` も apiKey も含まれないこと、`inlineData.{mimeType,data}` の base64 一致、`maxOutputTokens=16384` の上書き、locale のプロンプト織り込みまで検証済み。
- **[N-003]** 空 API キー検査の置き場所が妥当。OCR/PDF はコンストラクタで plain `Error` を投げるが、speech は **`transcribe` 内で `SpeechFailureError`** に統一し（コンストラクタでは投げない）、port 契約（`SpeechFailureError` のみ throw）と deepgram/openai の「fetch 前に `SpeechFailureError`・no fetch」テストに正しく揃えている。意図的な逸脱で適切。model 非空を adapter で再検査せず VO（`SpeechRecognitionConfig.create`）に委ねる判断も deepgram と整合。
- **[N-004]** コンストラクタ既定の内部設定が `SpeechAdapterConfig={apiKey,model}` 契約と整合。`timeoutMs` 既定 120_000（openai/deepgram と対称）/ `maxTokens` 16_384（`callGeminiGenerate` 既定 4096 の長尺切れを回避、OCR と同値）を registry 経由では受け取れない分だけコンストラクタで焼き込み。`geminiSpeechAdapter.create` は `{apiKey, model}` のみ渡すため production は常に既定値で動く。型安全な value-cycle 回避（`index.ts` の `import type { SpeechAdapter }`）も openai/deepgram と同型。
- **[N-005]** `GeminiSpeechConfig.endpoint?` は現状デッドフィールド。`geminiSpeechAdapter.create` は渡さず、テストも global `fetch` を stub するため未使用。`GeminiSharedConfig` とのパリティで残すのは無害だが削除可能。
- **[N-006]** safety-block / 拒否レスポンス（candidates はあるが text part 無し）は `""`（無発話）に collapse され失敗にならない。`callGeminiGenerate` 流用の必然で ocr/pdf と同挙動。許容範囲だが、AC-1 の実ファイル受理検証では「モデルが拒否したのに空 transcript」を「無発話」と取り違えないよう、plan のとおり HTTP ステータスを直接確認する必要がある（adapter 単体では区別不能）。

---

## サマリ
- Blockers: 0 / Warnings: 2 / Notes: 6
- `[B-xxx]` なし
- `[W-001]` サイズガード閾値が 20MiB・base64 音声単体・headroom ゼロで P-002 の穴を一部残す — `gemini/speechRecognitionProvider.ts:43,110-116`
- `[W-002]` Gemini speech probe の workerd AbortError 分類が deepgram/openai speech probe より弱い（reason 文字列のみ非対称） — `gemini/connectionPing.ts:98`（`speechConnectionPing.ts` 委譲）
- `[N-001]` port 契約（4 カテゴリ→SpeechFailureError / 空 parts→"" / workerd abort→timeout / HTTP 400 経路）を `callGeminiGenerate` 流用で完全充足
- `[N-002]` inlineData + `x-goog-api-key` ヘッダ・URL に key 不在で ocr/pdf と対称
- `[N-003]` 空 key 検査を `transcribe` 内 `SpeechFailureError` に置く判断が port 契約・deepgram/openai と整合
- `[N-004]` コンストラクタ既定（timeout 120s / maxTokens 16384）が `SpeechAdapterConfig` 契約・registry generic dispatch と整合、value-cycle 回避も同型
- `[N-005]` `GeminiSpeechConfig.endpoint` はデッドフィールド
- `[N-006]` 拒否/safety-block レスポンスが `""` に化けるため AC-1 はステータス直接確認が必須

---

### 仕分け結果（メイン判断）
- **W-001** → 修正済み（MAX_REQUEST_BYTES を 18MiB に下げ JSON エンベロープ headroom を確保）。
- **W-002**（speech probe の workerd AbortError reason 文字列が非対称）→ **見送り（acceptable）**。理由: 該当挙動は共有 `pingGemini`（LLM probe）由来で gemini-speech 固有ではなく、修正は共有 LLM probe の改変になりスコープ過大。probe の合否（ok/not-ok）は不変で機能影響なし。対称性主張は「合否は対称・reason 文字列のみ workerd 限定で差異」と限定して受容する。
