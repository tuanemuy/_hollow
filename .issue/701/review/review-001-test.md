# レビュー Round 1 — Test 観点（PR #736 / Issue #701）

レビュアー: Test 専門
対象: `gh pr diff 736`、`.issue/701/plan.md`（テスト方針 / AC-1〜7）、`.issue/701/adr.md`
判定軸: 各 AC に対応するテストの有無、VO 不変条件の境界がミューテーションを突くか、AC-6 縮退の検証、OpenAI アダプタの網羅、env>db>stub の DI 分岐、偽陽性耐性、命名/構造の一貫性。

## 総評

ドメイン層（VO / entity / service）とアダプタ層（OpenAI transcribe / ping）、ユースケース層（updateSpeechConfig / testSpeechConnection の integration）、AC-6 縮退（`runIngestionJob` integration の 3 ケース）は **非常に手厚く、ミューテーション耐性も高い**。VO 境界（model 1/120/121・db↔ciphertext・env↔null）はユニット＋property の二重がけで、空文字/whitespace の対称分岐まで突いている。AC-6 は `SpeechFailureError` 縮退・無音（空 transcript）縮退・Stub 境界（`unsupported_format`→markFailed）の 3 経路を spy 0 回検証込みで担保しており、ADR-005 / Round 2 P-001 の確定内容と一致する。

一方で **request パスに偏っており、consumer ワーカーパスの speech 解決（AC-2 の半分）と view/DTO 層の speech 射影（AC-1 のフォーム初期値・マスク往復）に明確なカバレッジ穴がある**。下記 Blocker 2 件はいずれも「LLM 側には対称テストが存在するのに speech 側だけ欠落」という構造的な抜けで、リグレッション検出力が LLM と非対称になっている。

---

### Test

#### Blockers

- **[B-001]** consumer ワーカーパスの speech 解決（`resolveConsumerSpeechConfig` / `createConsumerContainer` の speech override）にテストが 0 件 / 場所: `app/core/application/di/serverCloudflare.ts:1101-1179`（実装）, `app/core/application/di/__tests__/createConsumerContainer.integration.test.ts`（speech 参照ゼロ）/ 理由: `grep -rln resolveConsumerSpeechConfig app/` の結果が実装ファイル 1 件のみ。LLM 側 `resolveConsumerLlmConfig` は同 integration テストで「env override path」「DB resolution path（WebCryptoSecretBox 復号）」「Stub fallback（NullSecretBox 復号失敗 → warn-log → Stub 維持）」の 5+ ケースが担保されているのに、対称な `resolveConsumerSpeechConfig` は **env>db>stub の分岐も、`decryptWithFallback` の復号失敗 → `return null`（Stub フォールバック）分岐（`serverCloudflare.ts:1131-1144`、`isSecretBoxError` 分岐含む）も一切検証されていない**。これは AC-2「consumer パスで設定済みプロバイダが DI 注入され Stub ハードコードを置換する」の中核経路であり、プラン「テスト方針 DI: consumer パスで DB 設定が解決され override されること」に直接対応する観点。実装には provider/model/apiKey いずれか null で `null` 返し（`:1147`）という縮退境界もあり、ミューテーション（例: `&&`→`||`、`length > 0`→`>= 0`）を突くテストが無い。/ 提案: `createConsumerContainer.integration.test.ts` に LLM と対称な speech ケースを追加する。最低限 (1) `ADMIN_SPEECH_API_KEY`+`ADMIN_SPEECH_MODEL` 設定 → `container.speechRecognitionProvider` が `OpenAISpeechRecognitionProvider`、(2) env 無 + DB ciphertext + 有効 SecretBox → 復号して実 provider、(3) DB ciphertext あり + `SECRET_BOX_MASTER_KEY` 未設定（NullSecretBox 復号失敗）→ `StubSpeechRecognitionProvider` 維持 + warn-log、(4) provider/model/apiKey のいずれか欠如 → Stub。`resolveConsumerSpeechConfig` を直接呼ぶユニットも併設すると `instanceof` では潰せない分岐（どの値が解決されたか）を突ける。

