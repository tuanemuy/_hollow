# 実装計画 — Issue #738: 追加の文字起こしプロバイダを registry に対応（Deepgram Nova-3）

**Issue:** #738
**作成日:** 2026-06-21
**複雑度:** 中〜大規模

---

## 目的

#701 で確立した文字起こし registry パターン（`speechProviderRegistry: Record<SpeechProvider, SpeechAdapter>`）に 2 本目のプロバイダ **Deepgram Nova-3** を差分追加し、`/admin/speech` から選択・保存・接続テスト・実文字起こしまで通せるようにする。

## 受け入れ条件

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `SPEECH_PROVIDERS` に `deepgram` が追加され、`speechProviderRegistry` の `Record<SpeechProvider, SpeechAdapter>` 網羅性により未登録だとコンパイルエラーになる | Issue「やること」1 | 1, 3 |
| AC-2 | Deepgram の `SpeechAdapter`（`create(cfg): SpeechRecognitionProvider` / `ping`）が実装され、`SpeechFailureError` のみ throw する port 契約を守る | Issue「やること」2 | 2, 3 |
| AC-3 | `/admin/speech` の provider select に Deepgram が出る（`SPEECH_PROVIDERS_TRANSPORT.map`）。`PROVIDER_LABEL` にラベルがあり型で網羅強制される | Issue「やること」3 | 4, 5 |
| AC-4 | provider ごとに既定 model（`deepgram → nova-3`）と API キー placeholder が切り替わり、provider 切替時に model 欄が当該 provider の既定 model にリセットされる（env で model がロックされている場合はリセットを抑制する） | Issue「やること」3（provider 分岐） | 5 |
| AC-5 | env override（`ADMIN_SPEECH_PROVIDER=deepgram`）で DI が Deepgram adapter を選び、Deepgram 用の認証確認 probe が dispatch される。**疎通成功＝probe が 2xx を返すこと**と定義する（Deepgram には OpenAI の `GET /models/{model}` 相当が無く model 存在確認は probe では行わない。具体エンドポイントは ADR-001 で確定） | Issue「やること」4 | 6 |
| AC-6 | Deepgram で 音声 → 文字起こし → 構造化 → プレビュー → ノート保存が通る（接続テストは env の `ADMIN_SPEECH_API_KEY` または保存済み DB ciphertext のキーで実行される。新規 Deepgram キーの事前テストは env に置くか一旦保存後に行う — #701 由来の既存挙動） | Issue 受け入れ条件 2 | 全ステップ（手動検証） |
| AC-7 | env > db > stub フォールバックと SecretBox 暗号化が Deepgram でも動く（構成解決は provider 非依存のため fake env / fake SecretBox の自動テストで `deepgram` が registry に正しく流れることを検証。実 transcribe 疎通のみ手動） | Issue 受け入れ条件 3 | 6（既存 DI が generic なため差分不要を確認）, 7（構成解決の自動テスト） |
| AC-8 | adapter 境界（2xx/4xx/5xx/timeout/空発話）・ping・registry dispatch の回帰テストが OpenAI と対称に追加される | Issue 受け入れ条件 4 | 7 |
| AC-9 | `spec/adr/013-speech-provider.md` / `spec/domains/adminSettings.md` を Deepgram 追加に合わせて更新する | Issue 受け入れ条件 5 | 8 |

## スコープ

### 含まれないもの

- **Gemini audio**: webm/opus・m4a のネイティブ対応が不確実で、採用には実ファイル PoC が必須（#701 残課題・ADR-013 検討済み代替案）。録音 UI は webm/opus が標準のため受理不能だと録音経路で詰まる。本 Issue は「最低 1 本・優先 Deepgram」を満たすため Deepgram に集中し、Gemini は見送る（adr.md ADR-002）。
- **Cloudflare Workers AI 経由（`env.AI` バインディング）**: REST との二系統化は `SpeechAdapter.create` の設計判断を要し（別エントリ vs create 分岐）、第一段は REST で対称に組む方がコストが低く #701 の対称性も保てる。本 Issue は REST のみ。設計整理は adr.md ADR-003 に記録し、別 Issue へ送る。
- **Google Cloud STT v2**: ADR-013 で「Cloudflare Workers と相性が悪い（60s 超で非同期バッチ + GCS 必須）」として既に却下済み。
- ドメインサービス / ユースケース / DTO / DB スキーマの変更（後述「調査結果」のとおり既存が完全に generic で差分不要）。

