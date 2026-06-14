# PR #736 セキュリティレビュー Round 2 (Issue #701)

レビュー観点: Security
対象: 録音＋文字起こしによるノート化 / Speech プロバイダ設定別枠化
基準: plan.md AC-1（暗号化 / env>db）, Round 1 指摘の解消確認, 新規悪用経路の有無

判定サマリ: Blockers 0 / Warnings 0 / Notes 3

総評: Round 1 で指摘した W-003（transcribe 成功 JSON のマスキング契約・`SpeechFailureError` の非露出）はコメント補足で確実に対応済み（`speechRecognitionProvider.ts:191-199` に契約を明文化し、非 2xx 側の sanitize 流路との非対称性も `168-182` 行で説明済み）。W-001（uploadFileFn の CSRF・別 Issue）/ W-002（baseURL SSRF・将来課題）は既仕分けどおりスコープ外として蒸し返さない。

Round 2 として「新たに悪用可能 / 漏洩しうる経路」を実コード追跡で再確認した結果、**at-rest 暗号化・平文/暗号文の非露出・env>db のサイドチャネル・admin 認可（二重）・transport schema による ciphertext probing 封じ込め・secret masking（二重）はいずれも既存 LLM パターンと対称で、新規の悪用経路は確認できなかった。Blocker / Warning ともにゼロ**。残りは記録のみの Note。

---

## Security

### Blockers

- **なし** — 平文 API キーがトランスポート/レスポンス/ログ/DTO に漏れる経路、env>db 優先の復号サイドチャネル、認可バイパス、ciphertext probing のいずれも、実コード追跡の範囲で新規の悪用経路を発見できなかった。

### Warnings

- **なし** — Round 1 の W-003 はコメント補足で解消済み。W-001 / W-002 は既仕分け（別 Issue / 将来課題）でスコープ外。Round 2 で新たに昇格すべき Warning は無し。

### Notes

- **[N-001] W-003 の解消を確認（記録）**
  場所: `app/core/adapters/openai/speechRecognitionProvider.ts:168-189`（非 2xx は `sanitizeErrorReason`→`toReasonString` でマスク）/ `191-199`（成功 JSON を masking 非経由とする理由と前提を明文化）。
  内容: 成功パスの `body.text` は文字起こし結果（非秘匿）で、`runIngestionJob` が `SpeechFailureError` を `""` に縮退して握り潰し `message`/`cause` を UI/ログに出さない前提が JSDoc に固定された。`cause` には素の `fetch` 例外（URL を含みうる）が残るため「将来 `message`/`cause` をログ/UI に流す変更を入れる際は masking を再導入する」旨も W-003 参照付きで明記。Round 1 指摘どおりの対応で妥当。指摘なし。

- **[N-002] env>db は復号前に分岐し、サイドチャネルなし（再確認）**
  場所: `app/core/application/adminSettings/testSpeechConnection.ts:69-78` / `app/core/application/di/serverCloudflare.ts`（`resolveConsumerSpeechConfig`：env キー存在時は `decryptWithFallback` を呼ばず env 値採用）/ `service.ts:78-85`（`decryptSpeechApiKey`）。
  内容: env キーがある場合は DB ciphertext を**復号せず** env 値を採用するため、復号成否のタイミング差を使うサイドチャネルは生じない。consumer の復号失敗は Stub 縮退でフェイルクローズし、ログは `{ code: cause.code }`（SecretBox エラーコードのみ）または非 SecretBox 時の `{ cause }` のみで **ciphertext / 平文鍵は出さない**。`assertSpeechEnvOverride`（`service.ts:94-114`）も env 在処時は ciphertext を null 化して保存し、古い暗号文を DB に残さない。LLM 側と完全対称で正しい。

- **[N-003] 多層防御（masking / DTO / schema / 認可）の対称性を再確認（記録）**
  内容: 以下を実コードで確認し、いずれも新規の漏洩面が無いことを確認した。
  - **DTO 非露出**: `InstanceSettingsDTO.speech`（`dto/adminSettings.ts:94-110`）は `provider/model/apiKeySource/apiKeyMasked/envOverrides` のみ。平文も ciphertext も DTO に存在せず、`apiKeyMasked` は `maskApiKey`（`view.ts:28-41`）が返す `"••••"+ciphertext.slice(-4)`（暗号文末尾 4 文字・低エントロピー、平文鍵ではない）。env ソース時は `view.ts:63-65` で mask 自体をスキップ、`dto:339` で二重 null 化。
  - **transport schema**: `testSpeechConnectionSchema`（`schema.ts:87-97`）は draft を `apiKeySource:z.literal("env")`/`apiKeyCiphertext:z.null()` にロックし、クライアントが任意 ciphertext を投げて復号 probe する経路を構造的に封じている。`model` は `max(200)`、ping 側で `encodeURIComponent`（`speechConnectionPing.ts:58`）されるため path injection も不成立。`@/core/domain/*` 非依存も維持。
  - **二重認可**: server fn 入口 `requireAdminUser`（`action.ts:25,45`）＋ usecase 内 `assertAdmin`（`updateSpeechConfig.ts:54` / `testSpeechConnection.ts:46`）。`actorUserId` はサーバ解決の `actor.id` を渡しなりすまし不可。
  - **CSRF**: speech の両 server function（`updateSpeechConfigFn`/`testSpeechConnectionFn`）は `.middleware([errorResponseMiddleware, csrfMiddleware])` 適用済み（`action.ts:21,41`）。
  - **二重 masking**: `HttpSpeechConnectionTester.ping`（`speechConnectionTester.ts:58-63`）が adapter の reason に `maskSecrets` を再適用する defense-in-depth。`encrypt → env 優先で drop` の制御フロー（`updateSpeechConfig.ts:47-50`）も admin-gated・安価な web-crypto を理由にした意図的設計で、平文がログに残らない（silent-skip ログは `fields` 名のみ・`updateSpeechConfig.ts:95-103`）。
  - **SSRF**: Speech VO に `baseURL` 軸が無く endpoint は `api.openai.com` 固定（W-002 の将来課題どおり現状は成立しない）。