- **[B-002]** view/DTO 層の speech 射影が未検証（`dto.speech.*` への assertion ゼロ） / 場所: `app/core/application/adminSettings/__tests__/view.test.ts`（speech assertion なし）, `app/core/application/adminSettings/view.ts:55-71`, `app/core/application/dto/adminSettings.ts:244-313` / 理由: `view.ts` は `speechApiKeyMasked = speechEnv?.apiKey ? null : maskApiKey(settings.speech)`（`:63-65`）、DTO は `speechEnvOverrides`（provider/model/apiKey フラグ、`adminSettings.ts:310-313`）という **LLM と対称の非自明な分岐**を持つが、`view.test.ts` は `toInstanceSettingsView` の戻り値について `dto.llm.*` のみを 15 ケースで検証し `dto.speech.*` を 1 度も assert していない。`maskApiKey` のユニットも `LLMConfig` 入力のみで、ADR-008 が明記する「構造型 `{ apiKeySource, apiKeyCiphertext }` への汎用化（LLM/speech 双方から呼ぶ）」のうち speech 経路が突かれていない（`maskApiKey(settings.speech)` の呼び出しが無検証）。`getInstanceSettings` integration（`adminSettings.integration.test.ts:145-199, 1856-, 2154-`）も `settings.speech` を一切 assert しないため、**「保存した db speech キーが getInstanceSettings の DTO で `••••XXXX` にマスクされて往復する」「env override 時に speech.apiKeyMasked が null に collapse する」「speechEnvOverrides フラグが env 設定で flip する」が end-to-end でも view 単体でも未担保**。これは AC-1（フォーム初期値・マスク表示に speech を載せる）と plan ステップ13（S-003 view 拡張）に直接対応する観点で、リグレッション（speech 射影の取りこぼし・env collapse 漏れ・ciphertext リーク）を検出できない。手動テスト（TC-admin-reverify）でマスク往復は PASS しているが、自動回帰がない。/ 提案: `view.test.ts` の各 LLM ケースに対称な speech ケースを追加: (1) env-sourced default → `dto.speech.apiKeyMasked === null`、(2) db-sourced → `••••<last4>` かつ `JSON.stringify(dto)` に ciphertext を含まない、(3) `speechEnv.apiKey` 設定 → `apiKeyMasked` が null collapse・`envOverrides.apiKey === true`、(4) `speechEnv.provider/model` 単独設定での overlay フラグ。加えて `maskApiKey` ユニットに speech-shaped 構造型入力ケースを 1 件。可能なら `getInstanceSettings` integration に「updateSpeechConfig で db キー保存 → getInstanceSettings で `settings.speech.apiKeyMasked` がマスク往復」を 1 件追加して repository `toEntity` の speech マッピング（下記 N-001）も同時に突く。

#### Warnings

- **[W-001]** `instanceSettingsRepository` の speech 往復マッピング（`toEntity` / `save`）に専用テストが無い / 場所: `app/core/adapters/d1/repositories/__tests__/`（speech 参照ゼロ） / 理由: plan ステップ11（repository マッピング）の `toEntity`（speech 列→VO）/ `save`（逆方向）はリポジトリ層の往復が要だが、専用ユニットが無い。現状は `adminSettings.integration.test.ts` の `updateSpeechConfig` が `save` の書き込み列（`speechProvider`/`speechModel`/`speechApiKeySource`/`speechApiKeyCiphertext`）を DB 直読みで検証しており **`save` 方向は実質カバー**されている。しかし `toEntity` の **読み出し方向**（DB 行 → `SpeechRecognitionConfig` 再構築、特に NULL 列 → `coerceSpeech` 縮退の repository 統合）を end-to-end で突くテストは無い（entity 単体の `reconstruct` テストはあるが、repo が正しい列を渡しているかは別物）。B-002 の getInstanceSettings 往復追加でほぼ閉じられる。/ 提案: B-002 提案の getInstanceSettings 往復ケースで `settings.speech.provider/model/apiKeySource` を assert すれば repo 読み出し方向も同時に担保される。独立に repo ユニットを足すならなお良い。

