# ADR 013: 文字起こしプロバイダは OpenAI gpt-4o-transcribe を第一段固定とする

## ステータス

承認済み（2026-06-14, Issue #701）

## コンテキスト

取り込みパイプラインの `audio` 分岐は `SpeechRecognitionProvider.transcribe` を呼ぶよう既に配線されていたが、実アダプタが無く `StubSpeechRecognitionProvider` が常に `BusinessRuleError('unsupported_format')` を投げる状態だった。録音 UI（Issue #701）でブラウザ録音をノート化するには、実プロバイダの選定と、その設定を LLM 設定（[ADR 004](./004-llm-provider-single-fixed.md)）とは別枠で管理する仕組みが必要になった。

候補ごとのトレードオフは Issue の調査（deep-research、複数ソースを敵対的検証）で整理した。

- **OpenAI gpt-4o-transcribe**: REST `/v1/audio/transcriptions`・Bearer 認証・SDK 不要。webm/m4a/mp3 明示対応・25MB 上限でブラウザ録音をそのまま流せる。日本語精度の評判が良い。
- **Deepgram Nova-3**: 最安だが付加機能・日本語評価の情報が薄い。
- **Gemini audio**: 構造化（`structureToHtml`）と API 統一できる魅力があるが、webm/m4a ネイティブ対応が不確実。
- **Google Cloud STT v2**: 60 秒超で非同期バッチ + GCS 必須で Cloudflare Workers と相性が悪い。

文字起こしと LLM 構造化はポートの集合（`transcribe` のみ vs `llm`/`ocr`/`pdf`）もプロバイダの集合も異なるため、LLM 設定とは別枠で管理する判断が要る。

## 決定

文字起こしプロバイダは第一段として **OpenAI `gpt-4o-transcribe`** を単一固定する。LLM プロバイダ（ADR 004）と対称の方針を取る。

- プロバイダは `SpeechRecognitionProvider` ポートの背後に置き、OpenAI 実装を REST `/v1/audio/transcriptions`（multipart/form-data, Bearer 認証）で提供する。LLM の OpenAI アダプタ（URL 合成・secret masking）と対称に組む。
- registry パターン（`Record<SpeechProvider, SpeechAdapter>` でコンパイル時網羅、`app/core/adapters/speech/registry.ts`）を採り、後から Deepgram 等を差し替えられる構造にする。LLM registry とは責務・キー集合が異なるため**分離した専用 registry**とする。
- 設定（`SpeechRecognitionConfig`）は `LLMConfig` と並列の独立 VO とし、管理者は `/admin/speech`（`P48`）でプロバイダ・モデル・API キーを設定する。`baseURL` は持たない（OpenAI 固定エンドポイント。YAGNI）。
- API キーは **環境変数を優先し（`env > db`）、未設定時のみ DB に `SecretBox` 暗号化保管する**。いずれも未設定のときは `StubSpeechRecognitionProvider` にフォールバックする。
- 接続テストは transcribe を呼ばず、`GET /models/{model}` 系の**軽量 probe** でモデル存在 / 認証まで確認する（実音声不要・低コスト。Issue #701 ADR-006）。
- `locale` は当面 `ja-JP` 固定で開始する。ユーザー指定・インスタンス設定での可変化は後続 Issue とし、ポートの `locale` は無視せず素通しする。

## 検討した代替案

### Gemini audio に統一する（文字起こしも構造化も同一プロバイダ）
- 利点: API が 1 系統に揃い、registry を分けずに済む。
- 不採用理由: ブラウザ録音の中心フォーマット（webm/opus）のネイティブ対応が不確実。録音 UI 側にフォーマット変換を強いるリスクがある。

### LLM registry に文字起こしポートを相乗りさせる
- 利点: registry コードが 1 系統で済む。
- 不採用理由: `SpeechProvider` の集合とポート（`transcribe` のみ）が `LLMProvider`（llm/ocr/pdf をバンドル、anthropic/openai/gemini）と異なり、責務が混ざる。`SpeechProvider` が独立して進化できなくなる。

### Cloudflare Workers AI（`env.AI` バインディング）経由で呼ぶ
- 利点: 外部 HTTP 依存が減る可能性。
- 不採用理由: 第一段は LLM アダプタと対称の素の REST（multipart + Bearer）で疎通させる方が実装コストが低く対称性も高い。Workers AI 経由は後続最適化に回す。

## 影響

