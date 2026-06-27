# 実装計画 — Issue #766: feat(speech): add Gemini audio transcription provider to the registry (#738 follow-up)

**Issue:** #766
**作成日:** 2026-06-27
**複雑度:** 中〜大規模

---

## 目的

音声文字起こし registry に 3 本目のプロバイダ **Gemini audio** を、既存 gemini アダプター + openai/deepgram speech アダプターに対称な diff-only 構造で追加する。ただしマージは「実録音 webm/opus（＋できれば m4a）を Gemini が受理して transcript を返す」ことの実ファイル検証を前提条件とし、受理不能なら実装コミットを revert して先送りを継続する（implement-then-verify）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 実録音 **webm/opus**（＋できれば **m4a**）ファイルで Gemini が 2xx + 非空 transcript を返すことを実ファイルで確認。受理不能なら実装を revert し先送り（結果を ADR に記録）。**これがマージの前提条件** | Issue 受け入れ基準 / ADR-003 | 8, 9 |
| AC-2 | Gemini の `SpeechAdapter` が `speechProviderRegistry` に登録され、`/admin/speech` から選択・保存・接続テスト（probe 2xx）ができる | Issue 受け入れ基準 | 1,2,3,4,5,6,7,8 |
| AC-3 | audio → 文字起こし → 構造化 → プレビュー → ノート保存 のフルパスが E2E で動く（Gemini 選択時） | Issue 受け入れ基準 | 8 |
| AC-4 | `env > db > stub` フォールバックと SecretBox 暗号化が Gemini provider で動く（request / consumer 両 DI 経路） | Issue 受け入れ基準 | 5, 8 |
| AC-5 | 回帰テストが adapter 境界（2xx / 4xx / 5xx / timeout / 空音声）と registry ディスパッチをカバーし openai/deepgram と対称 | Issue 受け入れ基準 | 7 |
| AC-6 | `spec/adr/013-speech-provider.md` と `spec/domains/adminSettings.md` が Gemini 反映済み。`.issue/738` ADR-002 を Superseded に更新 | Issue 受け入れ基準 | 10 |

## スコープ

### 含まれないもの
- **Cloudflare Workers AI ルート（`env.AI` バインディング）** — #788 に分離済み。`SpeechAdapterConfig` / DI / `ServerEnv` の契約変更を伴うため本 Issue では触れない。
- **Gemini Files API（>20MB 非インライン投入）** — YAGNI。inline 上限超はサイズガードで弾く（ADR-001）。
- **録音 UI 側のフォーマット変換（webm→ogg/wav）** — 受理 NG 時の代替案だが本 Issue 外（別 Issue）。
- **`SpeechAdapterConfig` / port 契約の変更** — Gemini は `{apiKey, model}` のみで足り、#701 registry 契約は無傷（diff-only）。

## 調査結果