- **[W-002]** OpenAI transcribe アダプタの「`file` フィールド名 = MIME 由来拡張子」が未検証 / 場所: `app/core/adapters/openai/__tests__/speechRecognitionProvider.test.ts:77-78` / 理由: happy path で `form.get("file")` が `Blob` であることは確認しているが、ADR-008 が明記する「OpenAI は `file` の拡張子で形式判定するため `filenameForMime` で MIME→拡張子を生成（`x-` プレフィックス除去、`audio.webm` 等）」という非自明ロジックが突かれていない。filename が `blob`（既定）のままだと OpenAI が形式判定に失敗しうるが、テストは Blob 型しか見ていないため `filenameForMime` のリグレッション（例 `audio/webm`→`audio.webm`、`audio/x-m4a`→`audio.m4a`）を検出できない。/ 提案: `FormData` から `file` を取り出し `(file as File).name` が MIME 由来の拡張子（`audio.webm` 等）になることを 1〜2 MIME で assert。`x-` 除去ケースも 1 件。

- **[W-003]** transcribe の 4xx/5xx を投げる前に `reason`（マスク済みエラー）が `SpeechFailureError.message` に乗っているかの正検証が弱い / 場所: `speechRecognitionProvider.test.ts:155-230` / 理由: 401/429/500/transport/timeout/非JSON はすべて `rejects.toBeInstanceOf(SpeechFailureError)` のみで、**エラー種別の区別（4xx と 5xx で message/cause が変わるか、provider のエラー type が伝播するか）を assert していない**。secret 非リークは 1 件あるが、それ以外は「型さえ合えば PASS」になりがちで、内部の error mapping を誤って一律同一文言にしても検出できない（偽陰性リスク低めだが mapping ロジックの精度は突けていない）。ping 側（`speechConnectionPing.test.ts`）は `reason` 文言まで厳密に assert しており非対称。/ 提案: 少なくとも 401（`invalid_api_key` 系の reason 断片を含む）と 500（HTTP status 断片）で `(error as Error).message` に期待断片が含まれることを 1 件ずつ。ping テストと対称にする。

- **[W-004]** AC-6 縮退 preview の「失敗注記の固定文言」と「fallbackTitle」が未 assert / 場所: `runIngestionJob.integration.test.ts:644, 681` / 理由: 縮退テストは `contentHtml` に `class="ingestion-failure-note"` を含むことは確認するが、ADR-005 が定める固定文言（`runIngestionJob.ts:271` の「文字起こしに失敗しました。録音は保存されています。本文を手動で追記して保存できます。」）も、`titleSuggestion = fallbackTitle(originalFileName)` でタイトルが安全に埋まること（`NoteTitle.create("")` で落ちない保証＝ADR-005 の重要前提）も assert していない。class マーカーだけだと、注記の本文を空にしたり title を空文字にする退行（VO 構築失敗で markFailed に逆戻り）を検出できない。/ 提案: `preview.contentHtml` に注記本文の一部（例「録音は保存されています」）を含むことと、preview の title（`titleSuggestion` 相当）が空でない（`recording.webm` 由来の fallback）ことを assert。後者は AC-6 の「`previewing` 到達」の安定性を直接守る。

#### Notes

- **[N-001]** `errorCodeNaming.test.ts` は `import.meta.glob` + `EXPECTED_ERROR_CODE_NAMES` で全 `*ErrorCode` を自動列挙し lower_snake_case を強制しているため、新規 speech コード 7 種（`errorCode.ts:26-34`）は **自動的に命名規約テストの対象に入っている**（plan テスト方針「新コードが乗ること」を満たす）。明示的な speech 専用 assertion は不要。良好。