- `SpeechRecognitionProvider` ポートは差し替え可能な抽象として設計し、将来のプロバイダ追加余地（Deepgram 等）を残す。
- 録音長 → ファイルサイズが OpenAI 25MB / `maxIngestionBytes`（既定 32MiB）に抵触しうるため、録音 UI 側で時間 / サイズの上限・警告を設ける。
- 文字起こしと LLM 構造化でプロバイダが分かれる（API 統一の単純さは失うが、フォーマット対応の確実性を優先）。
- Cloudflare Workers 上での multipart `fetch` body 構築は実装前に PoC で確認する（`messagesClient` は Chat Completions の JSON 専用で multipart には流用不可）。
- 文字起こし失敗時の縮退挙動（空テキストで `previewing` に到達、本文追記して保存可能）は Issue #701 ADR-005 に従う。未設定（Stub フォールバック）時は縮退対象外で従来どおり失敗扱いとする。

## 追記: Deepgram Nova-3 を 2 本目として registry 追加（Issue #738）

第一段（OpenAI 単一固定）の registry 構造（`Record<SpeechProvider, SpeechAdapter>`）に 2 本目のプロバイダ **Deepgram Nova-3** を差分追加した。ドメイン union 1 値・transport list 1 値・registry 1 行・新 adapter ディレクトリ・UI ラベル / 既定モデル分岐の追加だけで、ユースケース / DI / ConnectionTester / DTO / DB スキーマは無変更（すべて provider 非依存の generic dispatch）。

- `SPEECH_PROVIDERS` を `["openai", "deepgram"] as const` に拡張。default-model マッピングは `openai → gpt-4o-transcribe` / `deepgram → nova-3`。既定プロバイダは `openai` 据え置き（`defaultSpeech()` 不変）。
- **Deepgram の API 特性**: prerecorded `POST https://api.deepgram.com/v1/listen?model=nova-3&language=ja&smart_format=true` に **raw audio bytes を直接 body** として送る（OpenAI の multipart/form-data とは異なる）。認証は `Authorization: Token <key>`。レスポンスは `results.channels[0].alternatives[0].transcript` から取り出して `.trim()`、空・欠落は `""`（空発話契約）。`SpeechFailureError` のみ throw する port 契約を厳守。
- **接続 probe**: Deepgram には OpenAI の `GET /models/{model}` 相当が無いため、認証だけ確認できる軽量エンドポイント `GET https://api.deepgram.com/v1/projects` で **2xx = 疎通 OK** とする（実音声不要・ADR-006 踏襲）。model 存在の事前確認は probe では行わず、誤った model 名は実 transcribe 時の 4xx で判明する。OpenAI との UX 対称性のため空 model は `ok:false` を返す。
- **Gemini audio / Cloudflare Workers AI 経由は本 Issue 見送り**: Gemini は webm/opus・m4a のネイティブ対応が不確実で実ファイル PoC が必須（録音 UI は webm/opus 標準）。Workers AI 経由（`env.AI` バインディング）は `SpeechAdapterConfig`（現状 `{apiKey, model}`）の拡張と DI 配線を要するため別 Issue とする。第一段は REST 直送のみで OpenAI と対称に組む。詳細は `.issue/738/adr.md`（ADR-001〜003）。

## 追記: Gemini audio を 3 本目として registry 追加（Issue #766）

`.issue/738` ADR-002 が「別 Issue」に先送りした Gemini audio を、registry に 3 本目のプロバイダとして実装・登録した。OpenAI / Deepgram と同じく差分追加（ドメイン union 1 値・transport list 1 値・registry 1 行・adapter ファイル・UI ラベル / 既定モデル分岐）のみで、ユースケース / DI / ConnectionTester / DTO / DB スキーマは無変更（provider 非依存の generic dispatch）。