- 関連ファイル:
  - `app/core/adapters/speech/registry.ts` — `SpeechAdapter` 型 / `SpeechAdapterConfig`(`{apiKey, model}`) / `speechProviderRegistry: Record<SpeechProvider, SpeechAdapter>` / `lookupSpeechAdapter`。**provider 非依存の generic dispatch**で、追加は 1 行 import + 1 行マップ。
  - `app/core/domain/ingestion/ports/speechRecognitionProvider.ts` — port。`transcribe(input): Promise<string>`、`SpeechFailureError`、`SpeechTranscribeInput{audioBytes:ArrayBuffer, mime, locale}`。
  - `app/core/adapters/deepgram/{speechRecognitionProvider,speechConnectionPing,index}.ts` + `__tests__/` — 対称実装のリファレンス（raw body 版）。
  - `app/core/adapters/openai/speechRecognitionProvider.ts` — multipart 版リファレンス（サイズプリフライト・`localeToLanguage`・`isAbortError`）。
  - `app/core/adapters/gemini/{messagesClient,ocrProvider,pdfExtractor,connectionPing,index}.ts` — Gemini の REST `fetch` 配線（SDK は不使用。`callGeminiGenerate` は `x-goog-api-key` ヘッダ付き `generateContent` の REST 呼び出し）。`callGeminiGenerate`（timeout/認証/エラー mapper/空 parts→""）、`arrayBufferToBase64`、`pingGemini`、`geminiAdapter`（`ocrErrorMapper`/`pdfErrorMapper` の同型 mapper パターン）。**Gemini speech はこれらをほぼそのまま流用できる。**
  - `app/core/domain/adminSettings/valueObject.ts` — `SPEECH_PROVIDERS = ["openai","deepgram"]`、default-model マッピング INVARIANT コメント、`SpeechRecognitionConfig.create`。
  - `app/components/admin/schema.ts` — `SPEECH_PROVIDERS_TRANSPORT`（transport 二重リスト）。
  - `app/components/admin/SpeechSettingsForm/index.tsx` — `PROVIDER_LABEL` / `PROVIDER_DEFAULT_MODEL` / `PROVIDER_API_KEY_PLACEHOLDER` の 3 つの provider 分岐 Record。
  - `app/core/domain/adminSettings/entity.ts` — `defaultSpeech()`（`openai`/`gpt-4o-transcribe` 据え置き、**変更不要**）。
  - `app/core/application/di/serverCloudflare.ts` — `buildSpeechRecognitionProvider`（request 経路、`provider ?? "openai"` → `lookupSpeechAdapter` → `adapter.create`）/ `resolveConsumerSpeechConfig`（consumer 経路、env>db>stub + SecretBox 復号）。**いずれも provider 非依存**で、registry に載れば Gemini も自動的に通る。
  - `app/core/application/di/speechConnectionTester.ts` — `HttpSpeechConnectionTester`（`lookupSpeechAdapter` → `adapter.ping`、generic）。
  - `app/core/application/dto/adminSettings.ts` — `speech` DTO 投影。provider 非依存（型は `SpeechProviderName`）で**変更不要**。
- あるべきアーキテクチャ: spec/adr/013 + `.issue/738` の通り、registry パターンにより REST プロバイダ追加は **domain union 1 値 / transport list 1 値 / registry 1 行 / adapter ディレクトリ 1 つ / UI ラベル・既定モデル・placeholder 各 1 値** の差分だけで着地する。ユースケース / DI / ConnectionTester / DTO / DB スキーマは無変更（generic dispatch）。port 契約は厳守: `SpeechFailureError` のみ throw・空発話は `""`・workerd AbortError を timeout 扱い。
- 既存実装の状態: あるべき姿と一致。Gemini アダプター（llm/ocr/pdf）が既に `callGeminiGenerate` / `pingGemini` を備え、speech は同じ mapper パターンで足せる。乖離なし。本 Issue は純粋に差分追加 + 実ファイル検証。
- 依存関係: `SPEECH_PROVIDERS`（domain）と `SPEECH_PROVIDERS_TRANSPORT`（transport）は二重管理で、片方だけ増やすと VO 構築が `InvalidSpeechProvider` で fail-fast。**両方を原子的に更新**する。default-model マッピングは valueObject の INVARIANT コメント・UI の `PROVIDER_DEFAULT_MODEL` の 2 箇所に存在 — 両方に gemini を追加。

## 設計

レイヤー内側 → 外側（domain union → registry → adapter → DI → UI → test → spec）。

### ドメインモデルへの影響
- `SpeechProvider` union に `"gemini"` を 1 値追加（`SPEECH_PROVIDERS`）。`SpeechRecognitionConfig` の構造・不変条件は不変（provider は closed literal union のまま、`apiKeySource`/`ciphertext` ロジック共通）。
- valueObject の default-model INVARIANT コメントに `gemini → "gemini-2.5-flash"` を追記。選定根拠は **文字起こし（音声 inlineData）用途として低レイテンシ・現行世代の `gemini-2.5-flash` を独立に選定**（LLM フォームの例示既定は `gemini-1.5-pro`（`app/components/admin/LLMSettingsForm/index.tsx` L470）であり、LLM 既定との一致を主張しない。`gemini-2.5-flash` は `messagesClient.ts` の JSDoc が実在モデル例として挙げる現行モデル）。`defaultSpeech()` は **openai 据え置きで変更しない**（既定プロバイダは不変）。

