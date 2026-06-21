# レビュー: PR #765 — Deepgram 文字起こしアダプター（Adapter 観点・2回目フルレビュー）

対象: `app/core/adapters/deepgram/{speechRecognitionProvider,speechConnectionPing,index}.ts` / `app/core/adapters/speech/registry.ts` / `app/core/adapters/speech/__tests__/registry.test.ts`
比較基準: `app/core/adapters/openai/{speechRecognitionProvider,speechConnectionPing,index}.ts`
port: `app/core/domain/ingestion/ports/speechRecognitionProvider.ts`
受け入れ基準: AC-1 / AC-2 / AC-5 / AC-8（plan.md）
前回: review-001-adapter.md（W-001 = ping の `err_code` 接頭辞欠落）

## 前回 Warning（W-001）の修正確認

`speechConnectionPing.ts:101-111` で `err_code` を `typeof body.err_code === "string"` で抽出し、`message` が非空のとき `` `${maskSecrets(code)}: ${masked}` `` の形でカテゴリ接頭辞を付けるようになった。OpenAI ping の `type:` 接頭辞（`openai/speechConnectionPing.ts:101-102`）と対称。`err_code` 自体も `maskSecrets` を通しており leak 経路なし。テストで「`INVALID_AUTH: bad credentials`（接頭辞あり）」（`:61-75`）と「`err_code` 欠落時は接頭辞なし `rate limited`」（`:77-87`）の両系統を検証。**W-001 解決を確認**。

## 受け入れ基準の検証

- **AC-1（registry 網羅性・dispatch）**: `speechProviderRegistry: Record<SpeechProviderId, SpeechAdapter>` に `deepgram: deepgramSpeechAdapter` 登録（`registry.ts:48-51`）。union 拡張で未登録だと型エラー。実 registry を `vi.mock` なしで import する `speech/__tests__/registry.test.ts` が `speechProviderRegistry.deepgram === deepgramSpeechAdapter`・`lookupSpeechAdapter("deepgram")` 解決・未登録/空文字 → `undefined` を検証。**満たす**。
- **AC-2（port 契約）**: `transcribe` は空キー・非 2xx・timeout・transport・非 JSON のすべてを `SpeechFailureError` に集約（他例外型は throw されない）。空発話（transcript 非 string / 空白）は `""`。`pingDeepgramSpeech` は throw せず discriminated result を返し、`index.ts:20-27` で `{ok,error}` に畳む。**満たす**。
- **AC-5（DI / probe）**: DI（`serverCloudflare.ts`）は generic のまま無変更で registry に流れる。probe は実音声を送らず `GET /v1/projects` で 2xx = 疎通成功（`speechConnectionPing.ts:80-89`）。空 model は OpenAI 対称で `ok:false`（ADR-004 判断 3）。**満たす**。
- **AC-8（境界テスト対称性）**: 2xx（transcript 抽出・raw body アサート）/ 401 / 429 / 500 / timeout(DOMException) / transport(TypeError) / 非 JSON / 空発話 3 系統（欠落・空 channels/alternatives・空白）/ secret マスキング、ping の空キー・空 model・2xx・err_code 接頭辞・接頭辞省略・status fallback・timeout・network・マスキングを OpenAI と対称に網羅。**28 件すべて green を実行確認**。**満たす**。

## Adapter

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** W-001 修正が OpenAI と完全対称に入った。`err_code`（例 `INVALID_AUTH` / `RATE_LIMIT_EXCEEDED`）を抽出し `${maskSecrets(code)}: ${masked}` で接頭辞化（`speechConnectionPing.ts:101-111`）。OpenAI は `type` を `maskSecrets` に通さず素通しだが（`openai/speechConnectionPing.ts:102` は `type:` を masking しない）、Deepgram は `err_code` も `maskSecrets(code)` でマスクしておりむしろ保守的。`err_code` 分類値は secret-bearing でないため挙動差は実害なく、漏洩耐性は上回る。良い修正。

