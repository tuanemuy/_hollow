# ADR — Issue #766: Gemini audio 文字起こしプロバイダを registry に追加する

> 本 Issue は `.issue/738/adr.md` ADR-002（Gemini 先送り）の「別 Issue」にあたる。
> 受理検証の結果に応じて本 ADR の Status を確定し、ADR-002 を Superseded に更新する。

## ADR-001: Gemini speech は `generateContent` + `inlineData`(base64) で実装し、既存 `messagesClient.callGeminiGenerate` を流用する

### Status
Proposed（受理検証 OK で Accepted、NG なら revert で破棄）

### Context
Gemini には専用の文字起こしエンドポイントは無く、音声は `generateContent` の `inlineData` パート（`mimeType` + base64 `data`）として投入し、システムプロンプトで「文字起こしして」と指示する。`app/core/adapters/gemini/messagesClient.ts` の `callGeminiGenerate` は既に以下を備えており、OCR / PDF アダプターが同じ形で流用している:

- `inlineData` パートの POST、`x-goog-api-key` ヘッダ認証（`?key=` クエリは使わない・Issue #101 ADR-002）
- `AbortController` による timeout、**workerd の `DOMException`(AbortError) を timeout として扱う** `isAbortError`
- HTTP 429/401-403/5xx/network の分類を **注入された `mapper`** に委譲（port 固有のエラー型を投げられる）
- 空 parts のとき `""` を返す（空発話契約と整合）、`arrayBufferToBase64`（workerd 安全な 8KB チャンク）

選択肢:
- 案 A: `callGeminiGenerate` を流用し、`SpeechFailureError` を全カテゴリに返す `speechErrorMapper` を渡す。
- 案 B: deepgram/openai speech のように独自 `fetch` を書く。
- 案 C: Gemini Files API（>20MB 向けの非インライン投入）を使う。

### Decision
**案 A** を採る。`app/core/adapters/gemini/speechRecognitionProvider.ts` に `GeminiSpeechRecognitionProvider` を新設し、`callGeminiGenerate(config, TRANSCRIBE_SYSTEM_PROMPT, [{ inlineData: { mimeType: input.mime, data: base64 } }], speechErrorMapper)` を呼ぶ。`speechErrorMapper` は `rateLimit/unavailable/timeout/quota` の 4 カテゴリすべてを `new SpeechFailureError(message, cause)` にマップする（OCR の `ocrErrorMapper` / PDF の `pdfErrorMapper` と同型）。

- これにより **「`SpeechFailureError` のみ throw・空発話は `""`・workerd AbortError を timeout 扱い」** の port 契約は `callGeminiGenerate` の既存実装で自動的に満たされ、deepgram/openai speech と同じ振る舞いになる（独自 fetch を書かない分、対称性の担保が容易）。
- `maxTokens` は OCR/PDF と同じく `16_384` に引き上げる（`callGeminiGenerate` の既定 4096 は長い文字起こしを途中で切る）。`timeoutMs` 既定は openai/deepgram speech と対称に `120_000`。
- 事前ガード: mime allowlist は**設けない**（webm/opus 受理可否そのものが検証対象なので、adapter で先回り拒否すると検証できない。Gemini が拒否すれば 4xx → `SpeechFailureError` で素直に露見する）。
- サイズガードは **base64 後の総リクエストサイズで評価する**。Gemini inline は音声を `arrayBufferToBase64` で base64 化して JSON body に投入するため約 33% 増し、Gemini の inline 制約は「総リクエストサイズ 20MB 超は Files API を使え」＝**エンコード後の総ペイロード**に効く。raw 20MiB を上限にすると base64 後は約 27MB となり 20MB 制約を超え、ガードを通過したのに Gemini が 4xx 拒否する穴になる（しかも E2E では `runIngestionJob` の握り潰しで空 transcript に隠れる）。よって `MAX_REQUEST_BYTES`（base64 後 20MB 弱）で評価するか、raw 閾値を **約 14MiB**（base64 ≈ 19MB < 20MB）に下げる。超過時は `SpeechFailureError`（openai の 25MiB プリフライトと対称）。
- 案 C（Files API）は **YAGNI で見送り**。inline 上限超は当面サイズガードで弾き、必要になれば別 Issue（録音 UI 側の長さ上限と併せて）。

