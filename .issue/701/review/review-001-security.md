# PR #736 セキュリティレビュー (Issue #701)

レビュー観点: Security
対象: 録音＋文字起こしによるノート化 / Speech プロバイダ設定別枠化
基準: plan.md AC-1（暗号化 / env>db）, adr.md, 既存 LLM 設定パターンとの対称性

判定サマリ: Blockers 0 / Warnings 3 / Notes 5

総評: API キーの at-rest 暗号化（SecretBox）・平文の非露出・env>db フォールバック・admin 認可（二重）・接続テストの secret masking・transport schema による ciphertext probing 封じ込めは、いずれも既存 LLM 設定の確立済みパターンに忠実で、悪用可能な漏洩経路は確認できなかった。**悪用可能/即時の漏洩 Blocker はゼロ**。指摘は防御の薄い箇所・将来の劣化リスク・既存負債の継承に関する Warning / Note にとどまる。

---

## Security

### Blockers

- **なし** — 平文 API キーがトランスポート/レスポンス/ログ/DTO へ漏れる経路、env>db 優先のサイドチャネル、認可バイパス、ciphertext probing のいずれも、実コード追跡の範囲で具体的な悪用経路を発見できなかった。

### Warnings

- **[W-001] 録音アップロード経路 `uploadFileFn` が CSRF ミドルウェア未適用（既存負債の継承）**
  場所: `app/components/ingestion/actions.ts:24-31`（`uploadFileFn`）/ 比較: `app/components/admin/SpeechSettingsForm/action.ts:21`（`csrfMiddleware` 適用済み）
  理由: 本 PR の Speech admin server function（`updateSpeechConfigFn` / `testSpeechConnectionFn`）は `errorResponseMiddleware, csrfMiddleware` を正しく適用しており CSRF 耐性がある。一方、録音 UI（`AudioRecorder.tsx:293`）が再利用する `uploadFileFn` は `errorResponseMiddleware` のみで `csrfMiddleware` を持たない。これは本 PR で導入された欠陥ではなく既存の状態（PR は `uploadFileFn` を無改変で再利用）だが、本 PR によって「マイク録音 → 任意音声をユーザーのノートに投入」という新たな state-changing 経路がこの未防御 fn に増える。`SameSite=lax` の session cookie はトップレベル cross-site POST で送信されうるため、悪意サイトからの強制アップロード（音声取り込みジョブ生成 → LLM/transcribe 課金の誘発、ノート量産）が理屈上成立する。
  提案: スコープ判断として本 PR で直すか別 Issue 化するかは委ねるが、**最低限 Issue 化して追跡**すべき。`uploadFileFn` に `csrfMiddleware` を追加するのが筋（multipart の `inputValidator` は `csrfMiddleware` と独立に機能するため `.middleware([errorResponseMiddleware, csrfMiddleware])` への変更で足りる）。録音導線が増える本 PR がこの差分の動機になっている点をレビューコメントに残すこと。

- **[W-002] 接続テストの draft probe が任意 `model` 文字列を env キーで OpenAI に投げられる（admin-gated だが入力面の正当性確認）**
  場所: `app/components/admin/schema.ts:87-97`（`testSpeechConnectionSchema`）→ `app/core/application/adminSettings/testSpeechConnection.ts:88` → `app/core/adapters/openai/speechConnectionPing.ts:36-40`（`GET {baseURL}/models/{encodeURIComponent(model)}`）
  理由: draft は `apiKeySource:"env"` / `apiKeyCiphertext:null` に literal でロックされており（ciphertext probing は正しく封じている。良い設計）、`baseURL` 軸も Speech VO に存在しないため endpoint は常に `api.openai.com` 固定で **SSRF は成立しない**。残る入力は `model`（`max(200)`）で、これは `encodeURIComponent` でパスエスケープされ path injection も成立しない。したがって直接の脆弱性ではない。ただし「admin が任意 model 名を env キー認証付きで OpenAI の `GET /models/{model}` に投げられる」こと自体は、認可済み admin に閉じた低リスク面として認識しておくべき（admin 権限の悪用前提なので現実的脅威は低い）。
  提案: 現状維持で可。`model` の max 200 と `encodeURIComponent` で十分。将来 Speech に `baseURL` 軸を足す場合は LLM 側の `testLLMConnectionSchema.refine`（`provider==='openai' || baseURL===null`）相当の SSRF ガードを必ず同時に入れること（現状 LLM schema にはあるが Speech にはない＝今は不要だが拡張時の落とし穴）。コメントで明記。