## 調査結果

- 関連ファイル:
  - `app/core/adapters/speech/registry.ts` — `SpeechAdapter` 型・`speechProviderRegistry`・`lookupSpeechAdapter`。`SpeechAdapterConfig = { apiKey, model }`（baseURL なし）。
  - `app/core/adapters/openai/speechRecognitionProvider.ts` / `speechConnectionPing.ts` / `index.ts`（`openaiSpeechAdapter` barrel export）— 第一プロバイダの正パターン。新プロバイダはこれに対称的に作る。
  - `app/core/adapters/stub/speechRecognitionProvider.ts` — env/db 未設定時のフォールバック。
  - `app/core/domain/adminSettings/valueObject.ts` — `SPEECH_PROVIDERS`（現状 `["openai"]`）・`SpeechProvider` union・`SpeechRecognitionConfig`。default-model マッピングの INVARIANT コメント（258-267 行付近）。
  - `app/core/domain/adminSettings/entity.ts` — `defaultSpeech()`（`provider: 'openai'`, `model: 'gpt-4o-transcribe'`）・`coerceSpeech`。**Deepgram を追加しても既定値は openai のまま**（既定プロバイダは変えない）。
  - `app/core/domain/ingestion/ports/speechRecognitionProvider.ts` — port。`SpeechFailureError` のみ throw、空発話は `""` を返す契約。
  - `app/components/admin/schema.ts` — `SPEECH_PROVIDERS_TRANSPORT`（transport 二重定義）・`updateSpeechConfigSchema` / `testSpeechConnectionSchema`。
  - `app/components/admin/SpeechSettingsForm/index.tsx` — provider select・`PROVIDER_LABEL: Record<ProviderId, string>`・接続テスト UI。model placeholder は「例: gpt-4o-transcribe」を固定文言でハードコード（203, 386 行）。
  - `app/routes/admin/speech.tsx` — ルート（フォームをマウントするだけ。変更不要を確認する）。
  - `app/core/application/di/serverCloudflare.ts` — `buildSpeechRecognitionProvider`（`lookupSpeechAdapter(provider ?? "openai").create({apiKey, model})`）・`resolveConsumerSpeechConfig`（env > db > stub・SecretBox 復号）。**完全に generic**で provider 文字列を registry に渡すだけ。
  - `app/core/application/di/speechConnectionTester.ts` — `HttpSpeechConnectionTester`：`lookupSpeechAdapter(cfg.provider).ping(...)` に dispatch。**generic**。
  - `app/core/adapters/openai/__tests__/speechRecognitionProvider.test.ts` / `speechConnectionPing.test.ts` — 統合テストの正パターン（`vi.stubGlobal("fetch", ...)`）。
  - `app/core/application/di/__tests__/speechConnectionTester.test.ts` — **`lookupSpeechAdapter` を `vi.mock` でモックしている**ため、実 registry に Deepgram が登録されたことは検証できない（AC-1 の registry dispatch は別途専用テストが必要 — 後述ステップ 7）。
  - `app/core/application/ingestion/runIngestionJob.ts`（397, 601 行）/ `previewPrompt.ts`（155 行）— port に渡す locale は **既に `"ja"` 固定**（`ja-JP` ではない）。ADR-013 は「当面 ja-JP 固定」だが実コードは `"ja"`。