### Consequences
- 良い点: `messagesClient` の timeout / 認証 / エラー分類 / base64 をそのまま使え、独自実装の表面積が最小。OCR/PDF と完全対称で保守負荷が低い。
- トレードオフ: 文字起こしを LLM 推論で行うため、専用 STT（openai/deepgram）よりレイテンシ・精度・コストが読みにくい。`maxTokens` 上限で長尺音声の末尾が欠落しうる（既知の制約として spec に記す）。
- 注意: 成功時 2xx ボディはユーザー本文（transcript）なので secret masking を通さない（openai/deepgram speech と同じ前提 — `runIngestionJob` は `SpeechFailureError` を握り潰し `.message`/`.cause` をログ/UI に出さない）。

---

## ADR-002: 接続 probe は既存 `pingGemini`（最小 `generateContent`）を流用する

### Status
Proposed

### Context
deepgram speech は専用の認証専用エンドポイント（`GET /v1/projects`）で probe したが、Gemini には LLM 用の `connectionPing.ts`（`pingGemini`）が既にあり、`maxOutputTokens: 1` の最小 `generateContent` リクエストで **認証 + model 存在**を一度に確認する。`geminiAdapter`（LLM 側）の `ping` はこれを流用している。

### Decision
`geminiSpeechAdapter.ping` は既存 `pingGemini({ apiKey, model: cfg.model, timeoutMs })` を流用する（`geminiAdapter.ping` と同一実装）。文字起こし用に別 probe を新設しない。

- probe は **実音声を送らない**（ADR-006 踏襲・低コスト）。
- openai と同様に **model 存在まで確認**できる（deepgram の auth-only probe より強い）。空 key は `pingGemini` 内で明示ガードして `ok:false`。**空 model は `pingGemini` には明示ガードが無い**（model は URL に埋め込むだけ）が、`SpeechRecognitionConfig.create` が model 非空を強制するため probe に空 model は到達せず、仮に到達しても存在しない model URL への 404 で `ok:false` に落ちる（deepgram probe は UX 対称性のため空 model を明示的に弾いており、その点だけ挙動が割れる）。

### Consequences
- 良い点: speech 専用 probe コードが不要。LLM Gemini と完全に同じ疎通判定で UX が揃う。
- トレードオフ: probe は `generateContent` の 1 トークン課金が発生しうる（deepgram の純メタデータ probe よりわずかに重い）。ただし openai の `GET /models/{model}` と同等水準で許容範囲。
- 注意: probe が通っても「その model が **音声 inlineData を受理するか**」は保証しない（テキスト ping のため）。フォーマット受理は ADR-003 の実ファイル検証で担保する。

---

## ADR-003: webm/opus・m4a 受理リスクと implement-then-verify / revert 戦略

### Status
Proposed（**本 Issue のマージ可否を決める中核判断**）

### Context
Gemini の `inlineData` がドキュメントで明示する音声フォーマットは WAV / MP3 / AIFF / AAC / **OGG** / FLAC 系で、**ブラウザ録音標準の `audio/webm;codecs=opus` は明示列挙に無い**（`.issue/738` ADR-002・`spec/adr/013` の不採用理由）。録音 UI は既定で webm/opus を出力するため、Gemini が受理しないと録音経路が壊れる。`pnpm test`（fetch モック）は契約準拠を見るだけで実フォーマット受理は検証できない。

### Decision
**実装を本番形の独立コミットで入れてから実ファイルで受理検証し、NG なら一発 revert** する（`.issue/738` ADR-002 が要求する「実ファイル PoC を前提に別 Issue」をこの形で消化）。

1. domain union / registry / adapter / DI / UI / 回帰テストを **1 つの独立コミット**にまとめる（後段の検証 NG 時に `git revert <sha>` で原子的に戻せるようにする。spec/ADR 更新は別コミットにして revert 対象から外す）。
2. マージ前検証（必須・非交渉）: 実際に録音した **webm/opus（＋できれば m4a）** ファイルで Gemini が 2xx + transcript を返すことを確認する（手段は plan.md「テスト方針」を参照）。
3. 分岐:
   - 受理 OK → 本 ADR-001〜003 を Accepted、`.issue/738` ADR-002 を Superseded、spec/adr/013 と spec/domains/adminSettings を Gemini 反映してマージ。
   - 受理 NG（webm/opus が 4xx）→ 実装コミットを revert し先送り継続。本 ADR に **検証結果（拒否された mime・status・エラーメッセージ）を追記**し、`.issue/738` ADR-002 を **Proposed → Accepted へ更新（NG 結果＝先送り妥当性の確定を記録）**。spec は変更しない。