- **[W-003] transcribe アダプタの成功パス JSON ボディは secret masking を通らない（現状は安全だが将来の変更に脆い）**
  場所: `app/core/adapters/openai/speechRecognitionProvider.ts:160-173`
  理由: 非 2xx パス（144-158 行）は `body.error?.message` を `sanitizeErrorReason`→`toReasonString` で必ずマスクしてから `SpeechFailureError` に載せており適切。一方、2xx 成功パスでは `body.text` を `trim()` してそのまま返す（=文字起こし結果でユーザー由来テキスト、秘匿対象ではない）。現状この戻り値は `runIngestionJob.ts:564` で `SpeechFailureError` のときのみ `""` に縮退され、`SpeechFailureError` の `message`（status 由来・マスク済み）も UI に到達しない（swallow される）ため**実害なし**。リスクは「将来 `SpeechFailureError.message` をユーザー向けに表示する変更」や「`cause` を握り潰さずログ出力する変更」が入ったとき。`SpeechFailureError` の `cause` には素の `fetch` 例外（URL を含みうる）や OpenAI のエラーオブジェクトがそのまま入る（129-139 行で `cause` を第2引数に保持）。
  提案: 現状はパスするが、`SpeechFailureError` を握る側（`runIngestionJob` の `classifyPipelineError`・ログ）が将来 `error.message` / `error.cause` を構造化ログや UI に流さないことを保証するテスト or コメントを 1 行残すと劣化を防げる。最低限「`SpeechFailureError.message`/`cause` は UI 非露出・ログ非露出が前提」である旨を adapter JSDoc に追記推奨。

### Notes

- **[N-001] `maskApiKey` は ciphertext の末尾4文字を露出する（設計どおり・低エントロピー）**
  場所: `app/core/application/adminSettings/view.ts:28-41`
  内容: `apiKeySource==='db'` のとき `"••••"+ciphertext.slice(-4)` を返す。露出するのは**平文鍵ではなく暗号文（AES-GCM）の末尾4 base64 文字**で、JSDoc どおりエントロピーは無視できる。平文 API キーは一切露出しない。env ソース時は `null`（"environment" 表示）。`env.apiKey` がある場合は `toInstanceSettingsView:62-65` で belt-and-suspenders に mask 自体をスキップし、`toInstanceSettingsDTO:332/339` でも二重に null 化。多層防御が効いており妥当。指摘なし（記録のみ）。

- **[N-002] env>db 優先は decrypt 前に分岐し、サイドチャネルなし**
  場所: `app/core/application/adminSettings/testSpeechConnection.ts:69-86` / `service.ts:78-85`（`decryptSpeechApiKey`）/ `serverCloudflare.ts:1120-1145`（consumer 解決）
  内容: env キーが存在する場合は `decryptSpeechApiKey` を**呼ばずに** env 値を採用する（71-72 行 / consumer 1122-1123 行）。env 優先時に DB ciphertext を復号しないため、復号成否のタイミング差を使ったサイドチャネルは生じない。`assertSpeechEnvOverride`（`service.ts:94-114`）も env 在処時は ciphertext を null 化して保存し、DB に古い暗号文を残さない。env>db の優先順位は LLM 側と完全対称で正しい。

- **[N-003] consumer パスの復号失敗は Stub 縮退でフェイルクローズ、ログに ciphertext を出さない**
  場所: `app/core/application/di/serverCloudflare.ts:1124-1144`
  内容: DB ciphertext の復号失敗時、`ConsoleLogger.warn` は `{ code: cause.code }`（SecretBox エラーコードのみ）または `{ cause }` を出すが、**ciphertext / 平文鍵そのものは出さない**。`SecretBoxError` でない場合の `{ cause }` 出力は素の例外を含むため理論上 stack に何か混ざりうるが、SecretBox の復号失敗で平文鍵が cause に乗る経路はない（鍵未確定で復号する前段の失敗）。鍵ローテーション中の previous-key fallback（`decryptWithFallback`）も narrow に `DecryptFailed` のみ retry で妥当。フェイルクローズ（Stub 縮退）は ADR-008 どおり。

