# Plan Review — Issue #701（Round 1: アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/701/plan.md` / `.issue/701/adr.md`
視点: あるべきアーキテクチャとの整合・実現可能性・リスク

---

#### 問題点（要修正）

- **[P-001]** AC-6 の失敗縮退設計が `runPipeline` の実フローと噛み合っていない（空テキストが LLM に流れる経路の見落とし）
  - 理由: `runPipeline`（`runIngestionJob.ts` 261-371行）では `kind === "audio"` は html/markdown のいずれでもないため **`else` ブロックの LLM 構造化パス**に入る。plan / ADR-005 は「`extractText` で `SpeechFailureError` を空文字に縮退 → preview 生成」と書くが、空文字 `text=""` はそのまま `deps.llm.structureToHtml({ rawText: "" })` に渡る。つまり「文字起こし失敗（空文字）」のケースでも LLM 呼び出しが走り、(a) 無駄な課金、(b) LLM 側の失敗で再び `markFailed` され AC-6 が崩れる、(c) consumer パスで LLM が Stub のままだと空入力に対する Stub 挙動次第で結果が不定、というリスクがある。plan/ADR は「`extractText` で空文字に縮退すれば preview に到達する」と単純化しているが、audio 分岐は OCR/image と違い後段で必ず LLM を通る点が考慮されていない。
  - 提案: ADR-005 の決定を「audio かつ transcript が空（=失敗 or 無音）のとき LLM 構造化をスキップし、`fallbackTitle` + 空 `ContentHtml` で preview を生成する」まで踏み込んで明記する。`runPipeline` 内で「transcript が空のときの early-return / 分岐」を設計ステップに含め、空文字が `structureToHtml` に流れないことをテスト方針（AC-6 テスト）の検証項目に加える。少なくとも「空入力で LLM を呼ばない」か「呼んでも失敗を再 `markFailed` させない」かのどちらを採るかを ADR で確定させる。

- **[P-002]** `ContentHtml.create("")`（空本文）が VO 不変条件を通るか未検証
  - 理由: AC-6 縮退は最終的に `IngestionPreview.create({ contentHtml: ContentHtml.create(html), ... })` を空〜最小 HTML で呼ぶ。plan は「空〜最小の本文 HTML」と書くが、`ContentHtml` VO が空文字を許容するかを確認していない。もし空を弾く不変条件があると、縮退パス自体が VO 構築で throw し、`markFailed` に落ちて AC-6 が成立しない。これは縮退設計の前提となる検証なので、計画段階で潰しておくべき。
  - 提案: `ContentHtml.create` と `NoteTitle.create` の空/最小入力の許容を調査ステップに追加し、空を弾くなら「失敗注記を含む最小 HTML（例 `<p data-ingestion-failed>...</p>`）を生成する」方針に切り替える。ADR-005 の「注記方式 vs フラグ方式」の比較に、この VO 制約を判断材料として追記する。

#### 改善提案（検討推奨）

- **[S-001]** consumer パスの env binding 拡張の波及範囲が過小評価されている
  - 理由: ステップ10 は `ADMIN_SPEECH_*` を `RequestServerConfig` / `ServerEnv` / `readRequestServerConfig` に追加とするが、`ServerEnv` 型は `wrangler.toml` のバインディング定義・`app/server.cloudflare.ts` のエントリ・各 worker エントリ（relay/consumer/pruner/dlq）の env 型と連動する。LLM の `ADMIN_LLM_*` がどこで型定義されているかを調査ステップに含め、追加箇所を網羅列挙しておくと実装漏れ（特に consumer worker 側で speech env が読めない）を防げる。
  - （`resolveConsumerSpeechConfig` は LLM と異なり apiKey 解決の `env>db>復号フォールバック`に加えて「DB ciphertext 復号失敗時に Stub に縮退」する分岐も対称に必要。plan には書かれているが、`readInstanceSettingsLlmRow` の speech 版 select の追加（960行付近）も忘れずに）

- **[S-002]** OpenAI multipart の Cloudflare Workers 実現可能性が「PoC 必須」のままリスク欄に残っている
  - 理由: `messagesClient.ts` は Chat Completions（JSON body）専用で、`/audio/transcriptions` の `FormData` + `Blob` 送信は既存資産を流用できない（URL 合成・secret masking のみ流用可）。Workers の `fetch` は `FormData` body を受け付けるが、`audioBytes: ArrayBuffer` → `Blob`（mime 付き）→ `FormData` の構築と、`Content-Type: multipart/form-data; boundary=...` を**手で設定しない**（fetch に任せる）点が要注意。リスク欄に挙がっているが、実装ステップ6の最初に「最小 PoC（実音声 1 本で Workers 上 200 応答確認）を `pnpm dev` で実施」を明示タスク化すると、ステップ依存の手戻りを防げる。設計判断としては問題なし。