- **[N-002]** VO 境界の網羅は優秀。`valueObject.test.ts:406-595` がユニットで model 1/120/121・provider 不正・apiKeySource 不正・db↔ciphertext（null/whitespace）・env↔ciphertext（non-null/empty/whitespace を含む対称分岐）を、`valueObject.property.test.ts:176-250` が property で 120 境界と env↔null をランダム分布で突いている。LLM の既存パターンと命名・構造が完全に揃っており、ミューテーション耐性は高い。AC-1 の VO 不変条件部分は十分。

- **[N-003]** `buildSpeechRecognitionProvider.test.ts` は request パスの env>stub 分岐（key 有→OpenAI、key 無→Stub、model 無→Stub、未登録 provider→Stub、provider undefined→既定 openai）を 5 ケースで担保。ADR-008「env キー無 OR 未登録 provider で Stub」と一致。request パス側の AC-1/AC-2 は十分。B-001 はこの request 側の対称が consumer 側に無い点。

- **[N-004]** `speechConnectionTester.test.ts` は constructor 検証（非有限/非正の timeoutMs 拒否）・空 apiKey ガード（dispatch しない）・provider dispatch（trimmed key + timeout 伝播）・未登録 provider 防御ネット・result 正規化（error 有/無）・secret マスク（defense-in-depth）を網羅。registry を `vi.mock` で差し替えているが、dispatch 引数・正規化ロジックという**テスト対象の振る舞いを直接突いている**ため過剰モックによる偽陽性ではない。`adminSettings.integration.test.ts` 側の `testSpeechConnection` は Stub tester で env>db 解決・draft・apiKey 欠如・member 拒否を担保しており、tester 実体と usecase の責務分離が綺麗。AC-1 接続テスト（ADR-006 probe 境界）は十分。

- **[N-005]** OpenAI transcribe アダプタの本質的網羅は良好: 2xx→text、whitespace trim、空発話（text 欠落 / whitespace-only）→空文字、非既定 baseURL 反映、空 locale で language 省略、空 apiKey/25MiB 超の事前失敗（fetch 不呼び出し）、25MiB 境界 ちょうどは pre-fail しない、Content-Type を手で設定しない（boundary 委譲）まで突いている。plan テスト方針「2xx/4xx/5xx/timeout/空発話/25MB 超」を満たす。W-002/W-003 は上積みの精度向上。

- **[N-006]** AC-3（音声アップロード→ノート化 happy path の実 transcribe 疎通）・AC-4（録音→ノート化の実走）・AC-5（録音由来 Blob の MediaAsset メタデータ欠落回帰）は plan 通り手動/ブラウザに割り当てられているが、`ADMIN_SPEECH_API_KEY` 未設定により out of scope（`.issue/701/manual-test/report.md`）。自動テストとしては `runIngestionJob.integration.test.ts:580-611`（StubSpeechOk で audio→LLM→sanitiser の happy 経路）が音声 kind のパイプライン配線を担保しており、実 transcribe を除く配線リグレッションは検出可能。AC-5 のメタデータ欠落（録音 Blob の mimeType/filename）は自動テストが無く手動依存のままだが、これは plan の方針（既存 commit フロー合流・手動 TC）と整合しており本 PR スコープ内の判断としては許容。録音 UI（AudioRecorder）にコンポーネントテストが無い点も同様（プロジェクトの client component テスト方針に依存、本 Issue 固有の欠落とは言い切れない）。

## 結論

ドメイン/アダプタ/ユースケース層と AC-6 縮退は出荷品質。残る穴は **consumer DI パスの speech 解決（B-001）** と **view/DTO の speech 射影（B-002）** の 2 点で、いずれも「LLM 側に対称テストが存在するのに speech だけ欠落」というリグレッション非対称性。両 Blocker を埋めれば AC-1/AC-2 のバックエンド経路が LLM と対等な回帰防御になる。
