# PR #736 レビュー — Domain + Use Case 観点（Issue #701）

対象: `SpeechRecognitionConfig` VO / `InstanceSettings.speech` / `AdminSettingsService` の speech 関数群 / `SpeechConnectionTester` ポート / `updateSpeechConfig` / `testSpeechConnection` / `getInstanceSettings` / `view.ts` / `dto/adminSettings.ts` / `runIngestionJob` の AC-6 縮退 / consumer 解決（`resolveConsumerSpeechConfig`）。

検証した受け入れ基準: **AC-1**（env>db フォールバック・SecretBox・接続テスト probe のドメイン/ユースケース部分）、**AC-2**（DI 注入のドメイン契約面）、**AC-3**（パイプライン配線・空 transcript の扱い）、**AC-6**（`SpeechFailureError` 縮退の中核）。

検証手段: 実装読解 + `pnpm vitest run`（adminSettings domain/usecase + runIngestionJob、**172 passed**）。`LLMConfig`/`updateLLMConfig`/`testLLMConnection` との 1:1 対称性比較。

---

## Domain + Use Case

### Blockers

なし

`SpeechFailureError`-only catch（`runIngestionJob.ts:564`）、early-return での `suggestMetadata` 回避（`runIngestionJob.ts:286-297`）、固定注記 HTML のサニタイザ非経由（`runIngestionJob.ts:270-271`, `289`）、`*ErrorCode` の lower_snake_case（`errorCode.ts:26-34`、`errorCodeNaming.test.ts` が glob で自動検証）、env>db フォールバックの対称実装（`resolveConsumerSpeechConfig` / `assertSpeechEnvOverride`）はいずれも ADR-005/006/008 と計画どおりで、ドメイン不変条件・illegal state 排除・レイヤー責務分離に致命的な逸脱は見当たらない。

### Warnings

- **[W-001]** `coerceSpeech` の部分縮退が「provider/model だけ NULL」の混在行を黙って `defaultSpeech()` 値で埋める / 場所: `entity.ts:144-162` / 理由: 既存行の後方互換（ADR-004）としては正しいが、縮退ルールが各フィールド独立（`provider ?? fallback.provider`、`model` は空/NULL なら fallback、`apiKeySource ?? fallback`、`apiKeyCiphertext ?? null`）になっている。`apiKeySource='db'` が保存済みなのに `apiKeyCiphertext` が NULL に縮退するような「半端な行」が来た場合、`SpeechRecognitionConfig.create` が `InvalidSpeechApiKeyCiphertext` を投げ `reconstruct` が `RehydrationError` でラップする。これは ADR-004 が想定する「全フィールド NULL（speech 列導入前の行）」では起きず、`apiKeySource` だけ db で ciphertext が消えた異常行でのみ顕在化する。`coerceSpeech` は「全 NULL → 全 default」を意図しているが、コードは「フィールド単位の独立縮退」になっており、`provider`/`apiKeySource` を DB の生値で埋めつつ `model` だけ default に化けるといった意図しない混成も理論上作れる。後方互換の本来の意図（行全体が古いか新しいかの二択）からするとやや緩い。/ 提案: `input` が「speech 列ありの行」か「無しの行」かで二分岐し、ありなら全フィールドを VO に渡して `create` の不変条件に委ね、無し（`undefined` or 全 NULL）なら丸ごと `defaultSpeech()` を返す形にすると、縮退の意味が「行の世代縮退」に一本化される。現状でも `RehydrationError` で安全側に倒れるため Blocker ではない。テストで「全 NULL → default」「完全な db 行 → 復元」は担保されているが、「`apiKeySource=db` + ciphertext NULL の混成行 → RehydrationError」の境界が明示テストにあるか確認したい。

