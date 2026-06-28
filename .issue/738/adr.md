# ADR — Issue #738: 追加の文字起こしプロバイダを registry に対応

## ADR-001: 2 本目のプロバイダは Deepgram Nova-3 を REST 直送（raw body + Token 認証）で実装する

### Status
Proposed（Status 遷移: PoC で raw-body fetch + webm/opus 2xx を確認できたら Accepted、実装着手はその後。PoC → ADR-001 Accepted → 実装の順で進め、raw-body fetch 不成立時の手戻りリスクを PoC 段階に閉じ込める）

### Context
#701（ADR-013）で文字起こし registry と OpenAI `gpt-4o-transcribe` を実装済み。Issue #738 は「最低 1 本・優先 Deepgram Nova-3」を求める。Deepgram の prerecorded API は OpenAI の multipart/form-data とは異なり、`POST https://api.deepgram.com/v1/listen?model=nova-3&language=ja&smart_format=true` に **raw audio bytes を直接 body** として送り、`Authorization: Token <key>` で認証する。レスポンスは `results.channels[0].alternatives[0].transcript` に文字起こしを持つ。

接続テスト probe について、OpenAI は `GET /models/{model}` で「key 有効」+「model 存在」を一度に確認できたが、Deepgram には同等のモデル取得エンドポイントが無い。

### Decision
- Deepgram adapter を `app/core/adapters/deepgram/` に新設し、OpenAI adapter に**対称**な構造（`speechRecognitionProvider.ts` / `speechConnectionPing.ts` / `index.ts` の `deepgramSpeechAdapter satisfies SpeechAdapter`）で実装する。
- `transcribe` は raw ArrayBuffer body を `Content-Type: <mime>` で直送する。multipart 構築（FormData）は不要。
- port 契約を厳守: `SpeechFailureError` のみ throw、空発話（transcript 空・欠落）は `""` を返す、workerd の AbortError（DOMException 二重判定）を timeout として扱う。
- probe は実音声を送らず（ADR-006 踏襲）、Deepgram の認証確認用軽量エンドポイント（`GET https://api.deepgram.com/v1/projects` など）で **2xx を疎通成功と定義する**（接続テストの合否条件）。**model 存在の事前確認は probe では行わない**（Deepgram には OpenAI の `GET /models/{model}` 相当が無いため。誤った model 名は実 transcribe 時の 4xx で判明する）。具体エンドポイントは PoC で 2xx を確認して確定する。

### PoC で確認する項目（実装前）
- Cloudflare Workers（workerd）の `fetch` で **ArrayBuffer body 直送**（`body: input.audioBytes`）が動くか。`SpeechTranscribeInput.audioBytes` は `ArrayBuffer`（port 定義）で、workerd の `fetch` は `BodyInit` として `ArrayBuffer` / `Blob` を受ける。raw 直送は multipart より単純。
- **録音 UI 標準の webm/opus（`Content-Type: audio/webm;codecs=opus`）で Deepgram prerecorded が 2xx を返すか**。Deepgram は webm/opus を受理する想定だが、Gemini で警戒している webm/opus 受理リスクを Deepgram でも取りこぼさないよう明示的に確認する。
- 認証確認用 probe エンドポイント（`GET /v1/projects` 等）が 2xx を返すか（接続テスト成功条件の確定）。

### Consequences
- 良い点: #701 の registry / DI / ConnectionTester が完全に generic なため、ドメイン union 1 値・registry 1 行・adapter ディレクトリ・UI ラベルの差分追加だけで Deepgram が通る。OpenAI と対称な実装・テストで保守負荷が低い。
- トレードオフ: probe が「model 存在」まで保証しないため、接続テスト成功でも誤 model 名は実取り込みまで露見しない。Deepgram の probe エンドポイント選定が API 変更に晒される（OpenAI の `/models/{model}` ほど安定的でない可能性）。
- 注意: Cloudflare Workers の raw-body `fetch`（ArrayBuffer 直送）は実装前に PoC で確認する（ADR-013 が multipart で同種注意を記載済み。raw body は multipart より単純）。

---

## ADR-002: Gemini audio は本 Issue では見送る

### Status
Superseded by #766（#766 で Gemini audio を `generateContent` + `inlineData` base64 投入として実装し、`speechProviderRegistry` に登録済み。本 ADR が要求した「webm/opus・m4a 受理の実ファイル検証を前提に別 Issue」は #766 が消化した）。ただし**録音 UI 既定の webm/opus 受理可否は staging で検証中・未確定**（#766 AC-1 / `.issue/766/adr.md` ADR-003）。staging で受理 NG が確定した場合は #766 の実装が revert され、本 ADR-002 は Accepted（先送り妥当）へ差し戻される。