- `SPEECH_PROVIDERS` を `["openai", "deepgram", "gemini"] as const` に拡張。default-model マッピングは `openai → gpt-4o-transcribe` / `deepgram → nova-3` / `gemini → gemini-2.5-flash`（文字起こし用途として低レイテンシの現行世代モデルを独立に選定。LLM フォーム例示既定との一致は主張しない）。既定プロバイダは `openai` 据え置き（`defaultSpeech()` 不変）。
- **Gemini の実装方式**: 専用 STT エンドポイントが無いため、音声を `generateContent` の `inlineData` パート（`mimeType` + base64 `data`）として投入し、システムプロンプトで逐語文字起こしを指示する。`app/core/adapters/gemini/messagesClient.ts` の `callGeminiGenerate`（`x-goog-api-key` 認証・timeout・workerd `AbortError`-as-timeout・空 parts → `""`・`arrayBufferToBase64`）をそのまま流用し、`speechErrorMapper` で全カテゴリ（rateLimit / unavailable / timeout / quota）を `SpeechFailureError` に畳む（OCR の `ocrErrorMapper` / PDF の `pdfErrorMapper` と同型）。`maxTokens` は OCR/PDF と同じ `16_384` に引き上げ（既定 4096 では長尺文字起こしの末尾が切れる）、`timeoutMs` 既定は openai/deepgram speech と対称に `120_000`。`SpeechFailureError` のみ throw・空発話は `""` の port 契約は `callGeminiGenerate` の既存実装で自動的に満たされる。
- **接続 probe**: Gemini には OpenAI の `GET /models/{model}` 相当の軽量 probe が無いが、LLM 側の `pingGemini`（`maxOutputTokens: 1` の最小 `generateContent`）が認証 + model 存在を一度に確認できるため、`geminiSpeechAdapter.ping` はこれを流用する（`geminiAdapter.ping` と同一実装。speech 専用 probe は新設しない・ADR-006 踏襲で実音声不要）。テキスト ping のため「その model が音声 inlineData を受理するか」は probe では保証しない。
- **サイズガード**: Gemini inline 制約は「総リクエストサイズ 20MB 超は Files API」で、base64 化（約 33% 増）と JSON エンベロープ / システムプロンプト分も総ペイロードに効く。よって raw を実エンコードする前に `Math.ceil(byteLength / 3) * 4` で base64 後サイズを見積もり、`MAX_REQUEST_BYTES`（18MiB。20MB 上限に headroom を残す）と比較してから弾く（超過時は `SpeechFailureError`。OpenAI の 25MiB プリフライトと対称）。mime allowlist は設けない（webm/opus 受理可否そのものが検証対象なので先回り拒否しない。Gemini が拒否すれば 4xx → `SpeechFailureError` で露見する）。
- **既知の未確定事項（録音 UI 既定フォーマットの受理）**: 録音 UI 既定の `audio/webm;codecs=opus`（および m4a）を Gemini が受理するかは、Gemini の `inlineData` ドキュメントが webm/opus を明示列挙していないため**未確定で、staging 環境で検証中**（AC-1）。実装は本番形でマージし、実 Queue / consumer + 実 API キーが揃う staging で受理可否を確定させる方針（Gemini は opt-in 選択時のみ作動し既存の OpenAI / Deepgram 経路は無傷）。**受理 NG（webm/opus が 4xx 拒否）の場合は #766 の実装コミットを revert して先送りを継続しうる**。受理判定の際は、`runIngestionJob` の audio 経路が configured provider の `SpeechFailureError` を握り潰して空 transcript で「成功」扱いする（4xx 拒否がノート保存成功に化ける）ため、「ノート保存が成功したか」では判定せず、**adapter／ネットワーク層で実 Gemini が 2xx + 非空 transcript を返したことを直接確認**して下す。詳細は `.issue/766/adr.md`（ADR-001〜003）。

## 追記: Cloudflare Workers AI ルート `deepgram-workers-ai` を registry 追加（Issue #788）

第一段 ADR で「後続最適化に回す」とした Cloudflare Workers AI（`env.AI` バインディング）経由の文字起こしを、`.issue/738` ADR-002 が先送りした形で **`deepgram-workers-ai`（`@cf/deepgram/nova-3`）** として registry に 4 本目のプロバイダとして追加した。実装対象は Deepgram Nova-3 のみで、**OpenAI gpt-4o-transcribe の Workers AI ルートはスコープ外**（Workers AI パートナーモデルに存在せず・型付きカタログは Whisper 系のみ・#788 ADR-003）。詳細は `.issue/788/adr.md`（ADR-001〜007）。

