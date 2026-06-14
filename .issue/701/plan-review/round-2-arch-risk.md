# Plan Review — Issue #701（Round 2: アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/701/plan.md` / `.issue/701/adr.md`
視点: あるべきアーキテクチャとの整合・実現可能性・リスク
前提: Round 1 の P-001 / P-002 / S-001〜S-005 はすべて反映済み（plan 末尾「レビュー履歴」記載）。本 Round は反映内容の実コード整合と新規見落としの確認。

---

## Round 1 反映内容の実コード照合（検証結果）

すべて実コードと整合していることを確認した。

- **AC-6 失敗縮退（P-001 / P-002 / ADR-005）**: `runIngestionJob.ts` の `runPipeline`（278-326 行）が `html` / `markdown` / `else` の 3 分岐で、`audio` は `else`＝`structureToHtml` 必須経路を通ることを確認（plan の前提どおり）。ADR-005 の VO 前提も実コードで全て裏取り済み:
  - `ContentHtml.create("")` は空文字許容（`note/valueObject.ts` 148-159 行、1MiB 上限のみ検査）。✓
  - `NoteTitle.create("")` は `TitleEmpty` を throw（同 101-117 行）だが、`runPipeline` 357-362 行の `titleSuggestion.trim().length > 0 ? … : fallbackTitle(...)` ガードで安全。`fallbackTitle` は最悪 `"Untitled"`（522-526 行）。✓
  - サニタイザ `GLOBAL_ATTRS`（`htmlSanitizer.ts` 138-145 行）は `class` 許可・`data-internal-link` 以外の `data-*` は剥がす。→「`class="ingestion-failure-note"` を使い、固定定数はサニタイザ非経由で `ContentHtml.create` へ直接」という ADR-005 の判断は正しい。✓
- **barrel 配置（S-005 / ADR-002, ステップ8）**: `openai/index.ts` は `openaiAdapter satisfies ProviderAdapter` を `import type { ProviderAdapter } from "../llm/registry"` の型のみ依存で export。`llm/registry.ts` は `openai` から value import（registry → adapter の一方向）。plan の「`import type { SpeechAdapter }` を 1 行足して同ファイルに `openaiSpeechAdapter` を追加・型のみ依存維持」は既存パターンと完全一致。✓
- **multipart PoC（S-002, ステップ6）**: `messagesClient.ts` は Chat Completions（`content-type: application/json` / `JSON.stringify`、189-266 行）専用で multipart には流用不可。流用できるのは `buildChatCompletionsURL` 系の URL 合成と `maskSecrets`（`sanitizeErrorReason`）のみ、という plan の記述が正確。✓
- **ADMIN_SPEECH_* env 波及（S-001, ステップ10）**: `ADMIN_LLM_*` の定義箇所が plan の行番号どおり実在（`ServerEnv` 235-245 行 / `RequestServerConfig` 147-168 行 / `readRequestServerConfig` 357-360 行 / `resolveConsumerLlmConfig` 883 行 / `readInstanceSettingsLlmRow` 960 行 / consumer 復号失敗時の Stub 縮退 916-936 行）。`StubSpeechRecognitionProvider` ハードコードも 645 行で確認。consumer override は `createConsumerContainer`（779-830 行）で `…requestContainer, …overrides` スプレッドにより `speechRecognitionProvider` を上書きできる構造。✓

依存方向（presentation → application → domain、adapter は port 実装）・検証 2 点境界・registry のコンパイル時網羅・env>db>stub フォールバック いずれも本リポジトリの規約に沿っている。

---

#### 問題点（要修正）

- **[P-001]** 未設定時 Stub フォールバックは `SpeechFailureError` ではなく `BusinessRuleError('unsupported_format')` を投げるため、ADR-005 の縮退分岐に乗らない（catch 漏れ）
  - 理由: `StubSpeechRecognitionProvider.transcribe` は `BusinessRuleError(IngestionErrorCode.UnsupportedFormat, "speech_recognition_not_implemented_in_mvp")` を throw する（`app/core/adapters/stub/speechRecognitionProvider.ts`）。一方 ADR-005 / ステップ5 は `extractText` の `case "audio"` で **`SpeechFailureError` のみ** を catch して空文字に縮退する設計。env キー未設定かつ DB 未設定で `resolveConsumerSpeechConfig` が `null` を返すと（LLM 側 939-941 行と同じく）request 側の Stub がそのまま使われ、`UnsupportedFormat` が catch を素通りして `classifyPipelineError`（`isBusinessRuleError(error) → error.code` = `"unsupported_format"`、540 行）→ `markFailed` に落ちる。これは「未設定＝機能未提供で fail」という挙動として一応筋は通るが、**ADR-005 の「audio の文字起こし失敗は常に縮退 preview に到達」という観測可能文（AC-6）と矛盾しうる境界**で、plan/ADR がこの分岐を明示していない。AC-6 のテスト（「fake speech が `SpeechFailureError` を投げる」）はこの Stub 経路を踏まないため、実運用の「Speech 未設定で音声をアップロード」したときに preview ではなく failed になる挙動が無検証のまま残る。
  - 提案: ADR-005 または ステップ5 に「Speech **未設定**（Stub フォールバック）時の audio は ADR-005 の縮退対象に含めるか／`unsupported_format` で `markFailed` のままにするか」を一文で確定する。前者なら `extractText` の audio catch を `SpeechFailureError` に加えて Stub の `BusinessRuleError('unsupported_format')` も縮退対象に含める（または Stub を `SpeechFailureError` を投げる実装に寄せる）。後者なら「未設定時は従来どおり `markFailed`、縮退は『設定済みプロバイダの transcribe 失敗』に限る」と AC-6 のスコープを明記し、テスト方針に Stub 経路の期待挙動（`markFailed` で `previewing` に到達しない）を 1 ケース追加する。どちらでも可だが、どちらかに確定しておかないと実装者が catch 対象を誤る。