- **[W-002]** `testSpeechConnection` の `draftConfig.provider` / `apiKeySource` が transport 層で string 受けのまま VO へ渡る対称性 / 場所: `testSpeechConnection.ts:11-15, 49-54` / 理由: `TestSpeechConnectionDraft.provider: string` を `SpeechRecognitionConfig.create` に渡し、VO 構築で `InvalidSpeechProvider` を投げうる。これは `testLLMConnection` と完全対称（あちらも `provider: string`）であり、VO 構築＝検証点という方針に沿うので設計上は正しい。ただし `testLLMConnection` 同様、この `create` 失敗は usecase 内で try/catch されず `BusinessRuleError` がそのまま presentation 境界へ伝播する（`{ ok:false }` には畳まれない）。`updateSpeechConfig` も同様に provider/model の VO 失敗は throw する設計。AC-1 の「接続テストが動く」観点では、無効 draft で `ok:false` ではなく業務エラーが返る挙動が LLM 側と一致しているか（presentation 層で同じ status マッピングになるか）を確認しておくとよい。ドメイン/ユースケース単体としては対称で問題なし。/ 提案: 仕様確認のみ。対称性が取れているので変更不要の公算が高い。

### Notes

- **[N-001]** AC-6 の核心（`runIngestionJob.ts:277-297`）が ADR-005 の確定事項を正確に実装している。`kind === "audio" && text.trim().length === 0` の early-return が `extractText` 直後・kind 分岐（html/markdown/else）の**前**に置かれ、共通経路にある `suggestMetadata`（370 行）・`resolveDirectorySuggestion`（389 行）・タグ解決（375-383 行）を丸ごと回避している。Round 2 arch S-002 で指摘された「`else` スキップだけでは `suggestMetadata` が残る」問題が構造的に解消されており、空入力で LLM を一切叩かない（`structureToHtml`/`suggestMetadata` ともに 0 回）。

- **[N-002]** `extractText` の audio 分岐（`runIngestionJob.ts:548-566`）の catch が `isSpeechFailureError(error)` のみを握り、それ以外（Stub の `BusinessRuleError('unsupported_format')` 含む）を素通しする。コメント（556-563 行）が「未設定＝機能未提供で fail」と「実失敗＝縮退」の区別意図を明記。`classifyPipelineError`（585 行）で `speech_failure` 経路は残るが、通常失敗は (1)(2) で吸収され `markFailed` 到達しないため、ADR-005 の「`markFailed` は真の catastrophic（VO 構築失敗等）のみ」と整合。Round 2 arch P-001 の確定どおり。

- **[N-003]** 固定注記 HTML（`runIngestionJob.ts:270-271`）が `class="ingestion-failure-note"` を使い、JSDoc に「信頼済み定数ゆえサニタイザ非経由」「サニタイザは未知 `data-*` を剥がすが `class` は残る」という WHY を残している。`ContentHtml.create` は空/1MiB 上限のみ検査（`note/valueObject.ts` で確認）なので注記 HTML の構築は VO 不変条件を通る。`NoteTitle.create(fallbackTitle(...))` は `fallbackTitle` が最悪 `"Untitled"` を返すため `TitleEmpty` を踏まない。VO への failure フィールド追加を避け波及を `runPipeline` 内に閉じた判断（ADR-005）が守られている。

- **[N-004]** `SpeechRecognitionConfig` VO（`valueObject.ts:255-355`）が `LLMConfig` と `baseURL` 抜きで対称。`db`↔ciphertext 必須 / `env`↔null 必須の不変条件、env 分岐での「空文字も非 null なら loud に reject」コメント（336-339 行）まで `LLMConfig.create`（232-242 行）と一致。illegal state（db なのに ciphertext なし / env なのに ciphertext あり）を型＋構築時検証で排除。INVARIANT コメント（258-267 行）が `speechProviderRegistry` 対応に加え `openai → 'gpt-4o-transcribe'` の既定モデル対応まで明記（S-004 反映）。`defaultSpeech()`（`entity.ts:56-63`）の model 値がこの INVARIANT と一致確認済み。