- **[N-004] `updateSpeechConfig` の env-override-skip ログは field 名のみ（鍵・値を出さない）**
  場所: `app/core/application/adminSettings/updateSpeechConfig.ts:95-103`
  内容: `container.logger.warn("admin_speech_env_override_skip", { fields: skippedFields })` の payload は `["provider","model"]` のような field 名配列のみで、env 値・input 値・ciphertext を含めないことがコメント（99 行）と実装で担保されている。LLM 側の silent-skip ログと対称。秘匿漏れなし。なお、apiKeyPlain を一旦 encrypt してから env 優先で drop する制御フロー（47-50 行）は「admin-gated・安価な web-crypto」を理由にした意図的設計で、平文がログに残ることはない。

- **[N-005] 録音 UI のマイク権限・サイズ上限・object URL ライフサイクルは適切**
  場所: `app/components/ingestion/AudioRecorder.tsx`
  内容: `getUserMedia` 失敗（権限拒否・デバイス無し・非セキュアコンテキスト）は単一 catch で `permission-denied` 状態に縮退しフォールバック導線を提示（169-182 行・516-530 行）。録音は 24MB（OpenAI 25MiB 未満）/ 30分でハードキャップし auto-stop（37-43, 208-213, 247-252 行）、ファイルアップロード経由の transcribe adapter 側でも 25MiB を再検証（`speechRecognitionProvider.ts:97-101`）、`uploadFile` usecase でも server-side バイト上限・日次クォータを enforce（`uploadFile.ts:72-84`）するため、DoS（巨大録音による課金/帯域）は多層で抑止されている。`MediaStream` のトラック停止（137-142 行）・object URL の revoke（144-149, unmount cleanup 152-164 行）も漏れなく実装。マイク取得は明示ユーザー操作（「録音を開始」ボタン）起点でサイレント取得なし。問題なし。

---

## 補足: 検証した非問題（誤検知の事前排除）

- **transport schema の DoS/shape 防御は十分**: `updateSpeechConfigSchema`（schema.ts:75-79）は `provider` enum・`model` 1..200・`apiKeyPlain` 1..4096|null で bound 済み。`testSpeechConnectionSchema`（87-97）は draft を `apiKeySource:literal("env")`/`apiKeyCiphertext:z.null()` にロックし、**クライアントが任意 ciphertext を投げて復号 probe する経路を構造的に封じている**（コメント 81-86 行のとおり LLM 側と対称）。`@/core/domain/*` 非依存も維持。
- **admin 認可は二重**: server fn 入口の `requireAdminUser`（`speech.tsx:11` / `action.ts:24,44`）＋ usecase 内 `assertAdmin`（`updateSpeechConfig.ts:54` / `testSpeechConnection.ts:46`）。`assertAdmin`（authorization.ts:14-39）は deleted/suspended/非admin を全て `ForbiddenError` に落とす。`actorUserId` はクライアント入力ではなくサーバ解決の `actor.id` を渡している（action.ts:33,51）ため、なりすまし不可。
- **DTO/RSC に平文・ciphertext を渡していない**: `InstanceSettingsDTO.speech`（dto/adminSettings.ts:94-100）は `provider/model/apiKeySource/apiKeyMasked/envOverrides` のみ。`apiKeyCiphertext` も平文も DTO に存在しない。`/admin/speech` ルートは RSC で admin 限定レンダー。
- **接続テストのエラー文字列は二重マスク**: `speechConnectionPing.ts:76`（`maskSecrets`）→ `HttpSpeechConnectionTester.ping`（speechConnectionTester.ts:61-63 で `maskSecrets` 再適用、defense-in-depth）→ `testSpeechConnection` が UI へ返す。Bearer/key が露出しない。timeout/abort 経路（83-86 行）も category のみ。
- **SSRF なし**: Speech VO に `baseURL` 軸が存在しない（ADR-003）ため endpoint は `api.openai.com` 固定。LLM 側のような operator-controllable baseURL による内部 SSRF 面が Speech には無い。
