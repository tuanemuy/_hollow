# レビュー 001 — Issue #701 / PR #736

観点: **Adapter + Infrastructure**
レビュー日: 2026-06-14
対象差分: `gh pr diff 736`
判定基準: `.issue/701/plan.md`（AC-1〜AC-7）、`.issue/701/adr.md`（ADR-001〜008）

総括: バックエンド Adapter/Infra 層は計画・ADR に忠実で、registry・barrel の cycle 回避、migration 後方互換、repository 双方向マッピング、DI の env>db>stub フォールバック（request/consumer 両パス）、secret masking はいずれも LLM 側の先例と対称に正しく実装されている。AC-1（env>db/暗号化）・AC-2（DI 置換）・AC-3（transcribe 実体）は実装上満たされている。ただし **Cloudflare Workers 実行時の `AbortError` 判定が reference adapter（`messagesClient.ts` / `connectionPing.ts`）の `DOMException` 二重チェックパターンから外れており、Workers 上で timeout が timeout として分類されない**回帰可能性が transcribe アダプタと speech ping の双方にある（Blocker ではないが Workers 適合の観点で要対応）。

---

## Adapter + Infrastructure

### Blockers

- **[B-001]** なし

Adapter/Infra 層に、ビルドを壊す・データを破損させる・AC を満たさない、といった致命的欠陥は検出されなかった。下記 Warnings は Workers 実行時の品質劣化・パリティ崩れであり、機能はいずれも `SpeechFailureError` / `{ok:false}` に縮退するためクラッシュには至らない。

### Warnings

- **[W-001]** Workers 上で transcribe の timeout が timeout として分類されない（`DOMException` 判定漏れ） / 場所: `app/core/adapters/openai/speechRecognitionProvider.ts:130` / 理由: catch 節が `cause instanceof Error && cause.name === "AbortError"` のみで判定している。Cloudflare Workers（workerd）の `AbortController.abort()` は **`DOMException`（name="AbortError"）** で fetch を reject し、workerd の `DOMException` は **`Error` を継承しない**。このため Workers 本番では timeout が第1分岐に入らず、第2分岐の汎用 `sanitizeErrorReason` に落ちて「timeout」ではなく transport カテゴリの `SpeechFailureError` メッセージになる。reference の `messagesClient.ts:105-107` / `connectionPing.ts` 系・`sanitizeErrorReason.ts:237` の `isAbortError` は **`DOMException` と `Error` の両方**を見ており、本アダプタだけがこのパターンから外れている。ADR-001 が「`messagesClient` と対称に組む」と明記している点にも反する。/ 提案: `messagesClient.ts` の `isAbortError`（`error instanceof DOMException && error.name === "AbortError"` を含む）を流用するか同等の二重チェックに変更する。`sanitizeErrorReason` から `isAbortError` を再 export して共有しても良い。

- **[W-002]** 同じ `DOMException` 判定漏れが speech ping にもあり、**接続テスト（AC-1）の UI 表示で timeout が timeout reason にならない** / 場所: `app/core/adapters/openai/speechConnectionPing.ts:83` / 理由: `error instanceof Error && error.name === "AbortError"` のみ。W-001 と同根だが、こちらは `HttpSpeechConnectionTester` を通じて **admin の「接続テスト」UI に reason 文字列として出る**ため利用者影響がより直接的。Workers 上では timeout 時に「Request timed out after Nms」ではなく `sanitizeErrorReason` の汎用 reason が表示される。LLM 側 `connectionPing.ts` は `isAbortError`（DOMException 込み）で正しく扱っている。/ 提案: W-001 と同じ `isAbortError` 共有に揃える。

- **[W-003]** transcribe アダプタの timeout/transport catch のテストが **DOMException 分岐を実質検証していない**（Workers 回帰を素通しする） / 場所: `app/core/adapters/openai/__tests__/speechRecognitionProvider.test.ts:200-214` / 理由: テストは `new DOMException("aborted","AbortError")` で reject させているが、assertion は `rejects.toBeInstanceOf(SpeechFailureError)` のみ。第1分岐（timeout）も第2分岐（transport）も等しく `SpeechFailureError` を投げるため、**W-001 の分岐ミスがあってもテストは緑のまま**。加えて Node の vitest 環境では `DOMException` が `Error` を継承する実装があり、本番 workerd との差で「ローカルでは通るが Workers で挙動が違う」状態を隠す。/ 提案: timeout ケースは `SpeechFailureError` であることに加え `.message` が timeout 文言（例 `/timed out/`）を含むことまで assert する。ping 側（`speechConnectionPing.test.ts`）も同様に reason が timeout 文言を含むことを検証する。`DOMException instanceof Error` に依存しないこと自体がテストの狙いになる。