### Context
#701 調査メモ・ADR-013 の推奨順は OpenAI > Deepgram > Gemini audio > Google Cloud STT v2。Gemini は既存 LLM が Gemini 系のとき API 統一の魅力があるが、ブラウザ録音の中心フォーマット **webm/opus・m4a のネイティブ対応が不確実**で、採用には実ファイル PoC が必須（#701 残課題）。録音 UI は webm/opus を標準出力するため、受理不能だと録音経路で詰まる。

### Decision
本 Issue では Gemini audio を実装しない。Issue 要件「最低 1 本・優先 Deepgram」は Deepgram 単独で満たす。Gemini 採用は webm/opus・m4a 受理可否の PoC を前提に別 Issue とする。

### Consequences
- 良い点: フォーマット対応の確実性を優先でき、録音経路の回帰リスクを負わない。スコープが Deepgram に集約され PR が小さくなる。
- トレードオフ: LLM（Gemini 系）と文字起こしの API 系統が分かれたままになる（ADR-013 が既に受容済みの帰結）。

---

## ADR-003: Cloudflare Workers AI 経由（env.AI バインディング）は本 Issue のスコープ外とする

### Status
Proposed

### Context
Deepgram Nova-3 / OpenAI gpt-4o-transcribe は Cloudflare Workers AI パートナーモデルとして `env.AI` バインディング経由でも呼べる（API キー管理を Cloudflare 側に寄せられる）。#701 は REST のみ実装し Workers AI 経由を後続見送りとした（ADR-013 検討済み代替案）。Workers AI 経由を入れる場合、`SpeechAdapter.create` が REST と AI バインディングの両方を provider 単位で選べる構造にするか、provider を別エントリ（例 `deepgram-workers-ai`）にするかの設計判断を要する。

### Decision
本 Issue は **REST 直送のみ**を実装し、Workers AI 経由は入れない。設計選択肢を以下に整理し、別 Issue へ送る:
- **案 A（create 分岐）**: `SpeechAdapterConfig` に transport 軸（rest | workers-ai）を足し、`create` 内で分岐。registry の provider 集合は据え置き。env.AI バインディングは DI が渡す必要があり、`SpeechAdapterConfig`（現状 `{apiKey, model}`）の拡張と DI 配線の追加を要する。
- **案 B（別エントリ）**: `deepgram-workers-ai` を別 `SpeechProvider` として registry に登録。provider 集合が増えるが create シグネチャは単純なまま。ただし env.AI バインディングを adapter に渡す口が必要。
- いずれも `SpeechAdapterConfig` が `apiKey/model` だけで足りなくなる（AI バインディング参照が要る）ため、#701 の registry 契約に手を入れる影響が大きい。第一段は REST 対称実装でコストと回帰リスクを抑える。

### Consequences
- 良い点: #701 の `SpeechAdapter` / `SpeechAdapterConfig` 契約を変えずに済み、registry の単純さを保てる。OpenAI との対称性が維持される。
- トレードオフ: API キーを Cloudflare 側へ寄せる運用最適化は得られない（後続最適化に回す）。
- 引き継ぎ: Workers AI 経由を採用する際は案 A/B の決定と `SpeechAdapterConfig` 拡張・DI への env.AI 配線を伴う独立 Issue とする。

---

## ADR-004: 実装時の非自明な判断（#738 実装で確定）

### Status
Accepted（実装で確定）

### 判断 1: Deepgram エラーボディのフィールド名は防御的に複数候補を読む
Deepgram の非 2xx ボディのフィールド名（`err_msg` / `message` / `reason`）は API 仕様で確証が持てなかったため、`err_msg` を最優先に `message` / `reason` をフォールバックで読む防御的実装とした。どれも文字列でなければ `HTTP <status>` のみにフォールバックする（OpenAI adapter の `error.message` 単一読みと同じく、抽出できなくても status は必ず残る）。OpenAI 側の非 2xx 詳細抽出と対称に `sanitizeErrorReason`（categorize + masking）を通す。

### 判断 2: 「api キー漏洩防止」テストは `sk-` プレフィックストークンで検証する
共有の `maskSecrets` は `sk-` / `AIza` プレフィックスのトークンをマスクするが、Deepgram キー（`dg-` 等）専用のマスキングパターンは持たない（プレフィックス追加は #738 のスコープ外）。実 transcribe で adapter に渡す api キー自体はエラーメッセージに echo されない（メッセージはレスポンスボディ由来）ため漏洩経路は無い。漏洩防止テストは「レスポンスボディ中の secret 様トークンがマスクされる」ことを検証する趣旨なので、OpenAI テストと対称に `sk-` プレフィックストークンで検証する。Deepgram 専用プレフィックスのマスキング追加が必要になれば別 Issue とする。

### 判断 3: probe（`/v1/projects`）は空 model を `ok:false` とする
plan.md ステップ 6 / [S-002] の確定どおり、Deepgram probe は `cfg.model` を URL に使わないが、OpenAI probe との UX 対称性のため空 model を `ok:false`（reason: `"model is empty"`）でガードした。

---