- **[S-003]** `getInstanceSettings` DTO / `view.ts` の speech 拡張が「確認・拡張」止まり
  - 理由: `view.ts` の `maskApiKey(cfg: LLMConfig)` は `LLMConfig` 型に密結合（53行）。speech の apiKey マスク表示にはこの関数を speech 用に再利用できず、`maskApiKey` を `{ apiKeySource, apiKeyCiphertext }` の構造型に汎用化するか speech 版を別途用意する判断が要る。`toInstanceSettingsDTO` / `InstanceSettingsDTO` 型 / `AdminSettingsEnv` の env overlay も speech 用に拡張が要る。ステップ13 の DTO 拡張を「`maskApiKey` の汎用化 or speech 版」「DTO 型に speech フィールド」「env overlay の speech 版」まで分解しておくと、ADR-003（独立 VO + 対称関数）と一貫した粒度になる。

- **[S-004]** `model` フィールドの扱いが ADR-003 と DB スキーマで微妙に非対称
  - 理由: VO（ステップ2）は `model: string`（1..120）を持つ一方、DB（ADR-004）は `speech_model TEXT`（nullable, 既存行救済）で `reconstruct` の `coerceSpeech` が NULL→default 補完する。これ自体は `maxNoteRevisionsPerNote` の先例と一貫し妥当。ただし `defaultSpeech()` の `model: 'gpt-4o-transcribe'` を「ドメイン既定」として持つ以上、`SPEECH_PROVIDERS = ["openai"]` と `model` 既定値の対応（provider 追加時にモデル既定も増える）を INVARIANT コメントに含めると将来の拡張時に齟齬が出にくい。スコープ内の軽微な改善。

- **[S-005]** registry の value-cycle 回避と barrel 配置の具体が曖昧
  - 理由: ADR-002 / ステップ8 は「barrel `app/core/adapters/openai/speechIndex.ts`（または `index.ts` に追加）」と two-way に書く。既存 `openai/index.ts` は `openaiAdapter satisfies ProviderAdapter`（LLM registry 用）を export 済みで、`import type { ProviderAdapter } from "../llm/registry"` のみ依存して value cycle を避けている。speech adapter を**同じ `index.ts` に足すと** `import type { SpeechAdapter } from "../speech/registry"` を追加するだけで対称に保てる（型のみ依存なので cycle なし）。別ファイル `speechIndex.ts` に分けるか `index.ts` に集約するかを ADR で確定させ、「型のみ依存を維持」を明記しておくと実装者が迷わない。設計の向き自体は正しい。

#### 良い点

- 実装ステップが**依存方向の内→外**（errorCode → VO → service → entity → pipeline → adapter → registry → port/tester → DI → repository → schema → usecase → UI → spec）で正しく並んでおり、ヘキサゴナルの依存規約に沿っている。
- ドメインから設計が起こされている。`SpeechRecognitionConfig` を `LLMConfig` の汎用化ではなく**独立 VO + 対称サービス関数**とする ADR-003 の判断は、`AdminSettingsService` の `LLMConfig` 密結合（型注釈・baseURL 不変条件）を正しく読んだうえでの妥当な選択。抽象化による結合より重複を許容する判断は本リポジトリの「illegal state を型で排除」「読みやすさ優先」の原則と一致する。
- registry を LLM と分離する ADR-002 が、`LLMProvider`（anthropic/openai/gemini）と `SpeechProvider`（openai のみ）のキー集合・ポート集合の違いを正しく根拠にしている。`Record<SpeechProvider, SpeechAdapter>` のコンパイル時網羅・barrel の型のみ依存も既存パターンを正確に踏襲。
- 既存パイプライン（`detectKind` の audio 分類・`uploadFile`・`commitIngestionPreview` の `MediaAsset(kind='source')` 保存）が配線済みである点を調査で確認し、AC-5・録音 UI を「バックエンド変更なしで既存 `uploadFileFn` に合流」（ADR-007）させる判断は、Issue の「変更最小」「録音専用経路を作らない」方針に忠実でスコープを超えていない。
- 接続テストを transcribe ではなく `GET /models` 系の軽量 probe にする ADR-006、locale を当面 `ja-JP` 固定（ポートの `locale` は素通し）とするスコープ限定、`UserSpeechOverride` を構造意識のみで非実装とする判断は、いずれも Issue スコープに正しく収まっており理想形を追いすぎていない。
- RSC side-effect import 漏れ（`admin/route.tsx` への `SpeechSettingsForm/action` 追加）をリスク欄に明示しており、`ADMIN_NAV` / `AdminNavItem['to']` union / side-effect import 群の3点セット更新（ステップ14）も既存構造を正確に把握できている。