- **[W-004]** transcribe の非2xx 経路は `sanitizeErrorReason`（masking 込み）を通すが、**HTTP ステータスのみのフォールバック detail がそのまま `SpeechFailureError` メッセージに入る一方、ping 側の非2xx は `maskSecrets` のみで category 正規化をしない**という非対称がある / 場所: `speechRecognitionProvider.ts:144-158`（`sanitizeErrorReason` 経由）vs `speechConnectionPing.ts:69-81`（`maskSecrets` のみ）/ 理由: これは実は reference（`messagesClient` は detail を `sanitizeErrorReason`、`connectionPing` は `maskSecrets`）の非対称をそのまま踏襲しており**意図的**だが、speech 側で両ファイルが同居するため一見不整合に見える。masking 自体はどちらも効いており secret 漏洩は無い（B 不要）。/ 提案: 必須ではない。コメントで「ping は probe 用に category 正規化を省く（messagesClient/connectionPing の非対称を踏襲）」と一言残すと将来の混乱を防げる。

### Notes

- **[N-001]** AC-1 暗号化保管・AC-2 DI 置換は正しく満たされている。`buildSpeechRecognitionProvider`（`serverCloudflare.ts:603-619`）は「env キー無 OR `lookupSpeechAdapter` 未ヒット」で `StubSpeechRecognitionProvider` に縮退し container 構築を必ず成功させる（ADR-008 どおり）。request パス（`:712`）と consumer パス（`resolveConsumerSpeechConfig` `:1101-1152` → `:919`）の両方で `speechRecognitionProvider` を override し、`StubSpeechRecognitionProvider` ハードコードを置換済み。consumer の env>db 解決・`decryptWithFallback`（previous 鍵フォールバック）・復号失敗時の `null`→Stub 縮退・`.catch(()=>null)` の DB 読み出し耐性は `resolveConsumerLlmConfig` と完全対称。

- **[N-002]** migration `0017_add_speech_config.sql` は後方互換に正しい。`speech_provider`/`speech_api_key_source` は NOT NULL + DEFAULT で既存 singleton 行が backfill 不要で materialize、`speech_model`/`speech_api_key_ciphertext` は nullable、`speech_api_key_source IN ('env','db')` の CHECK を `ALTER ADD COLUMN` に付与（SQLite で有効）。連番 0017 は 0016 の次で正しく、journal/meta マニフェストは存在せずディレクトリ glob 適用方式（既存どおり）。`schema.ts:766-769,784-787` の drizzle 定義と DDL は一致。

- **[N-003]** repository の `toEntity`/`save` 双方向マッピング（`instanceSettingsRepository.ts:100-105, 200-203, 225-228`）は INSERT・UPDATE 両系路に speech 4 列を対称に追加しており正しい。`coerceSpeech`（`entity.ts:144-162`）は NULL/欠落を `defaultSpeech()` に縮退、`reconstruct`（`:397-414`）が `create` 失敗を `RehydrationError` → `toEntity` が `SystemError(DataIntegrityError)` に写像するため、`speech_api_key_source='db'` かつ ciphertext NULL という不整合行も安全に弾く（LLM と対称）。

- **[N-004]** OpenAI multipart は Workers 適合。`new Blob([input.audioBytes], { type: input.mime })` + `FormData.append("file", blob, filenameForMime(mime))` で構築し、`Content-Type` は手で設定せず fetch に boundary 生成を委ねている（`speechRecognitionProvider.ts:106-128`、JSDoc にも明記）。25 MiB 事前検出（`:97-101`）と境界テスト（`test:143` exactly-at-limit は pre-fail しない）、空発話→空文字（`:169-173` text フィールド欠落 / 空白のみ→`trim()` で `""`）、`AbortController` + `setTimeout`/`clearTimeout` の timeout 制御はいずれも実装・テスト済み。`filenameForMime` の `x-` プレフィックス除去（ADR-008）も妥当。