### ユースケース / アプリケーションロジック
- なし。`HttpSpeechConnectionTester` / DTO 投影 / DI の `buildSpeechRecognitionProvider` / `resolveConsumerSpeechConfig` はすべて provider 非依存の generic dispatch。registry に登録されれば Gemini も自動的に通る。

### アダプター / 永続化 / 外部連携
- `app/core/adapters/gemini/speechRecognitionProvider.ts`（新規）— `GeminiSpeechRecognitionProvider implements SpeechRecognitionProvider`。`callGeminiGenerate` 流用 + `speechErrorMapper`（全カテゴリ → `SpeechFailureError`）。`GeminiSpeechConfig{apiKey, model, timeoutMs?}`、`maxTokens=16_384`、`timeoutMs` 既定 `120_000`、`input.locale` はプロンプトに織り込む（ja-JP）。mime allowlist なし（ADR-001/003）。`TRANSCRIBE_SYSTEM_PROMPT`（「音声を逐語で文字起こし。話者ラベル・タイムスタンプ不要。発話が無ければ空文字。注釈を付けない」）。
  - **コンストラクタ既定の明文化（S-003）:** registry の `SpeechAdapterConfig` は `{apiKey, model}` のみで `timeoutMs`/`maxTokens` を受け取れない。`GeminiSharedConfig` の既定は timeout `60_000` / maxTokens `4096`（`messagesClient.ts` L57/L60）なので、明示上書きしないと openai/deepgram の 120s と非対称になり、長尺文字起こしが 4096 トークンで途中切れする。よって `GeminiSpeechRecognitionProvider` のコンストラクタで `timeoutMs=120_000` / `maxTokens=16_384` を内部設定する責務を持たせる（OCR が `maxTokens ?? 16_384` で上書きしているのと同じパターン）。
  - **サイズガードは base64 後の総リクエストサイズで評価（P-002）:** Gemini inline は音声を base64 化して JSON body に投入するため約 33% 増。Gemini の inline 制約は「総リクエストサイズ 20MB 超は Files API」で、raw 20MiB ガードでは base64 後（約 27MB）に 20MB 制約を超え、ガードを通過したのに Gemini が 4xx 拒否する穴になる。よって **`arrayBufferToBase64` 後の文字列長（≒ 総ペイロード）で 20MB 上限を評価する**か、raw 閾値を **約 14MiB**（base64 ≈ 19MB で 20MB 未満）に下げる。超過時は `SpeechFailureError`（openai の 25MiB プリフライトと対称）。
- `app/core/adapters/gemini/speechConnectionPing.ts`（新規・薄いラッパ）— `pingGemini` を speech 文脈で再エクスポート / 直接 index から呼ぶ（deepgram 構成と対称に独立ファイルを置くが、中身は `pingGemini` 委譲）。※ 既存 `connectionPing.ts` をそのまま使えるため、対称性のための薄いファイルにとどめる（重複ロジックは書かない）。
- `app/core/adapters/gemini/index.ts`（変更）— `geminiSpeechAdapter satisfies SpeechAdapter`（`import type { SpeechAdapter } from "../speech/registry"` の type-only import で value cycle 回避）を追加 export。`create` は `new GeminiSpeechRecognitionProvider({apiKey, model})`、`ping` は `pingGemini` 委譲（`geminiAdapter.ping` と同型）。
- `app/core/adapters/speech/registry.ts`（変更）— `import { geminiSpeechAdapter } from "../gemini"` + `gemini: geminiSpeechAdapter` の 1 行マップ。
- DB スキーマ / マイグレーション: なし（`speech_provider` は文字列カラム、値が増えるだけ）。

### UI / プレゼンテーション
- `app/components/admin/schema.ts`: `SPEECH_PROVIDERS_TRANSPORT` に `"gemini"` 追加。
- `app/components/admin/SpeechSettingsForm/index.tsx`: `PROVIDER_LABEL.gemini = "Gemini"`、`PROVIDER_DEFAULT_MODEL.gemini = "gemini-2.5-flash"`、`PROVIDER_API_KEY_PLACEHOLDER.gemini = "AIza..."`。説明文「対応プロバイダ: OpenAI / Deepgram」を「OpenAI / Deepgram / Gemini」に更新。