#### 改善提案（検討推奨）

- **[S-001]** ステップ10 の対象ファイルに `app/core/application/di/env.ts` が挙がっているが、`ADMIN_LLM_*` はここには存在せず全て `serverCloudflare.ts` で定義されている
  - 理由: `env.ts` を grep しても `ADMIN_*` 参照は 0 件。`ADMIN_SPEECH_*` の追加は `serverCloudflare.ts`（および `wrangler.toml` / `types.ts`）に閉じる。ステップ10 の対象ファイルに `env.ts` を残すと「env.ts にも何か足すのか」と実装者が探索する無駄が生じる。`env.ts` を対象から外すか、「（env.ts は LLM env 非関与・変更不要。boot 時 env validation を追加する場合のみ触れる）」と注記すると迷いが消える。Round 1 の S-001 で列挙された実体（serverCloudflare.ts 各所）は正確なので、本件は対象リストの軽微な過剰のみ。

- **[S-002]** `suggestMetadata` が if/else の外（全 kind 共通、335-338 行）にある点を、縮退分岐の構造変更として明示しておくと実装漏れを防げる
  - 理由: 現状の `runPipeline` は if/else（html/markdown/else）を抜けた後、335 行で `deps.llm.suggestMetadata({ html })` を **kind 非依存で必ず呼ぶ**。ADR-005 は「`structureToHtml` / `suggestMetadata` をスキップ」と正しく書いているが、`suggestMetadata` は `structureToHtml`（else 内）と違って共通経路にあるため、単純に else をスキップするだけでは `suggestMetadata` が残る。縮退分岐は「if/else の前で early-return 相当に preview を組み立て、335-355 行の metadata/タグ解決も通さない」構造にする必要がある。plan のテスト方針は「`suggestMetadata` が呼ばれない（spy 0 回）」を検証項目に入れており意図は担保されているが、ステップ5 の本文に「`suggestMetadata` は if/else 外の共通経路なので、縮退は `runPipeline` 早期で preview を return して metadata ブロック自体を回避する」と一文添えると、実装者が「else だけスキップして metadata が漏れる」ミスを避けられる。設計判断は正しい。

#### 良い点

- Round 1 の P-001 / P-002（AC-6 縮退の実フロー不整合・VO 許容性）が、実コードの行番号・VO 検証つきで ADR-005 に確定反映されている。`audio` が `else`＝LLM 必須経路を通る事実、`ContentHtml.create("")` 許容、`NoteTitle` の `fallbackTitle` ガード、サニタイザの `class` 許可／`data-*` 剥がし いずれも本レビューで再確認して一致。両論併記から「LLM スキップ＋固定注記 HTML（サニタイザ非経由）＋ VO 不変」へ踏み込んだ決定は妥当で実現可能。
- S-005（barrel 配置）の確定が既存 `openai/index.ts` + `llm/registry.ts` の型のみ依存パターンと正確に対称。新規 `speechIndex.ts` を作らず 1 ファイルに集約しつつ value cycle を回避する判断は、発見性と非循環性を両立しており理にかなう。
- S-002（multipart PoC）を「ステップ6 の先頭タスク・`pnpm dev` で実音声 200 確認」と工程化し、`messagesClient.ts` が JSON 専用で流用不可な点を明記。Workers 上 multipart という最大の実現可能性リスクを実装前に潰す段取りが正しい。
- S-001（env 波及）が `serverCloudflare.ts` の `ServerEnv` / `RequestServerConfig` / `readRequestServerConfig` / consumer 解決 / `readInstanceSettings*Row` / worker エントリ自動波及（`ConsumerEnv = ServerEnv` エイリアス）/ `wrangler.toml` まで行番号つきで網羅。`baseURL` 不要（ADR-003）も一貫。consumer 復号失敗時の Stub 縮退分岐も LLM 側 916-936 行と対称に意識されている。
- 実装ステップが依存方向の内→外で正しく並び、AC-5（録音 Blob の `MediaAsset` メタデータ欠落回帰）・AC-1 接続テスト境界（probe = モデル存在/認証まで、transcribe 実音声は AC-3/手動）・`UserSpeechOverride` 非実装・locale `ja-JP` 固定 など、スコープ限定が Issue と一致して理想を追いすぎていない。