- **[N-002]** transcribe 側の非 2xx は `err_code` を接頭辞化せず `sanitizeErrorReason(message)` のみ（`speechRecognitionProvider.ts:164-188`）。これは OpenAI transcribe が `body.error.type` を使わず `sanitizeErrorReason(body.error.message)` のみ通すのと対称（`openai/speechRecognitionProvider.ts:172-181`）。sanitize（categorize+mask）と mask-only という transcribe/ping の非対称も OpenAI 踏襲。**transcribe に `err_code` 接頭辞が無いのは意図的対称であり W-001 の蒸し返しではない**（W-001 は ping のみの指摘だった）。

- **[N-003]** raw-body 直送がテストで `init.body === input.audioBytes` かつ `not.toBeInstanceOf(FormData)` と直接アサート（`__tests__/speechRecognitionProvider.test.ts:84-85`）。OpenAI multipart との構造差分（ADR-001）が回帰で固定。`Authorization: Token`・URL パラメータ（`model`/`language`/`smart_format=true`）・抽出パス `results.channels[0].alternatives[0].transcript` がいずれも ADR-001 / Deepgram prerecorded 仕様どおり。空 locale で `language` を URL から省略する `buildListenURL` 分岐も blank 送信を回避し適切。

- **[N-004]** workerd timeout の二重判定（`DOMException` と `Error` を別々に判定する `isAbortError`）が transcribe・ping 両方で OpenAI と完全対称（`speechRecognitionProvider.ts:54-64` / `speechConnectionPing.ts:49-59`）。テストが「型一致だけでなく `timed out` 文言」をアサートし、Node 上で `DOMException extends Error` になる罠を回避（transcribe `:202-226` / ping `:103-122`）。良い。

- **[N-005]** secret マスキング: transcribe 非 2xx は `sanitizeErrorReason`（categorize+mask）、ping 非 2xx は `maskSecrets` のみ、という OpenAI と同じ sanitize/mask 非対称を踏襲。2xx 成功ボディは masking を通さないが、transcript は user content で API キーはレスポンスボディ由来でなく echo されない。ボディ中の `sk-` プレフィックストークンがマスクされることを transcribe `:243-262` / ping `:134-148` で確認。ADR-004 判断 2 の Deepgram 専用プレフィックス（`dg-` 等）非対応はスコープ外で妥当。

- **[N-006]** 空発話契約: `typeof transcript !== "string"` ガードで `channels`/`alternatives` 欠落・空配列も安全に `""` に落ち、`.trim()` 後の空白のみも `""`（`speechRecognitionProvider.ts:205-211`）。テストで欠落・空 channels/alternatives・空白の 3 ケースを網羅。良い。

- **[N-007]** OpenAI の `MAX_AUDIO_BYTES`(25MiB) 上限ガードが Deepgram に無いのは ADR-001 の意図的非対称（Deepgram は上限が緩く timeout に委ねる）。コメントでも明記（`speechRecognitionProvider.ts:124-126`）。欠落でなく設計判断。問題なし。

- **[N-008]** `registry.ts:31` のドキュメントコメント「each speech provider barrel exports one of these (currently only OpenAI)」が Deepgram 追加後も「currently only OpenAI」のまま残存（文言ドリフト）。Adapter の動作・型・dispatch には一切影響なし。前回 N-005 で既出の軽微指摘の再掲。プレゼン/ドキュメント観点の cleanup として「OpenAI and Deepgram」等に直すと整合するが、本観点では非ブロッカー。

## 結論

前回 Warning（W-001）は OpenAI 対称に正しく修正済み（むしろ `err_code` も masking する分保守的）。Blocker・Warning なし。port 契約（`SpeechFailureError` のみ throw・ping は result 返却・空発話 `""`）、Deepgram REST 仕様（raw body / Token 認証 / 抽出パス / probe）、workerd timeout、secret マスキング、registry 登録、OpenAI 対称性すべて適合。テスト 28 件 green。**Adapter 観点で承認可**。N-008（registry コメント文言）のみ任意の cleanup。