### Consequences
- 良い点: 捨て PoC スクリプトと実装コストがほぼ変わらない（diff-only）ため、本番形で検証でき二度手間が無い。revert を原子的にできる。
- トレードオフ: NG 時はコミット 1 本が無駄になるが、独立コミット化で影響を局所化できる。
- 引き継ぎ: NG だった場合でも、録音 UI 側に webm→ogg/wav 変換を入れる案や Files API 案は本 Issue のスコープ外（別 Issue）。
- **偽陽性に注意（重要）:** `runIngestionJob` の audio 経路は configured provider の `SpeechFailureError` を握り潰して空 transcript で「成功」扱いし、degraded preview をコミット可能にする（実コード確認済み: `if (isSpeechFailureError(error)) return ""`）。`callGeminiGenerate` は webm 拒否の 400 を `mapper.unavailable → SpeechFailureError` にマップするため、**Gemini が webm を 4xx 拒否してもノート保存は「成功」してしまう**。したがって本 ADR の受理判定（OK/NG）は「ノート保存が成功したか」では決めず、**adapter／ネットワーク層で実 Gemini が 2xx + 非空 transcript を返したことを直接確認**して下す（手段は plan.md「テスト方針」6 を主とする）。

---

## ADR-004（参照）: `.issue/738/adr.md` ADR-002 の取り扱い

- 受理 OK 時: `.issue/738/adr.md` ADR-002 の Status を **Superseded by #766** に更新（本 Issue が「別 Issue」を消化した記録）。
- 受理 NG 時: ADR-002 は **Accepted**（先送り判断は妥当だったと確定）に更新し、本 ADR-003 に NG の根拠を残す。

---

## 実装メモ（コード差分フェーズで確定した具体化）

ステップ 1〜7 のコード差分実装時に確定した、ADR が選択肢として提示していた点の具体化:

- **サイズガードの具体形（ADR-001 / P-002）:** 「base64 後の総サイズで 20MB 評価」を、raw バイト列を実際にエンコードせず `Math.ceil(byteLength / 3) * 4` で **エンコード後サイズを見積もって** `MAX_REQUEST_BYTES = 20 * 1024 * 1024` と比較する形で実装（巨大バッファを base64 化する前に弾く）。ADR-001 が挙げた 2 案（「encoded 後で評価」「raw 約 14MiB」）のうち前者を採用。raw ≈ 15 MiB 超でガード発火（15 MiB → 見積 base64 ≈ 20.97 MB > 20 MiB）。
- **空 API キーの検査位置:** OCR/PDF アダプターはコンストラクタで plain `Error` を投げるが、speech は port 契約（`SpeechFailureError` のみ throw）と deepgram/openai の「fetch 前に `SpeechFailureError`・no fetch」テストに合わせ、**`transcribe` 内で `SpeechFailureError`** を投げる形にした（コンストラクタでは投げない）。model 非空は `SpeechRecognitionConfig.create`（VO）が保証するためアダプターでは再検査しない。
- **locale のプロンプト織り込み:** `input.locale` を system prompt 末尾に soft hint（`The audio is expected to be in the "<locale>" locale.`）として付与。空 locale ではベースプロンプトのまま（モデルに言語推定を委ねる）。
- **`pingGeminiSpeech`:** deepgram/openai と同じ `speechConnectionPing.ts` ファイル構成を保つための薄い委譲ラッパ（`pingGemini` をそのまま呼ぶ・独自ロジックなし、ADR-002）。
- **既存テストの追従更新:** 二重リスト不変条件をピン留めする既存テスト 2 本（`valueObject.test.ts` の `SpeechRecognitionConfig.providers`、`schema.test.ts` の `SPEECH_PROVIDERS_TRANSPORT`）に `"gemini"` を追加（fail-fast 設計どおりリスト追加で赤くなったため）。
