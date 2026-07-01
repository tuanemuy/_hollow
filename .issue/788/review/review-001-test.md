# PR #813 レビュー — Test レイヤー (Issue #788)

対象: Cloudflare Workers AI ルート（`deepgram-workers-ai`）追加のテスト差分。
観点: AC-6 の対称性（adapter 境界 / ping / 6 apiKey ゲート / DI 配線 / registry / 二重リスト不変条件）と、振る舞い検証か写経かの識別、脆いモック依存、非回帰、カバレッジの穴。

## 総評

計画（plan.md テスト方針・AC-6）が要求したケースは **すべて実装されている**。振る舞い（戻り値・永続化された DB 行・dispatch 引数）を検証しており写経に陥っていない。integration テストは実 D1 に対して keyless の保存・正規化・ciphertext 非引き継ぎ・silent-drop・consumer 解決を通しで確認しており、fake ではなく実挙動をカバーしている。adapter 単体は既存 REST Deepgram テスト（`speechRecognitionProvider.test.ts`）と構造・ヘルパ・INPUT・timeout 文言まで対称で、fetch モックを binding フェイクに正しく差し替えている（ADR-006/007）。**Blocker はなし。** 指摘は軽微な穴と将来のドリフト防御のみ。

AC-6 必須ケースの充足（すべて ✓）:
- adapter: 正常 `.trim()` / 空 bytes 入力 / 空 transcript `""` / transcript 欠落 / `run` reject→`SpeechFailureError` / timeout（`Promise.race` タイマー）/ binding 未注入→`SpeechFailureError`
- ping: binding 有り `ok:true`（run 未呼出）/ binding 無し `ok:false`
- domain service `assertSpeechEnvOverride`: keyless carve-out（throw せず）+ REST は従来どおり throw（回帰）
- usecase `updateSpeechConfig`: keyless 鍵なし保存成功 + `env`/ciphertext null 正規化 + 旧 ciphertext 非引き継ぎ + stray key silent-drop
- usecase `testSpeechConnection`: keyless で鍵なしでも tester へ dispatch（空文字）+ REST は No-api-key 短絡維持（回帰）
- tester `HttpSpeechConnectionTester.ping`: keyless + apiKey 空 + binding 有りで dispatch（empty-key 短絡回帰固定）
- DI: `buildSpeechRecognitionProvider`（keyless は apiKey 無し+binding 有りで非 Stub / binding 無しで Stub / stray key 無視）、`resolveConsumerSpeechConfig`（keyless を apiKey `""` で解決 / binding 無しで Stub）
- registry: 実 registry で `deepgram-workers-ai` 登録・`lookupSpeechAdapter` 解決
- 二重リスト: `valueObject.test`（providers + keylessProviders）/ `schema.test`（`SPEECH_PROVIDERS_TRANSPORT`）に新値

## Test

### Blockers
- なし