- あるべきアーキテクチャ:
  - ヘキサゴナル + DDD。依存は内向き（presentation → application → domain、adapter は内側のポートを実装）。
  - #701 ADR-002 / ADR-013: プロバイダ追加は「ドメイン union 拡張 → adapter 追加 → registry 登録 → UI ラベル追加 → spec 更新」の**差分追加だけ**で済む構造。registry の `Record<SpeechProvider, SpeechAdapter>` で網羅をコンパイル時保証。
  - adapter → application の catch policy: adapter が provider native error を `SpeechFailureError` に集約する。ping は throw せず discriminated result を返す。
  - 入力検証は transport boundary（`updateSpeechConfigSchema`）と VO 構築（`SpeechRecognitionConfig.create`）の 2 点のみ。
  - `*ErrorCode` 命名規約・transport/domain の二重 provider リストは「ドリフトしたら VO 構築で fail-fast」（schema.ts コメント）。
- 既存実装の状態:
  - **DI・ConnectionTester・ユースケース・DTO・DB スキーマは provider 非依存（generic dispatch）**。Deepgram 追加で**触る必要がない**（AC-7 は既存実装の再利用で満たせる）。これがあるべき姿（#701 ADR-002）と完全に一致している。
  - 乖離なし。唯一、フォームの model placeholder / 説明文言が OpenAI 固定でハードコードされている点だけは provider 分岐（AC-4）で改善が要る。
- 依存関係:
  - 変更は「ドメイン VO 1 値追加 / transport 1 値追加 / registry 1 行 / 新 adapter ディレクトリ / フォーム分岐 / spec」に閉じる。usecase・DI・DTO・DB は無変更。
  - `errorCodeNaming.test.ts`（`app/core/domain/adminSettings/__tests__/`）に新エラーコードは増えない（プロバイダ追加は既存 `InvalidSpeechProvider` を再利用）。

## 設計

### ドメインモデルへの影響

- `app/core/domain/adminSettings/valueObject.ts`:
  - `SPEECH_PROVIDERS` を `["openai", "deepgram"] as const` に拡張。`SpeechProvider` union が自動で広がる。
  - INVARIANT コメント（default-model マッピング）に `deepgram → nova-3` を追記。
  - `SpeechRecognitionConfig.create` のバリデーションは provider 非依存（model 長さ・apiKeySource 不変条件のみ）なのでロジック変更不要。`baseURL` 不在も Deepgram REST（固定エンドポイント `https://api.deepgram.com/v1/listen`）と整合（YAGNI 維持）。
- `entity.ts` `defaultSpeech()` は **openai のまま**（既定プロバイダは変えない）。`coerceSpeech` も無変更。
- port `SpeechRecognitionProvider` / `SpeechFailureError` は無変更（差し替え可能な抽象として既に設計済み）。

### ユースケース / アプリケーションロジック

- なし。`UpdateSpeechConfig` / `TestSpeechConnection` / 取り込みパイプラインの audio 分岐はすべて provider 文字列を registry に流すだけで、provider 固有ロジックを持たない。`HttpSpeechConnectionTester` も generic dispatch のため無変更（調査で確認済み）。

### アダプター / 永続化 / 外部連携