- **[N-005]** registry / barrel の value cycle 回避は計画どおり。`speech/registry.ts:10` が `openaiSpeechAdapter` を value import、`openai/index.ts:5` が `import type { SpeechAdapter }` の型のみ依存で受ける一方向。`Record<SpeechProviderId, SpeechAdapter>`（`registry.ts:47`）でコンパイル時網羅、`lookupSpeechAdapter`（`:56-60`）が未登録 provider に `undefined` を返し DI 境界で typo を縮退できる。VO 側 INVARIANT コメント（`valueObject.ts:258-267`）に provider↔default model 対応（`openai→gpt-4o-transcribe`）まで明記され S-004 を満たす。

- **[N-006]** ping の throw しない契約は守られている。`pingOpenAISpeech`（`speechConnectionPing.ts`）は全経路で `{ok}|{ok:false,reason}` を返し（空 key/空 model の早期 return 含む）、`HttpSpeechConnectionTester`（`speechConnectionTester.ts:32-64`）も `{ok,latencyMs,error?}` に正規化して throw しない。ping の reason は `maskSecrets`、tester 側でも defense-in-depth で再 `maskSecrets`（`:61-62`）。ADR-006 どおり `GET /models/{model}` の軽量 probe（実音声非送信）で `encodeURIComponent(model)` 済み。

- **[N-007]** secret masking は適切。transcribe の非2xx/transport detail は `sanitizeErrorReason`→`toReasonString`（masking 込み）、ping は `maskSecrets`。`authorization: Bearer ${apiKey}` ヘッダはログ/レスポンス本文に出ず、`SpeechFailureError`/probe reason に平文 key が混入する経路は確認した範囲で無い。手動テスト（`.issue/701/manual-test/`）でも DB ciphertext が `ENCRYPTED`・UI が `••••GgzY` マスク・平文非エコーを確認済み。

- **[N-008]** （AC-6 関連・application 層だが Infra 結合）`runIngestionJob.ts:286-297` の early-return 縮退分岐は `SpeechFailureError`-only catch（`extractText:564`）と組み合わさり、未設定時 Stub の `BusinessRuleError('unsupported_format')` を素通しして従来どおり `markFailed` に落とす（ADR-005 / Round 2 P-001 どおり）。`INGESTION_SPEECH_FAILURE_NOTE_HTML` は信頼定数としてサニタイザ非経由で `ContentHtml.create` に渡し `class="ingestion-failure-note"` を保持。Infra 観点での懸念なし。

- **[N-009]** `wrangler.toml` は `ADMIN_SPEECH_MODEL`/`ADMIN_SPEECH_PROVIDER` を `[vars]` に、`ADMIN_SPEECH_API_KEY` を secret として正しく分離。ただし **default で `ADMIN_SPEECH_MODEL`/`PROVIDER` が env-set されて出荷される**ため、API キー未設定でも `updateSpeechConfig`（`:59-62`）の silent-skip が常時アクティブになり、DB-source 運用時に model/provider フィールドが env-lock される。これは LLM 側の env>db 既定と一貫した意図的挙動（ADR-003/008）であり不具合ではないが、「キー無しなのに model だけ env 固定表示」が運用者に紛らわしくないか、ドキュメント（`docs/runtime_cloudflare.md`）で env-lock 条件を明示しておくと親切。

- **[N-010]** （検証メモ）手動テストの happy path（実 OpenAI 呼び出しを伴う AC-3 transcribe 疎通・AC-1 接続テスト成功・AC-5 録音由来 MediaAsset メタデータ）は `ADMIN_SPEECH_API_KEY` 未設定により out of scope として未実施（`report.md`）。ADR-001/リスク欄が指摘する「Workers 上の multipart `fetch` 実音声疎通」は **本 PR では実機未確認**。W-001/W-003 の timeout 分岐ミスと併せ、キー設定後の Workers 実機での transcribe 1 本疎通＋timeout 注入を残課題として明示しておくことを推奨（コードは PoC 前提で組まれているが、PoC 完了の記録は差分上見当たらない）。

---

## AC 充足サマリ（Adapter+Infra 観点）

- **AC-1（env>db/暗号化/接続テスト）**: 満たす。env>db>stub の解決・SecretBox 暗号化往復・`GET /models/{model}` probe いずれも実装・対称。timeout reason の Workers 表示のみ W-002。
- **AC-2（DI 置換, request/consumer 両パス）**: 満たす（N-001）。
- **AC-3（transcribe 実体）**: コード上満たす（N-004）。実機 multipart 疎通は未確認（N-010）。
