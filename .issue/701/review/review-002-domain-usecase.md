# PR #736 レビュー Round 2 — Domain + Use Case 観点（Issue #701）

対象: Round 1（review-001-domain-usecase.md / APPROVED）以降の差分を踏まえた再検証。`SpeechRecognitionConfig` VO / `InstanceSettings.speech`（`coerceSpeech` / `updateSpeech`）/ `AdminSettingsService` の speech 関数群 / `updateSpeechConfig` / `testSpeechConnection` / `getInstanceSettings`・`view.ts`・`dto/adminSettings.ts` / `runIngestionJob` の AC-6 縮退 / consumer 解決。

検証手段: 実装読解（現状コード）+ `pnpm vitest run`（adminSettings domain/usecase + runIngestionJob、**179 passed**）。Round 1 指摘対応コミット `bb53e9c7` の確認。`LLMConfig`/`updateLLMConfig`/`testLLMConnection` との 1:1 対称性比較。

検証した AC: **AC-1**（env>db フォールバック・SecretBox・接続テスト probe のドメイン/ユースケース面）、**AC-2**（DI 注入のドメイン契約面）、**AC-3**（パイプライン配線・空 transcript の扱い）、**AC-6**（`SpeechFailureError` 縮退の中核）。

Round 1 仕分け済み（蒸し返さない）: W-001 `coerceSpeech` のフィールド単位縮退 / W-002 `testSpeechConnection` の VO 構築失敗 throw — いずれも `LLMConfig`/`coerceLimits`/`testLLMConnection` と対称で意図的と確定済み。

---

## Domain + Use Case

### Blockers

なし

Round 1 で確認した不変条件・責務分離は現状コードでも保たれている。`bb53e9c7`（Round 1 指摘対応）はドメイン/ユースケースの**実体ロジックを変えておらず**、変更はテスト拡充・アダプタの timeout 判定（`DOMException` 対応）・a11y に限定される（`git show --stat` 確認）。`runIngestionJob.ts:286-297` の early-return 縮退、`extractText` の `isSpeechFailureError`-only catch、固定注記 HTML のサニタイザ非経由、`SpeechRecognitionConfig.create` の db↔ciphertext / env↔null 不変条件、`assertSpeechEnvOverride` の env 優先、`resolveConsumerSpeechConfig` の env>db>Stub フォールバックはいずれも ADR-005/006/008 どおり。致命的逸脱なし。

### Warnings

なし（新規）

Round 1 の W-001（`coerceSpeech` 縮退の厳密性）・W-002（接続テスト VO 失敗の伝播）は本 Round で仕分け済み扱い。再掲はしないが、対応状況のみ Notes に記す。

### Notes

- **[N-001]** Round 1 W-001 が指摘した「`apiKeySource='db'` + ciphertext NULL の混成行 → `RehydrationError`」境界の**明示テストは追加されていない**（`entity.test.ts:452-511` は「全 NULL → default」「完全 db 行 → verbatim」「model 空文字 → default」「invalid provider → RehydrationError」をカバーするが、半端 db 行の `InvalidSpeechApiKeyCiphertext` → `RehydrationError` 経路は未カバー）。ただし `coerceSpeech` のフィールド単位縮退は `coerceLimits` と対称で意図的（Round 1 で仕分け済み）であり、`SpeechRecognitionConfig.create` の不変条件 + `reconstruct` の `RehydrationError` ラップにより**安全側（loud fail）に倒れる**ことはコード上保証されている。VO 単体テスト（`valueObject.test.ts:528-559`）が db+null ciphertext → `BusinessRuleError` を担保しているため、欠けているのは「entity 経由で `RehydrationError` に翻訳される」結線テストのみ。挙動の正しさには影響せず、Blocker/Warning には該当しない（テスト網羅の余地としてのみ記録）。

- **[N-002]** Round 1 W-002（`testSpeechConnection`/`updateSpeechConfig` の VO 構築失敗が `{ok:false}` に畳まれず `BusinessRuleError` を throw して presentation 境界へ伝播）は `testLLMConnection`/`updateLLMConfig` と完全対称（`testSpeechConnection.ts:49-54`、`updateSpeechConfig.ts:77-88`）。VO 構築＝検証点という方針どおりで、presentation の `kind`-tagged 直列化が LLM と同一 status にマップする。仕様面の対称性が取れており変更不要。

- **[N-003]** AC-6 縮退（`runIngestionJob.ts:286-297`）は ADR-005 確定事項を正確に実装。`kind === "audio" && text.trim().length === 0` の early-return が `extractText` 直後・kind 分岐（html/markdown/else）の前に置かれ、共通経路の `suggestMetadata`（370 行）・タグ解決（375-383 行）・`resolveDirectorySuggestion`（389 行）を丸ごと回避。空入力で LLM（`structureToHtml`/`suggestMetadata`）を一切叩かない（Round 2 arch S-002 の懸念が構造的に解消済み）。固定注記 HTML（270-271 行）は `class="ingestion-failure-note"` を使い JSDoc に「信頼済み定数ゆえサニタイザ非経由・サニタイザは `class` を残す」WHY を明記。Round 1 と同一・劣化なし。

- **[N-004]** `extractText` の audio catch が `isSpeechFailureError` のみを握り、Stub の `BusinessRuleError('unsupported_format')` 等を素通しする分離（Round 2 arch P-001 確定）は維持。`bb53e9c7` の `runIngestionJob.integration.test.ts` +17 行が縮退 preview の注記文言・`fallbackTitle` 非空を assert する形で回帰捕捉を強化しており、AC-6 の観測可能性がテストでも担保された。

- **[N-005]** consumer 解決（`resolveConsumerSpeechConfig`）の env>db>Stub フォールバック・`decryptWithFallback`（鍵 rotation）・decrypt 失敗時 null→Stub 縮退（queue handler を落とさない）は Round 1 どおり。`bb53e9c7` の `createConsumerContainer.integration.test.ts` +271 行で consumer 経路の speech 解決と override が結線テストされ、AC-2 の DI 注入面の回帰が強化された。

---

## 総括

Round 2 として **Blocker なし / 新規 Warning なし**。Round 1（APPROVED）以降のコミット `bb53e9c7` はドメイン/ユースケースの実体ロジックを変えず、テスト拡充とアダプタ層 timeout 判定・a11y に限定されており、新たな退行は持ち込まれていない。`LLMConfig` 系との対称性・AC-6 縮退の正確性・`*ErrorCode` 命名規約準拠は維持。Round 1 の W-001/W-002 は対称・意図的として仕分け済みで、W-001 の境界結線テスト欠落は安全側に倒れるため N-001 の記録に留める。179 passed。Domain + Use Case 観点で承認可。