- 新規ディレクトリ `app/core/adapters/deepgram/`:
  - `speechRecognitionProvider.ts` — `DeepgramSpeechRecognitionProvider implements SpeechRecognitionProvider`。
    - Deepgram の prerecorded API: `POST https://api.deepgram.com/v1/listen?model=nova-3&language=ja&smart_format=true`、`Authorization: Token <key>`、body は raw audio bytes（`Content-Type: <mime>`）。multipart ではなく raw body 直送（OpenAI との差分）。
    - レスポンス JSON から `results.channels[0].alternatives[0].transcript` を取り出し `.trim()`。空・欠落は `""`（空発話契約）。
    - OpenAI adapter と対称に: 空 apiKey ガード、サイズ上限ガード（Deepgram は明示上限が緩いので `maxIngestionBytes` 整合の保守値を定数化、もしくは上限ガードは設けず timeout に委ねる — adr.md ADR-001 で判断）、`AbortController` timeout（workerd 向け `isAbortError` の DOMException 二重判定をコピー）、非 2xx は `sanitizeErrorReason` で categorize して `SpeechFailureError`、transport/JSON 不正も `SpeechFailureError`。**`SpeechFailureError` のみ throw**。
    - `localeToLanguage` を OpenAI と対称に first-subtag 抽出で実装（Deepgram の `language` パラメータ）。**実入力の locale は既に `"ja"` 固定**（`runIngestionJob.ts` / `previewPrompt.ts`）なので `language=ja` で Nova-3 上有効。first-subtag 抽出は将来 locale 可変化への防御（ADR-013）。
  - `speechConnectionPing.ts` — `pingDeepgramSpeech(config): Promise<{ok:true} | {ok:false; reason}>`。Deepgram には `GET /models/{model}` 相当が無いため、**`GET https://api.deepgram.com/v1/projects` 等の認証だけ確認できる軽量エンドポイント**で 2xx = 疎通 OK とする（実音声を送らない probe 契約・ADR-006）。probe のエンドポイント選定は adr.md ADR-001 に明記。`maskSecrets` のみ（OpenAI ping と対称）。
  - `index.ts` — `deepgramSpeechAdapter` を `satisfies SpeechAdapter` で export。`import type { SpeechAdapter } from "../speech/registry"`（value cycle 回避は openai/index.ts と同型）。`create` は `{apiKey, model}` を渡す、`ping` は `pingDeepgramSpeech` を呼び discriminated result を `{ok, error}` に畳む。
- `app/core/adapters/speech/registry.ts`:
  - `import { deepgramSpeechAdapter } from "../deepgram";` を追加し、`speechProviderRegistry` に `deepgram: deepgramSpeechAdapter` を登録。
- 永続化・DB スキーマ: 無変更（`speech_provider` は既に任意文字列カラム、`coerceSpeech` が後方互換）。

### UI / プレゼンテーション

- `app/components/admin/schema.ts`:
  - `SPEECH_PROVIDERS_TRANSPORT` を `["openai", "deepgram"] as const` に拡張（transport 二重定義の同期。コメント規約どおり）。
- `app/components/admin/SpeechSettingsForm/index.tsx`:
  - `PROVIDER_LABEL` に `deepgram: "Deepgram"` を追加（`Record<ProviderId, string>` で網羅強制）。
  - **provider 分岐**（AC-4）: provider ごとの既定 model（`PROVIDER_DEFAULT_MODEL: Record<ProviderId, string>` = `{ openai: "gpt-4o-transcribe", deepgram: "nova-3" }`）と API キー placeholder（OpenAI `sk-...` / Deepgram は Token 形式）・model ヒント文言（「例: gpt-4o-transcribe」/「例: nova-3」）を provider に応じて切り替える。**placeholder の provider 分岐は LLM フォームに先例がある**（LLM フォーム 378-384 行が `provider === "anthropic" ? ... : ...` で placeholder を切り替える）。
  - **provider 変更時の model 自動リセット（本 Issue で新規導入する挙動）**: provider select の `onChange` で `setModel(PROVIDER_DEFAULT_MODEL[next])` を実行し、当該 provider の既定 model にリセットする（OpenAI の model を Deepgram に持ち越すと接続テスト・実 transcribe が落ちるため）。**この挙動は LLM フォームには存在しない**（LLM フォームの provider `onChange` は `setProvider(next)` のみで model リセットを持たない）。Speech フォーム固有の新規挙動として導入し、OpenAI フォームとの非対称は許容する（持ち越しによる接続テスト失敗の事前回避が目的で、OpenAI 単独運用時には不要なため）。
  - **env ロックとの衝突回避（[arch P-002]）**: model が env でロックされている（`envOverrides.model === true`）場合はリセットを抑制する。`onChange` 内を `if (!envOverrides.model) setModel(PROVIDER_DEFAULT_MODEL[next])` とし、env ロック中に model state が env 固定値から乖離しないようにする（model 入力は `disabled={isPending || envOverrides.model}` で編集不可なので、ロック中に値が勝手に変わって見える混乱を防ぐ）。なお `envOverrides.provider === true` のときは provider select 自体が `disabled` なので、このパスは `envOverrides.provider === false` のときのみ通る。
