# レビュー: Test 観点 — PR #794 (Issue #766 Gemini speech provider)

レビュー対象差分:
- `app/core/adapters/gemini/__tests__/speechRecognitionProvider.test.ts`（新規・291行）
- `app/core/adapters/gemini/__tests__/speechConnectionPing.test.ts`（新規・111行）
- `app/core/adapters/speech/__tests__/registry.test.ts`（変更・gemini ディスパッチ追加）
- `app/core/domain/adminSettings/__tests__/valueObject.test.ts`（変更・VO list pin 更新）
- `app/components/admin/__tests__/schema.test.ts`（変更・transport list pin 更新）

対称性基準: `app/core/adapters/deepgram/__tests__/{speechRecognitionProvider,speechConnectionPing}.test.ts`
実装根拠確認: `app/core/adapters/gemini/{speechRecognitionProvider,speechConnectionPing,messagesClient,connectionPing}.ts`, `app/core/application/llm/sanitizeErrorReason.ts`

---

## Test

### Blockers

なし

AC-5 が要求する adapter 境界の全ケースと registry ディスパッチ、二重リスト pin は揃っており、deepgram テストと対称（むしろ上回る）。実装根拠（messagesClient の `throwForStatus` 分岐、`isAbortError`、`maskSecrets` の AIza マスキング、pingGemini の reason 文言）を実コードで突き合わせ、テストのアサーションが実際の振る舞いと一致することを確認した。マージ阻害事項なし。

### Warnings

- **[W-001]** transcribe の 401 / 403 / 429 ケースが `toBeInstanceOf(SpeechFailureError)` だけで HTTP ステータス文言を検証していない / `speechRecognitionProvider.test.ts` L1031-1066（"maps HTTP 401/403/429"）/ deepgram は 401 で `message.toContain("HTTP 401")` を、Gemini 自身も 400/500 では `toContain("HTTP 400")` / `"HTTP 500"` を確認しているのに、quota/rateLimit 経路だけ文言アサートが欠落。`speechErrorMapper` が 4 カテゴリすべてを同一 `SpeechFailureError` に畳むため throwForStatus の分岐ミス（例: 429 が rateLimit 分岐ではなく汎用フォールスルーへ落ちる回帰）をテストが検出できない。port 契約上は「非2xx→SpeechFailureError」で機能等価のため severity は低いが、deepgram との対称性と回帰検出力のため `expect(message).toContain("HTTP 401")` 等を各ケースに追加することを提案。

- **[W-002]** サイズガードの「上限直下は通過する（fetch に到達する）」境界が pin されていない / `speechRecognitionProvider.test.ts` L993-1005（oversize 拒否のみ）/ 拒否側（15MiB+1 → SpeechFailureError・no fetch）は厳密だが、上限直下（例: 15MiB ちょうど）が fetch に到達することを直接示すテストが無い。happy path は 8 バイトで「小さい音声は通る」ことは担保するが、`MAX_REQUEST_BYTES` の閾値や推定式 `Math.ceil(byteLength/3)*4` が将来過剰拒否側へ回帰しても拒否テストは PASS し続ける。openai の 25MiB プリフライトと対称に「直下は通過」を 1 ケース足すと境界が両側で固定される。Note 寄りの軽微指摘。

### Notes

- **[N-001]** 偽の安心を避ける良い実装。base64 検証を adapter 自身の `arrayBufferToBase64` ではなく独立した `btoa(String.fromCharCode(...))` で固定バイト列から再計算して突き合わせており（L888-889, L946）、エンコーダの自己参照的検証になっていない。mime も `"audio/webm"` がそのまま `inlineData.mimeType` に通ることをアサート（L945）し、ハードコード化していないことを確認できている。

- **[N-002]** Gemini テストは deepgram リファレンスを網羅的に上回る。AC-5 が列挙する 2xx/4xx/5xx/timeout/空音声に加え、**HTTP 400（未対応 mime → unavailable 経路 → SpeechFailureError、L1009-1029）**、**403（quota 経路、L1044-1055）**、**base64 後サイズ超過プリフライト（L993-1005）**、**maxOutputTokens=16384 上書き（L948）**、**locale のシステムプロンプト織り込み（L950, 空 locale 省略 L971-980）** を追加で検証。送信形（inlineData base64 / `x-goog-api-key` ヘッダ / URL に key を載せない / `key=` 不在）も happy path で固めており（L932-946）、重点項目はすべて充足。

- **[N-003]** AC-1（実フォーマット受理）が誤って「検証済み」と表現されていない。`progress.md` は AC-1 を「マージ前提条件・未実施」と明記し、`testing.md` 確認項目 3 と既存機能影響節は「`pnpm test` は契約準拠のみで実フォーマット受理は確認できない」「ノート保存成功を AC-1 合否に使わない（`runIngestionJob` の SpeechFailureError 握り潰しで空 transcript が成功に化ける）」を繰り返し警告。HTTP 400 テストのコメント（L1010-1011）も「unsupported mime が Gemini 400 として現れる代理ケース」と正しく枠付けし、実 webm 受理を主張していない。fetch モックの限界が誠実に開示されている。

- **[N-004]** ping 委譲テスト（5 ケース）の粒度は妥当。`pingGeminiSpeech` は `pingGemini` への verbatim 委譲であり、実体 `pingGemini` は `connectionPing.test.ts`（8 ケース）で network TypeError / HTTP ステータスフォールバック等を独立に網羅済み。speech 側は委譲が probe 契約（`x-goog-api-key` / discriminated result / key 空ガード / timeout 文言 / masking）を保つことの確認に絞られており、二重テストの冗長を避けつつ要点を押さえている。reason 文言（"Request timed out after 5ms" / "API key is empty" / "UNAUTHENTICATED: API key invalid"）は connectionPing.ts の実装文字列と一致することを確認。

- **[N-005]** マスキングテストは実効性あり（偽の安心ではない）。`sanitizeErrorReason.ts` L128 の `\bAIza[A-Za-z0-9_-]{8,}` で `AIzaSyLEAKEDKEY1234` が `***` に置換されることを実装で確認。マスキングを外せばエラーメッセージにキーが残りテストが FAIL するため、`not.toContain` アサート（transcribe L1149）/ `toContain("***")` アサート（ping L854）は実際の masking を検証している。なお transcribe 側も ping と対称に `toContain("***")` を足すと「マスクされた痕跡が残る」ことまで固められる（任意）。

- **[N-006]** 二重リスト pin の追従は原子的。`SPEECH_PROVIDERS_TRANSPORT`（schema.test.ts L714-719）と `SpeechRecognitionConfig.providers`（valueObject.test.ts L1422-1427）の両 pin テストが `gemini` 追加に同時追従しており、ドリフトすれば即 FAIL する。registry テストは `speechProviderRegistry.gemini === geminiSpeechAdapter`（実 registry を `vi.mock` せず import）と `lookupSpeechAdapter("gemini")` の双方で identity を pin しており、ディスパッチが正しく固定されている。