### Warnings
- **[W-001]** `config.model` が無視され常に `@cf/deepgram/nova-3` リテラルで `run` される「model-ignored」挙動が未検証 / 場所: `app/core/adapters/deepgram/__tests__/workersAiSpeechRecognitionProvider.test.ts`（`makeProvider` は常に `model:"@cf/deepgram/nova-3"`）+ 実装 `workersAiSpeechRecognitionProvider.ts:59-64,90` / 理由: happy-path は「渡した model がそのまま run に渡る」だけを確認しており、実装の「config.model を捨てて WORKERS_AI_DEEPGRAM_MODEL 定数を使う」分岐（JSDoc L59-61 で明示された意図的挙動）を固定していない。将来 config.model を尊重する回帰が入っても緑のまま。/ 提案: `makeProvider` に別モデル（例 `"whisper-x"`）を渡し、`runMock.mock.calls[0][0]` が依然 `"@cf/deepgram/nova-3"` であることを 1 ケース追加。
- **[W-002]** `run()` reject 時に `SpeechFailureError` の `cause` が保持されることが未検証 / 場所: 同上 `test:116` / 実装 `workersAiSpeechRecognitionProvider.ts:104`（`new SpeechFailureError("...", cause)`）/ 理由: REST 側テストは 401/500 で status・sanitize 済み detail をメッセージで検証しているのに対し、workers-ai 側は `toBeInstanceOf` のみ。cause 引き渡しが外れても検知できない（観測性の非回帰が緩い）。なお固定メッセージ採用のため秘密漏洩リスクは無く、REST の leak-mask テストに相当するものは不要。/ 提案: `expect((err as SpeechFailureError).cause).toBe(originalError)` を 1 行追加（`SpeechFailureError` が cause を公開している場合）。
- **[W-003]** 二重リスト不変条件が「独立した 2 本のハードコード配列」でしか守られておらず、VO ↔ transport enum のドリフトを直接検出できない / 場所: `app/core/domain/adminSettings/__tests__/valueObject.test.ts:408-413` と `app/components/admin/__tests__/schema.test.ts:196-204`（`schema.ts:67` は「duplicated from SPEECH_PROVIDERS」と明記＝両者は等価であるべき）/ 理由: VO に provider を 1 つ足して `valueObject.test` だけ更新し `SPEECH_PROVIDERS_TRANSPORT` を忘れても、`schema.test` は旧 4 要素のまま緑を返し UI/transport が新 provider を拒否する退行を見逃す。LLM 側 transport list は意図的な subset だが speech は「全 provider を複製」なので等価性を張れる。/ 提案: `expect([...SPEECH_PROVIDERS_TRANSPORT]).toEqual([...SpeechRecognitionConfig.providers])` の cross-check を 1 本追加（速い unit）。既存パターン踏襲のため任意だが、speech に限れば妥当。

### Notes
- **[N-001]** adapter 単体が既存 REST Deepgram テストと高対称（同一 `audioBytes`/`transcriptOutput`/`INPUT` ヘルパ、happy/empty/absent/timeout 文言 `/timed out/`）でありながら、fetch モックを `fakeAi(run 差し替え)` に正しく置換。空 bytes 入力ケース（`test:90`）と空 transcript 出力ケース（`test:78`）を計画どおり別ケースに分離しており、AC-6 の「空入力 / 空出力を区別」を満たしている。timeout は fake timer を使わず実 5ms タイマー + 決して resolve しない run で `Promise.race` を決定的に発火させており flaky 耐性も妥当（ADR-007 の設計に整合）。
- **[N-002]** `registry.test.ts` が `vi.mock` を使わず**実 registry** を import し実登録を証明、`speechConnectionTester.test.ts` は `lookupSpeechAdapter` をモックして dispatch/threading を分離検証、という責務分割が明確（テスト内コメント L8-13 でも自認）。adapter の実 ping 挙動は adapter 単体と registry 経由で二重に担保されている。
- **[N-003]** domain service テスト（`service.test.ts:250-276`）が round-2 [P-001] の核心＝「keyless carve-out で throw しない」＋「REST は従来どおり `SpeechEnvOverrideMissingKey` を throw（`test:208-236`）」の両方を固定。usecase 側（`adminSettings.integration.test.ts:1068-1150`）も keyless 保存の正規化・旧 ciphertext 非引き継ぎ・stray key silent-drop を実 D1 行で検証しており、6 ゲートの keyless 分岐が写経でなく実挙動で押さえられている。
- **[N-004]** DI テストが `instanceof` の限界（real vs Stub しか分からない）を認識し、`resolveConsumerSpeechConfig` を直接呼んで `apiKey===""`・provider・model の解決値を seam で検証（`createConsumerContainer.integration.test.ts:617-633`）。keyless の binding 有無での非 Stub/Stub 分岐（`test:501-526`）も consumer 経路（audio 文字起こしの実走行点）で固定しており E2E linchpin を的確にカバー。
- **[N-005]** 非回帰: REST 側の `buildSpeechRecognitionProvider`（apiKey/model 必須で Stub フォールバック）・`testSpeechConnection`（No-api-key 短絡維持）・tester（REST は deps=undefined で dispatch）・schema（未知 provider 拒否）がいずれも既存テストで維持されており、keyless carve-out の波及漏れは manual-test TC-regression でもブラウザ確認済み。