- `app/routes/admin/speech.tsx`: 変更不要（確認のみ）。

## 実装ステップ

依存方向の順（内側のレイヤーが先）。

### 1. ドメイン: SpeechProvider union 拡張

- **対象ファイル:** `app/core/domain/adminSettings/valueObject.ts`
- **変更内容:** `SPEECH_PROVIDERS` を `["openai", "deepgram"] as const` に。INVARIANT コメントの default-model マッピングに `deepgram → nova-3` を追記。
- **理由:** registry の網羅性チェックの基点。これを先に広げると registry に Deepgram 未登録の段階でコンパイルエラーになり、登録漏れを型で検出できる。

### 2. アダプター: Deepgram adapter 実装

- **対象ファイル:** `app/core/adapters/deepgram/speechRecognitionProvider.ts`, `app/core/adapters/deepgram/speechConnectionPing.ts`
- **変更内容:** OpenAI adapter に対称な `DeepgramSpeechRecognitionProvider`（raw-body POST `/v1/listen`、`Authorization: Token`、transcript 抽出、空発話 `""`、`SpeechFailureError` のみ throw、workerd timeout 対応）と `pingDeepgramSpeech`（認証確認用 GET probe、throw せず result 返却）。
- **理由:** port 契約（AC-2）を満たす provider 実装。

### 3. アダプター: barrel + registry 登録

- **対象ファイル:** `app/core/adapters/deepgram/index.ts`, `app/core/adapters/speech/registry.ts`
- **変更内容:** `deepgramSpeechAdapter satisfies SpeechAdapter` を export し、registry に `deepgram:` で登録。ステップ 1 のコンパイルエラーがここで解消する。
- **理由:** AC-1。registry 経由で DI・ConnectionTester が自動的に Deepgram を扱えるようになる。

### 4. プレゼンテーション: transport list 同期

- **対象ファイル:** `app/components/admin/schema.ts`
- **変更内容:** `SPEECH_PROVIDERS_TRANSPORT` に `"deepgram"` を追加。
- **理由:** AC-3。select 選択肢の自動増加と transport バリデーション（ドリフト防止）。

### 5. プレゼンテーション: フォーム provider 分岐

- **対象ファイル:** `app/components/admin/SpeechSettingsForm/index.tsx`
- **変更内容:** `PROVIDER_LABEL` に Deepgram 追加。`PROVIDER_DEFAULT_MODEL` / placeholder / ヒント文言を provider 分岐。provider `onChange` で `if (!envOverrides.model) setModel(PROVIDER_DEFAULT_MODEL[next])` の新規リセット挙動を追加（env ロック時は抑制）。
- **接続テストの前提（[arch P-003]）**: `onTest` は draft test で `apiKeySource: "env"`・`apiKeyCiphertext: null` をハードコードしており（フォーム 139-155 行）、**フォーム入力中の plain API キーは使えない**（ciphertext は adapter 境界を越えない設計）。Deepgram 初回キー設定時の事前テストは env（`ADMIN_SPEECH_API_KEY`）にキーを置くか一旦保存後に行う（#701 由来の既存制約・本 Issue でスコープ拡大しない）。この前提を AC-6 とテスト方針に明記済み。
- **理由:** AC-3 / AC-4。