## 実装ステップ

> ステップ 1〜7 + 8 のコード差分は **1 つの独立コミット**にまとめる（ADR-003: 検証 NG 時に `git revert` で原子的に戻すため）。spec/ADR 更新（ステップ 10）は別コミット。

### 1. domain union に gemini を追加
- **対象ファイル:** `app/core/domain/adminSettings/valueObject.ts`
- **変更内容:** `SPEECH_PROVIDERS` に `"gemini"`、default-model INVARIANT コメントに `gemini → "gemini-2.5-flash"` を追記。
- **理由:** registry の `Record<SpeechProvider, SpeechAdapter>` 網羅をコンパイル時に成立させる起点。

### 2. transport list に gemini を追加
- **対象ファイル:** `app/components/admin/schema.ts`
- **変更内容:** `SPEECH_PROVIDERS_TRANSPORT` に `"gemini"`。
- **理由:** domain と transport の二重リストはドリフトすると `InvalidSpeechProvider` で fail。原子的に揃える。

### 3. Gemini speech adapter（transcribe）
- **対象ファイル:** `app/core/adapters/gemini/speechRecognitionProvider.ts`（新規）
- **変更内容:** `GeminiSpeechRecognitionProvider` を `callGeminiGenerate` + `speechErrorMapper` で実装。コンストラクタで maxTokens 16384 / timeout 120000 を既定として内部設定（`SpeechAdapterConfig` は `{apiKey, model}` のみのため、S-003）。サイズプリフライトは **base64 後の総リクエストサイズで 20MB を評価**（raw なら約 14MiB に下げる、P-002）。transcribe システムプロンプト。ocr/pdf アダプターと同じ構造。
- **理由:** port 契約（`SpeechFailureError` のみ・空発話 ""・workerd abort=timeout）を `callGeminiGenerate` の既存実装で満たす。

### 4. Gemini speech ping（薄いラッパ）+ barrel
- **対象ファイル:** `app/core/adapters/gemini/speechConnectionPing.ts`（新規・`pingGemini` 委譲）, `app/core/adapters/gemini/index.ts`（変更）
- **変更内容:** `geminiSpeechAdapter satisfies SpeechAdapter` を追加 export（`create`/`ping`）。`ping` は `pingGemini` 委譲。type-only import で value cycle 回避。
- **理由:** registry が参照する value。deepgram/openai barrel と対称。

### 5. registry に登録
- **対象ファイル:** `app/core/adapters/speech/registry.ts`
- **変更内容:** `geminiSpeechAdapter` を import し `gemini:` マップに 1 行追加。
- **理由:** AC-2。DI / ConnectionTester / DTO は generic dispatch なのでこれで request/consumer 両経路が自動的に通る（AC-4 の配線は既存コードが担う）。

### 6. UI ラベル / 既定モデル / placeholder
- **対象ファイル:** `app/components/admin/SpeechSettingsForm/index.tsx`
- **変更内容:** `PROVIDER_LABEL` / `PROVIDER_DEFAULT_MODEL` / `PROVIDER_API_KEY_PLACEHOLDER` に gemini 行、説明文更新。
- **理由:** AC-2（/admin/speech で選択・既定モデル自動セット）。

### 7. 回帰テスト（adapter 境界 + registry ディスパッチ）
- **対象ファイル:** `app/core/adapters/gemini/__tests__/speechRecognitionProvider.test.ts`（新規）, `app/core/adapters/gemini/__tests__/speechConnectionPing.test.ts`（新規）, `app/core/adapters/speech/__tests__/registry.test.ts`（変更）
- **変更内容:** deepgram テストと対称に、fetch モックで 2xx(transcript)/**HTTP 400（未対応 mime 想定 → `throwForStatus` の汎用フォールスルー `mapper.unavailable` 経路 → `SpeechFailureError`。webm/opus 受理 NG が実際に露見するケース）**/401・403(quota)/429(rateLimit)/5xx(unavailable)/timeout(AbortError)/空音声(空 parts→"")/api キー空/サイズ超過/inlineData base64 送信形・`x-goog-api-key` ヘッダ・secret masking を検証。registry テストに `gemini → geminiSpeechAdapter` ディスパッチを追加。
- **理由:** AC-5。契約準拠の回帰。**ただし実フォーマット受理は検証しない**（fetch モックのため。AC-1 は実ファイル検証）。