- **[N-005]** ドメインサービス分離（ADR-003）が正しく実装されている。`AdminSettingsService` に `decryptSpeechApiKey` / `assertSpeechEnvOverride`（`service.ts:78-114`）を `LLMConfig` 汎用化せず対称追加。`assertSpeechEnvOverride` は env キー有で `apiKeySource='env'` に強制し ciphertext を落とす（env 優先）、env 無 + source=env で `SpeechEnvOverrideMissingKey` を投げる挙動が `assertEnvOverride` と 1:1。`baseURL` 軸が無いぶん carry-over が provider/model のみで簡潔。

- **[N-006]** `updateSpeechConfig`（`updateSpeechConfig.ts`）の env silent-skip ロジックが `updateLLMConfig` と対称。`env.provider/model !== null` で effective 値を current（DB）に固定、`providerChanged` を `env.provider === null && input.provider !== current` で算出し env ロック時は dead code 化、`SpeechProviderChangedRequiresApiKey` ガード、silent-skip ログ（payload は field 名のみで secret hygiene を守る）まで一致。`baseURL` 軸が無いので `safeBaseURL` のような provider×baseURL 整合補正が不要になり、その分シンプル。`SpeechProviderChangedRequiresApiKey` エラーコードは実使用あり（`updateSpeechConfig.ts:69`）— 死蔵コードではない。

- **[N-007]** env>db フォールバックのドメイン表現が consumer パスでも対称。`resolveConsumerSpeechConfig`（`serverCloudflare.ts:1101-1152`）が env>DB>Stub の優先順位、ciphertext の `decryptWithFallback`（master-key rotation 対応）、decrypt 失敗時は `null` 返却で Stub フォールバック（queue handler をクラッシュさせない）まで `resolveConsumerLlmConfig` と一致。`buildSpeechRecognitionProvider`（603-618 行）は env キー欠如・未登録 provider（operator typo）いずれも Stub に縮退し container 構築を必ず成功させる（ADR-008）。未設定 audio は ADR-005 どおり従来 fail に落ちる分離が保たれている。

- **[N-008]** `maskApiKey` の構造型汎用化（`view.ts:28-41`、S-003 / ADR-008）。`{ apiKeySource, apiKeyCiphertext }` 構造型を受け LLM/speech 双方から呼ぶ。`db` だが ciphertext NULL の防御的 null 返却も維持。`toInstanceSettingsView` / `toInstanceSettingsDTO` の speech 引数が optional（デフォルト null）で既存呼び出し（fixtures）の後方互換を確保しつつ、`getInstanceSettings` は `adminSpeechEnv` を渡して env-locked 値を DTO に反映（`dto/adminSettings.ts:310-340`）。env overlay の speech フラグも LLM と対称。

- **[N-009]** `SpeechConnectionTester` ポート（`ports/speechConnectionTester.ts`）が `LLMConnectionTester` と対称で、JSDoc が「real transcription ではなく軽量 probe（ADR-006）」「transport エラーで throw せず `ok:false`+`error` を返す」契約を明記。`testSpeechConnection` が env>db で apiKey 解決→ probe→ `{ ok, latencyMs, error }` に畳む流れも `testLLMConnection` と一致。ドメインロジック（apiKey 解決の優先順位・VO 構築）がアダプター/プレゼンに漏れていない。

---

## 総括

Domain + Use Case 観点で **Blocker なし**。`LLMConfig` 系との対称性は VO・エンティティ操作・ドメインサービス・ユースケース・DTO・consumer 解決のすべてで高精度に保たれており、`baseURL` 軸の不在によるシンプル化も適切（ADR-003）。AC-6 の縮退ロジックは ADR-005 の確定事項（`SpeechFailureError`-only catch・early-return での LLM/metadata 全スキップ・固定注記 HTML のサニタイザ非経由・`markFailed` 限定）を正確に実装。`*ErrorCode` 命名は規約準拠で自動テストの網に乗る。Warning は後方互換縮退の厳密性（W-001）と接続テストの VO 失敗伝播の仕様確認（W-002）の 2 点で、いずれも安全側に倒れる軽微なもの。
