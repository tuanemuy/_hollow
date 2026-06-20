# レビュー: PR #765 — Deepgram 文字起こしアダプター（Adapter 観点）

対象: `app/core/adapters/deepgram/{speechRecognitionProvider,speechConnectionPing,index}.ts` / `app/core/adapters/speech/registry.ts`
比較基準: `app/core/adapters/openai/{speechRecognitionProvider,speechConnectionPing,index}.ts`
受け入れ基準: AC-1 / AC-2 / AC-5 / AC-8（plan.md）

## 受け入れ基準の検証

- **AC-1（registry 網羅性・dispatch）**: `speechProviderRegistry: Record<SpeechProviderId, SpeechAdapter>` に `deepgram: deepgramSpeechAdapter` が登録され、union 拡張により未登録だと型エラー。実 registry を import する `speech/__tests__/registry.test.ts` を新設し、`lookupSpeechAdapter("deepgram")` の解決と未登録文字列 → `undefined` を検証。**満たす**。
- **AC-2（port 契約）**: `transcribe` は空キー / 非 2xx / timeout / transport / JSON 不正のすべてを `SpeechFailureError` に集約。`pingDeepgramSpeech` は throw せず discriminated result を返し、`index.ts` で `{ok,error}` に畳む。**満たす**。
- **AC-5（DI / probe）**: DI（`serverCloudflare.ts`）は generic のまま無変更で `ADMIN_SPEECH_PROVIDER=deepgram` を registry に流す。probe は実音声を送らず `GET /v1/projects` で 2xx = 疎通成功。**満たす**。
- **AC-8（境界テスト対称性）**: 2xx（transcript 抽出）/ 4xx(401,429) / 5xx(500) / timeout(DOMException) / 空発話（欠落・空 channels・空白）/ transport / 非 JSON / secret マスキング、ping の成功・失敗・timeout・空キー・空 model・マスキングを OpenAI と対称に網羅。27 件すべて green。**満たす**。

## Adapter

### Blockers

なし。

### Warnings

- **[W-001]** Deepgram ping の非 2xx で `err_code` を読み取らず reason のプレフィックスにしていない / 場所 `app/core/adapters/deepgram/speechConnectionPing.ts:34-39,90-106` / 理由 OpenAI ping は `body.error.type` を抽出し `` `${type}: ${masked}` `` の形でカテゴリ接頭辞を付ける（`speechConnectionPing.ts:93,102`）が、Deepgram は `DeepgramErrorBody` に `err_code` を型として定義しているのに実際には `err_msg`/`message`/`reason` しか読まず、`err_code`（例: `INVALID_AUTH` / `RATE_LIMIT_EXCEEDED`）を捨てている。接続テスト UI に出る reason の分類情報が OpenAI 比でわずかに薄い。漏洩・誤動作はなく ADR-004 判断 1 の防御的フィールド読みの方針には沿うが、対称性の観点では軽微な非対称。/ 提案 `err_code` が文字列なら OpenAI の `type` と同様に `` `${err_code}: ${masked}` `` で接頭辞化するか、`DeepgramErrorBody.err_code` を「読まないなら型から落とす」かのどちらかに揃えると、未使用フィールドの混乱が消える。

### Notes

- **[N-001]** raw-body 直送が正しく実装され、テストで `init.body` が `FormData` でなく `input.audioBytes` そのものであることを直接アサート（`__tests__/speechRecognitionProvider.test.ts:84-85`）。OpenAI の multipart との構造差分（ADR-001）が回帰テストで固定されている。良い。
- **[N-002]** `Authorization: Token <key>`・URL パラメータ（`model`/`language`/`smart_format=true`）・抽出パス `results.channels[0].alternatives[0].transcript` がいずれも ADR-001 / Deepgram prerecorded 仕様どおり。空 locale で `language` を URL から完全に省略する分岐（`buildListenURL`）も blank 送信を避けており適切。
- **[N-003]** workerd timeout の二重判定（`DOMException` と `Error` を別々にチェックする `isAbortError`）が transcribe・ping 両方で OpenAI と完全対称。テストも「型一致だけでなく `timed out` 文言」をアサートしており、Node 上で `DOMException extends Error` になる罠を回避できている（`__tests__:202-226`, ping `__tests__:88-107`）。良い。
- **[N-004]** secret マスキングが port 契約どおり: transcribe の非 2xx は `sanitizeErrorReason`（categorize+mask）、ping は `maskSecrets` のみ（categorize なし）という OpenAI と同じ sanitize/mask 非対称を踏襲。API キー自体はレスポンスボディ由来でないため echo されず、ボディ中の `sk-` プレフィックストークンがマスクされることをテストで確認（transcribe `:243-262`, ping `:119-133`）。ADR-004 判断 2 のとおり Deepgram 専用プレフィックス（`dg-` 等）マスキング非対応は本 Issue スコープ外で妥当。
- **[N-005]** registry 登録は OpenAI と対称で value cycle 回避（`deepgram/index.ts:4` が `import type { SpeechAdapter }`）も同型。`speech/registry.ts` のコメント「currently only OpenAI」は文言更新漏れだが Adapter の動作には無関係（プレゼン/ドキュメント側の軽微指摘につき本観点では非ブロッカー）。
- **[N-006]** 空発話契約: transcript が string でない（欠落）→ `""`、`.trim()` 後の空白のみ → `""`。`typeof transcript !== "string"` ガードで `channels`/`alternatives` 欠落・空配列も安全に `""` に落ちる（`speechRecognitionProvider.ts:201-207`）。テストで欠落・空 channels・空白の 3 ケースを網羅。良い。
- **[N-007]** OpenAI には `MAX_AUDIO_BYTES`(25MiB) のサイズ上限ガードがあるが Deepgram には無い。これは ADR-001 で「Deepgram は明示上限が緩いので上限ガードは設けず timeout に委ねる」と明示的に判断済みの意図的非対称であり、欠落ではない。問題なし（記録目的のメモ）。