### 8. 品質ゲート + 実ファイル受理検証（マージ前提条件）
- **対象:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`、続いて実 Gemini への実録音検証（下記「テスト方針」）。
- **変更内容:** ローカルサーバを起動し `ADMIN_SPEECH_PROVIDER=gemini` + 実 Gemini API キー + `gemini-2.5-flash` を設定。/admin/speech の接続テスト（probe 2xx）→ 実録音 **webm/opus**（＋できれば m4a）を audio 取り込み（録音 UI もしくは直接アップロード経路）し、文字起こし → 構造化 → プレビュー → ノート保存まで通す。env>db>stub と SecretBox（DB 保管経路）も確認。
- **AC-1 の合否判定（偽陽性の排除・P-001）:** `runIngestionJob.ts` の audio 経路は **configured provider の `SpeechFailureError` を握り潰して `""`（空 transcript）を返し**（実コード確認済み: `if (isSpeechFailureError(error)) return ""`）、degraded preview を組んでコミット可能にする。`callGeminiGenerate` は webm 拒否の 400 を `mapper.unavailable → SpeechFailureError` にマップするため、**Gemini が webm を 4xx 拒否してもノート保存は空 transcript で「成功」してしまう**。よって **「ノートが保存できた＝受理 OK」は禁止条件**。AC-1 の合否は必ず **adapter／ネットワーク層で実 Gemini が 2xx + 非空 transcript を返したことを直接確認**して判定する（DevTools Network で `generateContent` のステータスとレスポンス本文を見る、または adapter に一時ログを仕込んで 2xx + transcript 文字列を確認、もしくはテスト方針 6 の「adapter を実 Gemini に直当てして 2xx + transcript」を主手段にする）。
- **理由:** AC-1/AC-3/AC-4。**`pnpm test` の通過は契約準拠のみ。実フォーマット受理は本ステップでしか確認できない（非交渉）。**

### 9. 分岐判断（受理 OK / NG）
- 受理 OK → ステップ 10（spec/ADR を Accepted 更新）へ進みマージ。
- 受理 NG（webm/opus が 4xx 等で拒否）→ ステップ 1〜7+8 のコミットを `git revert`。`.issue/766/adr.md` ADR-003 に **拒否された mime / status / エラーメッセージ**を追記し、`.issue/738` ADR-002 を **Proposed → Accepted へ更新（NG 結果＝先送り妥当性の確定を記録）**。spec/adr/013 と adminSettings.md は **変更しない**。Issue は「先送り（結果記録済み）」で close。

### 10. spec / ADR 更新（受理 OK 時のみ・別コミット）
- **対象ファイル:** `spec/adr/013-speech-provider.md`, `spec/domains/adminSettings.md`, `.issue/766/adr.md`, `.issue/738/adr.md`
- **変更内容:** spec/adr/013 の追記節に Gemini を追加（`SPEECH_PROVIDERS = ["openai","deepgram","gemini"]`、Gemini は `generateContent` inlineData base64・probe は最小 generateContent・default-model `gemini-2.5-flash`）。adminSettings.md の `SpeechProvider` 列挙・default-model 対応・connectionTester 節を Gemini 反映。`.issue/766/adr.md` の ADR-001〜003 を Accepted、`.issue/738` ADR-002 を **Superseded by #766** に更新。
- **理由:** AC-6。

## 設計判断

詳細は `.issue/766/adr.md`。

- **ADR-001:** Gemini speech は `generateContent` + `inlineData`(base64) で、既存 `callGeminiGenerate` を流用（全カテゴリ → `SpeechFailureError` の `speechErrorMapper`）。独自 fetch を書かず ocr/pdf と対称。mime allowlist なし・サイズガードのみ。
- **ADR-002:** probe は既存 `pingGemini`（最小 generateContent、認証 + model 存在）を流用。speech 専用 probe を作らない。
- **ADR-003:** webm/opus 受理リスク → implement-then-verify。コード差分は独立コミット化し、実ファイル検証 NG なら原子的 revert。検証結果を ADR に記録。
- **`.issue/738` ADR-002** は受理 OK で Superseded、NG で Accepted 据え置き。

## リスクと注意点

- **webm/opus 受理不可リスク（最大）:** Gemini の inlineData 明示対応に webm/opus が無い。NG なら revert 前提。録音 UI 既定が webm/opus のため、受理可否がそのままマージ可否。
- **長尺音声の末尾欠落:** 文字起こしを LLM 推論で行うため `maxTokens`(16384) 上限で末尾が切れうる。既知の制約として spec に記す。録音 UI 側の長さ上限（spec/adr/013 影響節）と併せて運用。
- **二重リストドリフト:** `SPEECH_PROVIDERS`(domain) と `SPEECH_PROVIDERS_TRANSPORT`(transport)、default-model の 2 箇所（valueObject コメント / UI Record）を**原子的に**更新しないと fail-fast / モデル既定欠落。
- **probe とフォーマット受理の乖離:** probe（テキスト ping）が通っても音声受理は保証しない。AC-1 の実ファイル検証で必ず担保する。
- **E2E フルパスの偽陽性（P-001）:** `runIngestionJob` の audio 経路は configured provider の `SpeechFailureError` を握り潰して空 transcript で「成功」扱いするため、Gemini の 4xx 拒否がノート保存成功に化けうる。AC-1 は「ノート保存成功」ではなく **adapter／ネットワーク層の 2xx + 非空 transcript** で判定する（ステップ8・テスト方針参照）。
- **検証用録音の用意:** agent-browser は実マイク録音が困難。実録音ファイルの準備手段を「テスト方針」に明記。

## テスト方針

- **回帰（自動・`pnpm test`）:** ステップ 7。deepgram speech テストと対称に 2xx/**HTTP 400（未対応 mime 想定 → unavailable 経路 → `SpeechFailureError`）**/401・403/429/5xx/timeout/空音声/api キー空/サイズ超過/base64 送信形/`x-goog-api-key`/masking、registry ディスパッチを fetch モックで網羅。契約準拠のみを見る（フォーマット受理は見ない）。
- **実ファイル受理検証（手動・マージ前提条件・非交渉）:**
  1. 検証用録音の用意 — 実ブラウザの録音 UI で **webm/opus** を 1 本録音（数秒の日本語発話）。可能なら `ffmpeg` 等で同音声の **m4a(audio/mp4, AAC)** も用意。両方を確保できない場合は最低限 webm/opus を必須とする。
  2. 環境変数: `ADMIN_SPEECH_PROVIDER=gemini` / `ADMIN_SPEECH_API_KEY=<実キー>` / `ADMIN_SPEECH_MODEL=gemini-2.5-flash` でローカルサーバ起動（`pnpm dev`、空きポート）。
  3. /admin/speech で接続テスト → probe が 2xx（AC-2）。
  4. audio 取り込みフルパス: 録音 UI もしくは audio アップロード経路で webm/opus を投入 → 構造化 → プレビュー → ノート保存（AC-3）。m4a があれば同様に確認。
     - **【偽陽性の排除・P-001】AC-1（受理可否）の合否は「ノート保存が成功したか」では判定しない。** `runIngestionJob` は configured provider の `SpeechFailureError` を握り潰して空 transcript で「成功」扱いするため、Gemini が webm を 4xx 拒否してもノートは保存できてしまう。AC-1 は **adapter／ネットワーク層で実 Gemini が 2xx + 非空 transcript を返したこと**を直接確認して判定する（DevTools Network で `generateContent` のステータス／本文を見る、または adapter に一時ログで 2xx + transcript 文字列を確認、または下記 6 の adapter 直当てを主手段にする）。空 transcript でノートが保存できた場合は「受理 NG（無発話と取り違え）」を疑い、必ず HTTP ステータスを確認する。
  5. フォールバック/暗号化（AC-4）: env 経路（上記）に加え、DB 保管経路（/admin/speech から API キー保存 → SecretBox 暗号化 → env 未設定で consumer が DB 復号して使用）と、未設定時の Stub フォールバックを確認。
  6. manual-test スキル: /admin/speech の画面操作（プロバイダ選択・既定モデル自動セット・接続テスト結果表示）は agent-browser で自動検証可能。**実音声の Gemini 受理判定だけは実録音 + 実キーが要るため手動**（agent-browser はマイク録音不可）。**AC-1 の偽陽性を排除する主手段として推奨**: 録音 UI で生成した webm/opus バイト列を `GeminiSpeechRecognitionProvider.transcribe` に直接渡し、実 Gemini が **2xx を返し非空 transcript 文字列を得る**ことを adapter 層で直接確認する（フルパス経由だと `runIngestionJob` の握り潰しで 4xx 拒否が空 transcript の「成功」に化けるため、ここでの 2xx + transcript 直接確認を合否の根拠にする）。
- **分岐:** 受理 OK → spec/ADR 更新してマージ。NG → revert + ADR に結果記録（ステップ 9）。

## レビュー履歴

### 1周目
**修正した点**:
- arch-risk P-001（E2E フルパスの偽陽性）: `runIngestionJob` が configured provider の `SpeechFailureError` を握り潰して空 transcript で「成功」扱いする挙動を実コードで確認。AC-1 の合否を「ノート保存成功」ではなく **adapter／ネットワーク層で実 Gemini の 2xx + 非空 transcript を直接確認**する手順に書き換え（ステップ8・リスク・テスト方針 4/6）。「ノート保存成功＝受理 OK」を禁止条件として明記。
- arch-risk P-002（base64 インフレ）: raw 20MiB ガードは base64 後（約 27MB）に Gemini の総リクエスト 20MB 上限を超える穴になるため、**base64 後の総サイズで評価**（または raw 約 14MiB）に修正（ADR-001・ステップ3・アダプター節）。
- coverage P-001（AC-2 トレーサビリティ）: AC-2 の対応ステップに登録ステップ（barrel=4 / registry=5）を補い `1,2,3,4,5,6,7` に修正。表と本文の矛盾を解消。

**取り込んだ改善提案**:
- coverage S-001 / arch-risk S-001（Gemini 既定モデルの根拠・SDK 表現）: LLM フォームの例示既定が `gemini-1.5-pro` であることを実コードで確認し、「LLM 既定と揃える」根拠を「文字起こし用途として妥当な現行 `gemini-2.5-flash` を独立に選定」に書き直し。本文の「Gemini SDK 配線」を実体（REST `fetch`）に合わせ「REST `fetch` 配線」に修正。
- coverage S-002（HTTP 400 明示）: ステップ7・テスト方針の回帰列挙に「HTTP 400（未対応 mime 想定 → unavailable 経路 → `SpeechFailureError`）」を 401/403・429 と別ケースで追加。
- coverage S-003 / arch-risk S-002（ADR Status 表現統一）: ステップ9 の `.issue/738` ADR-002 を「Accepted 据え置き」から「Proposed → Accepted へ更新（NG 結果を記録）」に統一（766-ADR-004 と一致）。ADR-002（本 Issue probe）の「空 model は pingGemini 内で ok:false」を実装に合わせ「空 model は VO（`SpeechRecognitionConfig.create`）が保証。probe には未ガードで到達せず、仮に到達しても 404 で ok:false」に訂正。
- arch-risk S-003（コンストラクタ既定の明文化）: `SpeechAdapterConfig` が `{apiKey, model}` のみで timeout/maxTokens を受け取れないため、`GeminiSpeechRecognitionProvider` コンストラクタで既定（timeout 120s / maxTokens 16384）を内部設定する責務をアダプター節・ステップ3に明記。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。
