# レビュー Round 2 — Test 観点（PR #736 / Issue #701）

レビュアー: Test 専門
対象: `gh pr diff 736`、`.issue/701/plan.md`、`.issue/701/review/review-001-test.md`（解消確認）
判定軸: Round 1 の Blocker / Warning が実際に解消したか、過剰モックで実装を素通りしていないか、Round 2 追加で新たなカバレッジ穴が生まれていないか。

## 総評

Round 1 の Blocker 2 件・Warning 4 件は **すべて、ミューテーション耐性のある実装直結の assertion で解消済み**。いずれも「LLM 側に存在する対称テストを speech 側へ複製する」という構造で、リグレッション防御の非対称性が解消された。過剰モックによる偽陽性は見当たらない（fake は honest で、分類ロジックや解決ロジックなど「テスト対象の振る舞い」を実際に通している）。新規のカバレッジ穴も検出されなかった。

### 解消確認の要点

- **B-001（consumer speech 解決）解消**: `createConsumerContainer.integration.test.ts:355-598`。`createConsumerContainer` の instanceof 検証（env override / DB 復号 / NullSecretBox 復号失敗 → Stub 維持 / model NULL → Stub / DB 行なし → Stub）に加え、`resolveConsumerSpeechConfig` を**直接呼ぶユニット**（`:468-597`）で `instanceof` では潰せない per-axis 優先（env provider/model が DB に勝つ・env apiKey が DB ciphertext に勝つ・空 model は length===0 で no-override・apiKey null で全体 null・decrypt 失敗で null）まで突いている。`model NULL → Stub`（`:431-456`）は最終ガードの `&&`→`||` ミューテーションを明示的に意図したコメント付き。AC-2 の consumer 経路が LLM と対等な防御になった。
- **B-002（view/DTO speech 射影）解消**: `view.test.ts:342-463`。env-default → `apiKeyMasked === null`、db-sourced → `••••XXXX` かつ `JSON.stringify(dto)` に ciphertext を含まない（リーク回帰ガード）、env.apiKey で mask collapse + `envOverrides.apiKey` flip、model 単独 overlay / provider 単独 overlay / 全フィールド overlay の各フラグ往復を網羅。`maskApiKey` の speech-shaped 構造型入力ケース（`:47-`）も追加され、ADR-003 の汎用化が speech 経路で実際に通る。AC-1 のフォーム初期値・マスク往復が view 単体で担保された。
- **W-001（repository toEntity 読み出し方向）解消**: `instanceSettingsRepository.integration.test.ts:78-123`。db-sourced 列 → `SpeechRecognitionConfig`、env-sourced（NULL ciphertext）、legacy NULL model → `coerceSpeech` で default 補完（ADR-004 後方互換）を DB 行直挿入 → `repository.get` の往復で突いている。読み出し方向が end-to-end で担保。
- **W-002（file フィールド名 = MIME 由来拡張子）解消**: `speechRecognitionProvider.test.ts:110-130`。`(file as File).name === "audio.webm"`、`audio/x-m4a → audio.m4a`（`x-` 除去）を assert。`filenameForMime` のリグレッションを検出可能に。
- **W-003（4xx/5xx の reason 伝播）解消**: 同ファイル `:179-307`。401 → `HTTP 401` + `auth_failed`（`sanitizeErrorReason` のカテゴリ分類を実通し）、500 → `HTTP 500`、timeout → `/timed out/`、401 で apiKey 非リーク。ping 側と対称になり、mapping を一律同一文言に潰す退行を検出可能。
- **W-004（縮退 preview の固定文言 + fallbackTitle）解消**: `runIngestionJob.integration.test.ts:644-700`。`class="ingestion-failure-note"` に加え固定文言「文字起こしに失敗しました。録音は保存されています。本文を手動で追記して保存できます。」全文と、`recording.webm → "recording"` / `silence.webm → "silence"` のタイトル非空を assert。`NoteTitle.create("")` で markFailed に逆戻りする退行を直接守る。

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** AC-6 の 3 経路は honest fake で実分類ロジックを実通し（`runIngestionJob.integration.test.ts:295-313, 613-730`）。`FailingSpeech`（`SpeechFailureError`）・`SilentSpeech`（空文字）はともに縮退分岐 → `previewing` + spy 0 回（`structureCalls`/`metadataCalls` 双方）、`UnsupportedFormatSpeech`（`BusinessRuleError('unsupported_format')`）は縮退せず `markFailed` + `errorCode === UnsupportedFormat` + `previewJson === null`。`classifyPipelineError` を stub せず実際に通しているため過剰モックではない。Round 2 P-001（Stub 境界）と一致。

- **[N-002]** `adminSettings.integration.test.ts:903-1010` の `updateSpeechConfig`（db 暗号化保存・平文非保存・env override 時の `speechApiKeySource='env'` 強制と ciphertext silent-skip・`admin_speech_env_override_skip` warn-log）と `:1066-` の `testSpeechConnection`（StubSpeechConnectionTester で env>db 解決・draft・ok:false）は usecase の責務を直接突いており、tester 実体は `speechConnectionTester.test.ts`（Round 1 N-004 で網羅確認済み）に分離されている。責務分離が綺麗。

- **[N-003]** B-001 / W-001 の integration seed は `speech_*` 列を prepared statement で**明示 bind**しており、スキーマ default によって値が materialize される偽カバレッジを避けている。特に W-001 の legacy NULL model ケースは `speechModel: null` を明示 bind するため、`coerceSpeech` の実分岐を確実に突く。

- **[N-004]** AC-3（実 transcribe 疎通）/ AC-4（録音実走）/ AC-5（録音 Blob の MediaAsset メタデータ欠落回帰）は Round 1 N-006 同様、`ADMIN_SPEECH_API_KEY` 未設定で手動/ブラウザ割当のまま（自動は out of scope）。これは plan の方針（既存 commit フロー合流・手動 TC）と整合し本 PR スコープ内の判断として許容。`runIngestionJob.integration` の StubSpeechOk happy 経路が実 transcribe を除く配線リグレッションを引き続き担保。AudioRecorder のコンポーネントテスト不在もプロジェクトの client component 方針依存で本 Issue 固有の欠落ではない。

- **[N-005]** B-002 提案の「`getInstanceSettings` integration での speech マスク往復（repo 読み出し → DTO マスク）の 1 ケース追加」は採られず、代わりに `view.test.ts`（DTO 射影）と `instanceSettingsRepository.integration.test.ts`（repo 読み出し方向）の**2 層分割**で閉じている。両層が独立に突かれているため end-to-end の 1 本化が無くても回帰検出力は十分。許容範囲。

## 結論

Round 1 の全指摘（Blocker 2・Warning 4）は実装直結・ミューテーション耐性のある形で解消済み。新規 Blocker / Warning なし。AC-1〜AC-2 のバックエンド経路が LLM と対等な回帰防御を獲得し、AC-6 縮退は 3 経路を honest fake で担保。**Test 観点で APPROVED**。