- **案 B（別 SpeechProvider エントリー）採用**（#788 ADR-001）: transport 軸を `SpeechAdapterConfig` に足す案 A は `gemini + workers-ai` の非合法状態を型に許し、DB マイグレーションも要する。案 B は実在する組み合わせだけを列挙するので非合法状態が構造的に生じず、既存の `speech_provider` テキストカラムにそのまま乗り**マイグレーション不要**。`SPEECH_PROVIDERS` を `["openai", "deepgram", "gemini", "deepgram-workers-ai"] as const` に拡張。default-model は `deepgram-workers-ai → '@cf/deepgram/nova-3'`。既定プロバイダは `openai` 据え置き。
- **`SpeechAdapterConfig`（`{apiKey, model}`）は不変・binding は DI 別口注入**（#788 ADR-002）: `env.AI` は純データ config に混ぜず、`SpeechAdapter.create`/`ping` に `deps?: SpeechAdapterDeps`（`{ ai?: Ai }`）を追加して注入する。REST アダプタ（openai/deepgram/gemini）は `deps` を無視（optional なので無改修）。`deepgramWorkersAiSpeechAdapter` だけが `deps.ai` を読む。
- **実装方式**: `env.AI.run("@cf/deepgram/nova-3", { audio: { body: <bytes>, contentType: <mime> }, smart_format: true, language? })` を型付き（`Ai_Cf_Deepgram_Nova_3_Input/Output`）で呼ぶ。出力 `results.channels[0].alternatives[0].transcript` の抽出は REST Deepgram と**共有**（`transcript.ts` の `extractDeepgramTranscript`。REST 応答と同一 shape なので型で担保）。`SpeechFailureError` のみ throw・空発話は `""` の port 契約を厳守。binding 未注入・`run()` 失敗は `SpeechFailureError`。
- **timeout**（#788 ADR-007）: `AiOptions` に `signal?: AbortSignal` は存在する（`@cloudflare/workers-types@4.20260511.1`）が、workerd が AI 実行に対してこれを honor するかは dev から検証不可（ADR-006）。そこで port の timeout 契約は **`Promise.race` + 自前タイマーが `SpeechFailureError` を reject** して決定的に満たす。`Promise.race` は下層 `run()` をキャンセルしない（タイマー発火後もバック側は継続し課金され得る）点を JSDoc に明記。REST の `AbortController`/`DOMException(AbortError)` 判定とは混ぜない（`run()` は fetch signal 駆動ではないため AbortError は発生しない）。
- **API キー不要（keyless）・6 ゲートの keyless 分岐**（#788 ADR-004）: 認証は Cloudflare 側。apiKey 前提のゲートは DI だけでなく application usecase・domain service にも存在し、計 **6 箇所**（domain service `assertSpeechEnvOverride` 1 + application 5: usecase `updateSpeechConfig`/`testSpeechConnection` 2 + DI `buildSpeechRecognitionProvider`/`resolveConsumerSpeechConfig` 2 + tester `HttpSpeechConnectionTester` 1）を keyless 述語で分岐する。判定は domain SSOT 述語 `SpeechRecognitionConfig.requiresApiKey(provider)`（keyless 集合 `KEYLESS_SPEECH_PROVIDERS`）に集約し、全ゲートが同一述語を参照してドリフトを防ぐ。keyless は `apiKeySource: 'env'` / ciphertext null に正規化し **SecretBox 暗号化は非適用**（保管する鍵が無い＝ AC「SecretBox 暗号化（該当する場合）」の「該当する場合」に非該当）。keyless で operator が誤入力した apiKey は silently drop される（保存されない）。
- **接続テスト（ping）は binding 存在確認のみ**（#788 ADR-005）: `deepgramWorkersAiSpeechAdapter.ping` は `deps.ai` の存在をもって `ok:true`、未注入なら `ok:false`。実 `env.AI.run` は呼ばない（課金 / 実音声不要・ADR-006 踏襲）。そのため `HttpSpeechConnectionTester` に `ai?: Ai` を注入し、REST の empty-key 短絡を keyless ではスキップして probe に到達させる。
- **既知の未確定事項（webm/opus 受理）**（#788 ADR-006）: 実 `env.AI` binding へ dev から到達不可（Workers AI はローカルモックを持たず `wrangler dev` も実アカウント認証で remote を叩く）。レスポンス shape の REST 互換性は型（`Ai_Cf_Deepgram_Nova_3_Output`）で静的に確定済み。webm/opus 受理は **staging で implement-then-verify / revert**：実装を opt-in（既定 openai 据え置き）で本番形マージし、実録音 webm/opus が **adapter／ネットワーク層で 2xx + 非空 transcript** を返すことを直接確認（「ノート保存成功」では判定しない・偽陽性注意）。受理 NG なら実装コミットを `git revert`（spec/ADR 更新は別コミットで revert 対象外）し根拠を `.issue/788/adr.md` ADR-006 に追記。保険策として `encoding: "opus"` 明示指定 → 録音 UI の webm→ogg/opus 変換の順で別 Issue 検討。
- **wrangler**: web worker と `[env.consumer]` に `[ai] binding = "AI"` を追加（**audio 文字起こしは consumer で走る**ため consumer 経路の binding が E2E の要）。ローカル dev の AI binding は実アカウント認証依存（モックなし）。
- **引き継ぎ（OpenAI gpt-4o-transcribe の Workers AI ルート）**: gpt-4o-transcribe は Workers AI パートナーモデルに存在しないため本 Issue スコープ外。AI Gateway プロキシ経由 or Whisper（`@cf/openai/whisper-large-v3-turbo`）代替の別 Issue として起票する（#788 ADR-003・Phase 4）。ADR-001/002 の設計（別エントリー + `deps.ai` 注入）は generic なので `openai-whisper-workers-ai` を同じ配線に乗せられる。
