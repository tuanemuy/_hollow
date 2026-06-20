# Plan Review — Issue #738（Round 1 / アーキテクチャ整合性・実現可能性・リスク）

レビュー観点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/738/plan.md` / `.issue/738/adr.md`
基準: `CLAUDE.md` / `spec/adr/013-speech-provider.md` / `spec/domains/adminSettings.md` / 既存実装

---

#### 問題点（要修正）

- **[P-001]** plan が複数箇所で「LLM フォームの provider 分岐パターン／挙動に合わせて、provider 変更時に model 欄を当該 provider の既定 model にリセットする」と述べているが、**LLM フォーム（`app/components/admin/LLMSettingsForm/index.tsx`）にはその挙動が存在しない**。
  - 理由: 実際の LLM フォームは (a) API キー placeholder を `provider === "anthropic" ? "sk-ant-..." : ...` で分岐する（378-384 行）、(b) provider 変更時に「再入力が必要」バナーを出し `apiKeyRequired` を立てる（270-284 行）— の 2 点のみ。`PROVIDER_DEFAULT_MODEL` 相当のマップも、`onChange` 内での `setModel(...)` リセットも持っていない（select の `onChange` は `setProvider(next)` だけ、458 行 `setModel` はユーザー入力ハンドラのみ）。つまり plan が「既存パターンの踏襲」として根拠付けている model リセットは新規挙動であり、「LLM フォームに倣う」という前提が事実誤認。レビュー視点（既存パターンへの対称性）として、踏襲先が無いまま「踏襲」と書かれると実装者が存在しない参照を探して迷う。
  - 提案: ステップ 5 / 設計「UI」節を「placeholder 分岐は LLM フォームの先例どおり。**model 既定値マップと provider 変更時の model リセットは本 Issue で新規に導入する挙動**（LLM フォームには無い）」と明記し直す。リセット挙動自体は妥当（後述 [S-001] と P-002 参照）なので削除不要だが、根拠の書き方を是正する。

- **[P-002]** provider 変更時の「model 自動リセット」を **無条件で入れると、env で `ADMIN_SPEECH_MODEL` がロックされているケース（`envOverrides.model === true`）と衝突しうる**点が plan / adr で考慮されていない。
  - 理由: model 入力は `disabled={isPending || envOverrides.model}` で env ロック時は編集不可。ロック中に provider select（`envOverrides.provider` が false なら操作可能）を変えて `setModel` を強制実行すると、ローカル state が env 固定値から乖離する。送信時は `disabled` フィールドが FormData から除外され usecase 側 silent-skip で救われるが、画面表示上はロック中なのに値が変わって見え、混乱を招く。LLM フォームが model リセットを持たないのは、まさにこの env ロックとの相性問題を避けているからとも読める。
  - 提案: リセットを入れるなら `if (!envOverrides.model) setModel(PROVIDER_DEFAULT_MODEL[next])` のように env ロック時はスキップする条件を明記する。ステップ 5 にこの分岐条件を追加。

- **[P-003]** 接続テスト（`onTest`）が **`apiKeySource: "env"` をハードコードしてフォーム入力中の plain API キーを使わない**（フォーム 145-155 行のコメント参照）構造であることが、Deepgram の初回設定 UX として plan で取り上げられていない。
  - 理由: AC-6 / テスト方針では「Deepgram 選択 → API キー入力 → 接続テスト成功 → 保存」という順序を想定しているが、現状の draft test は `ADMIN_SPEECH_API_KEY`（env）が無いと「DB ciphertext or env」しか引けない。OpenAI からの移行で「新しい Deepgram キーを入力してまず接続テスト」をしたい初回ユーザーは、env 未設定だと **保存前にテストできない**（OpenAI でも同じ構造的制約だが、provider 切替を伴う Deepgram 追加でこの制約が顕在化しやすい）。これは #701 から引き継ぐ既存制約であり本 Issue のスコープ拡大は不要だが、AC-6 の手動検証手順が「env にキーを置いた状態でのテスト」前提になることを明記しないと、受け入れ検証時に「テストできない」と詰まる。
  - 提案: テスト方針 / AC-6 に「接続テストは env（`ADMIN_SPEECH_API_KEY`）優先 or 保存済み DB ciphertext のキーで実行される。新規 Deepgram キーの事前テストは env に置くか、一旦保存後に行う（#701 由来の既存挙動）」と前提を明記する。スコープは変えない。

---

#### 改善提案（検討推奨）

- **[S-001]** `localeToLanguage(ja-JP → ja)` の実装方針について。実際に取り込みパイプラインが port に渡す locale は **既に `"ja"` 固定**（`runIngestionJob.ts:601` / `previewPrompt.ts:155`、ADR-013「locale は当面 ja-JP 固定」だが実コードは `"ja"`）。
  - 理由: OpenAI adapter の `localeToLanguage` は防御的に first-subtag を取るだけなので、Deepgram でも対称にコピーする方針自体は安全で問題ない。ただし plan の「`ja-JP` → `ja`」という記述は実入力（`ja`）と食い違うため、「実入力は `ja`。OpenAI と対称に first-subtag 抽出を入れておく（将来 locale 可変化への防御。ADR-013）」と書くと正確。Deepgram の `language=ja` は Nova-3 で有効なので機能上の問題はない。

- **[S-002]** adr.md ADR-001 の「raw body（ArrayBuffer 直送）は PoC 推奨」について、`SpeechTranscribeInput.audioBytes` の型が `ArrayBuffer`（port 定義）であり、OpenAI 側は `new Blob([audioBytes], {type: mime})` で包んでいる点を踏まえると、Deepgram raw body は `fetch(url, { body: input.audioBytes })` で直接 ArrayBuffer を渡す形になる。
  - 理由: workerd の `fetch` は `BodyInit` として `ArrayBuffer` / `Blob` を受けるため raw 直送は multipart より素直で、ADR-001 の「multipart より単純」という評価は妥当。ただし `Content-Type: <mime>`（例 `audio/webm;codecs=opus`）をそのまま Deepgram に渡せるかは Deepgram 側のフォーマット受理に依存する。録音 UI の標準が webm/opus である点は ADR-002 でも認識済みなので、PoC 観点で「webm/opus の Content-Type で Deepgram prerecorded が 2xx を返すか」を ADR-001 の PoC チェック項目に 1 行追加すると、Gemini で警戒している webm/opus リスクを Deepgram でも取りこぼさない。Deepgram は webm/opus を受理するが、明記しておくと安全。

- **[S-003]** registry dispatch 回帰テスト（ステップ 7）の置き場所が「`speechConnectionTester.test.ts` もしくは新規 registry テスト」と曖昧。既存 `speechConnectionTester.test.ts` は `lookupSpeechAdapter` を `vi.mock` で**モック**しており（実 registry を検証していない）。
  - 理由: 「`lookupSpeechAdapter("deepgram")` が実 Deepgram adapter を返す」という AC-1 の核心は、モックされた tester テストでは検証できない。`speech/registry.ts` を実際に import して `speechProviderRegistry.deepgram` が定義済み・`lookupSpeechAdapter("deepgram")` が non-undefined・未知文字列が undefined を返すことを確認する **registry 専用の小さなテスト**を新設する方が AC-1 を直接カバーする。型レベル網羅は typecheck で担保されるが、ランタイム dispatch のスモークを 1 本足すと回帰に強い。

---

#### 良い点

- **依存方向の順序が正しい。** 実装ステップ 1（ドメイン union 拡張）→ 2-3（adapter + registry）→ 4-5（transport/UI）→ 6（DI 確認）→ 7（テスト）→ 8（spec）は内側レイヤー先行で、CLAUDE.md の「dependencies point inward」に厳密に沿っている。ステップ 1 を先に広げて registry 未登録をコンパイルエラーで検出させる順序付けは、`Record<SpeechProvider, SpeechAdapter>` 網羅性チェックの設計意図を正しく活用している。

- **「ドメインに置くべきロジックがアダプターに漏れていない」ことを正しく確認できている。** 調査結果で「DI・ConnectionTester・usecase・DTO・DB は generic dispatch で provider 非依存、Deepgram 追加で触る必要がない（AC-7 は既存再利用で満たせる）」と特定しており、実コード（`buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` / `HttpSpeechConnectionTester`）を確認した結果と完全に一致する。これは #701 ADR-002 が狙った「差分追加だけ」構造の正しい理解。

- **port 契約（`SpeechFailureError` のみ throw、空発話 `""`、workerd AbortError 二重判定）を adapter 側に閉じる方針が明確で、`runIngestionJob` の swallow 契約（`SpeechFailureError` のみ吸収、stub の `BusinessRuleError('unsupported_format')` は伝播）とも整合している。** adapter → application の catch policy（provider native error を集約）を守っている。

- **transport/domain 二重 provider リストの同期漏れを「VO 構築で `InvalidSpeechProvider` fail-fast、ステップ 1・4 を同一 PR で対に」とリスク欄で明示。** schema.ts の既存コメント規約（「片方だけ更新すると VO 構築で落ちる」）と一致し、新エラーコードを増やさず既存 `InvalidSpeechProvider` を再利用する点も `errorCodeNaming.test.ts` への影響ゼロで正しい。

- **既定 provider を openai 据え置き（`defaultSpeech()` 不変）とする判断が正しい。** entity.ts の `coerceSpeech` 後方互換と整合し、既存インスタンスの挙動を変えない。

- **probe の限界（Deepgram に `GET /models/{model}` 相当が無く `/v1/projects` で認証確認のみ、誤 model 名は実 transcribe の 4xx で判明）を adr.md ADR-001 で正直にトレードオフ記載。** ADR-006（実音声を送らない probe）の精神を守りつつ、OpenAI との非対称（model 存在確認の喪失）を隠さず受容しており、設計判断として誠実。

- **Gemini 見送り（ADR-002）・Workers AI 見送り（ADR-003）の判断が妥当。** Gemini は webm/opus 受理不確実（ADR-013 既知）で録音経路リスクを負わないため、Workers AI は `SpeechAdapterConfig`（現状 `{apiKey, model}`）が env.AI バインディング参照を持てず #701 registry 契約への侵襲が大きいため — いずれもスコープ外とする根拠が registry の実構造（`SpeechAdapterConfig` 確認済み）と一致しており、案 A/B の引き継ぎ整理も的確。

---

### 総評

計画は #701 が確立した「差分追加だけ」構造を正しく理解し、レイヤー内側から依存順で組まれている。アーキテクチャ整合性・実現可能性ともに高く、致命的なリスクは無い。要修正 3 件はいずれも局所的: P-001（LLM フォームに存在しない挙動を「踏襲」と誤記）と P-002（model リセットと env ロックの衝突未考慮）は UI ステップ 5 の記述是正で解消、P-003（draft test が env キー前提）は AC-6 検証手順への前提明記で足りる。スコープ拡大は不要。