### 6. DI: env override 確認 / 既定 provider 動作確認

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`（必要なら）
- **変更内容:** `buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` は generic のため**原則無変更**。`ADMIN_SPEECH_PROVIDER=deepgram` 経路を読み直して、`provider ?? "openai"` のフォールバックや consumer 側の SecretBox 復号が Deepgram でも成立することを確認。コメント中の「OpenAI speech adapter」等の文言が誤解を生むなら provider 中立に微修正。
- **空 model 時の扱い（[S-002]・実装判断として確定）**: Deepgram probe は `cfg.model` を URL に使わない（probe は認証確認用エンドポイントを叩くのみ）。ただし **OpenAI との UX 対称性のため空 model は `ok:false` とする**（OpenAI probe は空 model で `ok:false` を返すため、Deepgram だけ空 model で成功扱いになると provider 間で接続テスト挙動が非対称になる）。Deepgram ping の入口で空 model をガードし `ok:false`（reason 付き）を返す。
- **理由:** AC-5 / AC-7。コードは generic だが env > db > stub・暗号化が Deepgram でも通ることを検証する。

### 7. テスト: 統合テスト + registry dispatch 回帰

- **対象ファイル:** `app/core/adapters/deepgram/__tests__/speechRecognitionProvider.test.ts`, `app/core/adapters/deepgram/__tests__/speechConnectionPing.test.ts`, **新規 `app/core/adapters/speech/__tests__/registry.test.ts`（registry dispatch 専用）**, 構成解決の自動テスト（`serverCloudflare` の `resolveConsumerSpeechConfig` / `buildSpeechRecognitionProvider` を fake env / fake SecretBox で検証）
- **変更内容:**
  - adapter 統合テスト: OpenAI と対称に 2xx（transcript 返却）/ 4xx / 5xx / timeout / 空発話 / ping 成功・失敗を `vi.stubGlobal("fetch")` で網羅。
  - **registry dispatch 専用テスト（新設・[arch S-003]）**: `speech/registry.ts` を**実 import** して `speechProviderRegistry.deepgram` が定義済み・`lookupSpeechAdapter("deepgram")` が non-undefined・未知文字列が `undefined` を返すことを検証する。既存 `speechConnectionTester.test.ts` は `lookupSpeechAdapter` を `vi.mock` でモックしており AC-1（実 registry に Deepgram が解決されること）を検証できないため、モックしない専用テストを新設する。
  - **構成解決の自動テスト（[coverage S-001]）**: env > db > stub フォールバックと SecretBox 復号が provider 非依存に動くことを fake env / fake SecretBox で検証し、`deepgram` 文字列が registry に正しく流れることを押さえる（AC-7 の構成解決部分を CI で担保。実 transcribe 疎通のみ手動）。
- **理由:** AC-8（adapter 境界）/ AC-1（registry dispatch）/ AC-7（構成解決の自動テスト）。

### 8. ドキュメント更新

- **対象ファイル:** `spec/adr/013-speech-provider.md`, `spec/domains/adminSettings.md`
- **変更内容:** ADR-013 に「第一段 OpenAI 固定 → Deepgram を 2 本目として registry 追加（#738）」の追記、Deepgram の API 特性（raw-body・Token 認証・probe エンドポイント）・Gemini/Workers AI 見送りの記録。adminSettings.md の `SpeechProvider（列挙）` を `["openai", "deepgram"]` に更新し default-model マッピング（`deepgram → nova-3`）を明記。
- **理由:** AC-9。

## 設計判断

- **実装プロバイダは Deepgram Nova-3 のみ**（Gemini / Workers AI は本 Issue 見送り）。
- **Deepgram は REST 直送（raw body + Token 認証）で実装**し、OpenAI multipart とは body 構築が異なる。
- **接続 probe は `GET /v1/listen` ではなく認証確認用の軽量エンドポイント**で疎通する（実音声不要・ADR-006 踏襲）。
- 詳細は `.issue/738/adr.md`（ADR-001〜003）参照。

## リスクと注意点

- **Deepgram probe エンドポイントの選定**: OpenAI のような `GET /models/{model}` 相当が無い。`GET /v1/projects` 等で「key 有効」までは確認できるが「model 存在」までは保証しにくい。誤った model 名は実 transcribe 時に 4xx で判明する設計を許容する（adr.md ADR-001 にトレードオフ記載）。
- **Cloudflare Workers の raw-body `fetch`**: ArrayBuffer body 直送が workerd で動くかは PoC 推奨（ADR-013 が multipart で同種注意を記載済み。Deepgram は raw body なので multipart より単純だが要確認）。
- **transport / domain の二重 provider リスト同期漏れ**: 片方だけ更新すると VO 構築で `InvalidSpeechProvider` fail-fast になるが、ステップ 1・4 を同一 PR で対にすること。
- **フォームの model 持ち越し**: provider を OpenAI → Deepgram に切り替えても model 欄が `gpt-4o-transcribe` のままだと接続テストが落ちる。ステップ 5 の**新規リセット挙動**（LLM フォームには無い・本 Issue で導入）で回避。ただし env で model がロックされている場合（`envOverrides.model`）はリセットを抑制し、env 固定値との乖離を避ける（[arch P-002]）。
- **接続テストが env キー固定（[arch P-003]）**: draft test は `apiKeySource:"env"` 固定でフォーム入力中の plain キーを使えない。Deepgram 初回キーの事前テストは env に置くか保存後に行う必要があり、AC-6 検証手順にこの前提を明記済み（#701 由来の既存制約・スコープ不変）。
- **既定 provider は openai 据え置き**: `defaultSpeech()` を変えると既存インスタンスの挙動が変わるため触らない。

## テスト方針

- 単体/統合（adapter）: Deepgram `transcribe` の 2xx（transcript 抽出）/ 4xx / 5xx / timeout（AbortError）/ 空発話（transcript 空・欠落 → `""`）/ 空 apiKey ガード。`pingDeepgramSpeech` の 2xx → `ok:true`、非 2xx / timeout → `ok:false` + reason、secret マスキング。
- registry dispatch（専用テスト新設・[arch S-003]）: 実 registry を import し `lookupSpeechAdapter("deepgram")` が Deepgram adapter を返し、未登録文字列は `undefined`。既存 `speechConnectionTester.test.ts` は `lookupSpeechAdapter` をモックするため AC-1 を検証できず、モックしない専用テスト（`speech/__tests__/registry.test.ts`）でカバーする。`HttpSpeechConnectionTester` が `deepgram` config で Deepgram ping に dispatch する回帰は既存テストの拡張で押さえる。
- ドメイン: `SpeechRecognitionConfig.create({provider:"deepgram", ...})` が通り、未知 provider は `InvalidSpeechProvider`。registry 網羅性（型レベル — `pnpm typecheck` で担保）。
- 構成解決の自動テスト（[coverage S-001]・AC-7）: `resolveConsumerSpeechConfig` / `buildSpeechRecognitionProvider` を fake env / fake SecretBox で検証し、env > db > stub フォールバック・SecretBox 復号・`deepgram` の registry 流入を実 API キー無しで CI 担保。
- 手動/ブラウザ（AC-6）: `/admin/speech` で Deepgram 選択 → API キー入力 → 接続テスト成功 → 保存 → 録音 → 音声取り込み → 文字起こし → 構造化 → プレビュー → ノート保存まで（要 Deepgram API キー。`docs/test.md` のローカルサーバ検証手順に従う）。**接続テストの前提（[arch P-003]）**: `onTest` は `apiKeySource:"env"` 固定でフォーム入力中の plain キーを使わないため、新規 Deepgram キーの事前テストは `ADMIN_SPEECH_API_KEY`（env）に置くか一旦保存後（DB ciphertext）に行う。env に置かず保存前にテストすると疎通できない点を検証手順で明示する。
- env > db > stub: `ADMIN_SPEECH_PROVIDER=deepgram` + `ADMIN_SPEECH_API_KEY` 設定時は env 優先、未設定時は DB ciphertext（SecretBox 復号）、いずれも無ければ Stub の確認（上記構成解決の自動テストで CI 化）。
- 既存テスト維持: `pnpm typecheck && pnpm lint:fix && pnpm format`、`errorCodeNaming.test.ts` / `schema.test.ts` が緑であること。

## レビュー履歴

### 1周目

**修正した点**:
- **[P-001]（両視点共通）**: 「LLM フォームの model リセット挙動を踏襲」が事実誤認だったため修正。実コード確認の結果、LLM フォームの provider `onChange` は `setProvider(next)` のみで model リセットを持たない（placeholder の provider 分岐のみ実在）。ステップ 5 / 設計「UI」節を「placeholder 分岐は LLM フォームに先例あり。**model 自動リセットは本 Issue で新規導入する Speech フォーム固有挙動（LLM フォームには無い）**、OpenAI フォームとの非対称は許容」と書き直し、precedent 参照を削除。リセット挙動を AC-4 に追記して検証可能にした。
- **[arch P-002]**: model 自動リセットが env ロック（`envOverrides.model`）と衝突しうる点を考慮。`onChange` 内を `if (!envOverrides.model) setModel(...)` とし env ロック時はリセット抑制する条件をステップ 5・設計 UI 節・AC-4・リスク節に明記。
- **[arch P-003]**: 接続テスト（`onTest`）が `apiKeySource:"env"`・`apiKeyCiphertext:null` 固定でフォーム入力中の plain キーを使えない（フォーム 139-155 行で確認）。Deepgram 初回キーの事前テストは env に置くか保存後に行う前提を AC-6・ステップ 5・テスト方針・リスク節に明記（#701 由来の既存制約・スコープ不変）。
- **[arch S-001]**: `localeToLanguage(ja-JP → ja)` が実入力（`"ja"` 固定 — `runIngestionJob.ts` 397/601 行・`previewPrompt.ts` 155 行で確認）と食い違うため、「実入力は `ja`、OpenAI と対称に first-subtag 抽出（将来 locale 可変化への防御）」と訂正。調査結果にも実態を追記。

**取り込んだ改善提案**:
- **[coverage S-001]**: AC-6/AC-7 が実 API キー前提の手動検証に依存していた件。構成解決（env > db > stub・SecretBox）は provider 非依存のため fake env / fake SecretBox の自動テストで `deepgram` の registry 流入を CI 担保する項目を AC-7・ステップ 7・テスト方針に追加。手動検証は実 transcribe 疎通に限定。
- **[coverage S-002]**: AC-5 の probe エンドポイント未確定（ADR-001 proposed）による合否ぶれを解消。「疎通成功＝probe が 2xx を返すこと」と AC-5 の検証条件を確定し、Deepgram には `GET /models/{model}` 相当が無く model 存在確認は probe で行わない限界を明記。ADR-001 にも probe 成功定義を追記。
- **[arch S-002]**: ADR-001 に「PoC で確認する項目」節を新設し、「webm/opus の `Content-Type` で Deepgram prerecorded が 2xx を返すか」を ArrayBuffer 直送・probe 2xx 確認と並べて追加。
- **[arch S-003]**: 既存 `speechConnectionTester.test.ts` は `lookupSpeechAdapter` をモックするため AC-1（registry dispatch）を検証できない。実 registry を import して Deepgram 解決を検証する専用テスト `speech/__tests__/registry.test.ts` の新設をステップ 7・テスト方針に追加。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 2周目

両視点（arch-risk / coverage）とも問題点ゼロ。coverage は指摘なし、arch-risk は軽微な改善提案 2 件のみ。下記 2 件を取り込んだ。

**取り込んだ改善提案**:
- **[S-001]**: ADR の Status が全件 `Proposed` のままで PoC → 実装の前後関係が不明瞭だった件。ADR-001 の Status に「PoC で raw-body fetch + webm/opus 2xx を確認できたら Accepted、実装着手はその後」「PoC → ADR-001 Accepted → 実装の順」を 1 行追記し、raw-body fetch 不成立時の手戻りリスクの所在（PoC 段階）を明確化した。
- **[S-002]**: Deepgram probe は `cfg.model` を URL に使わないため空 model 時の扱いが未確定だった件（OpenAI は空 model で `ok:false`）。ステップ 6 に「Deepgram probe は model を使わないが、OpenAI との UX 対称性のため空 model は `ok:false` とする」旨を実装判断として確定・明記した。

**結論**: 2周目で収束。両視点とも問題点ゼロ・改善提案 2 件（S-001/S-002）を取り込み、レビューループ終了。
