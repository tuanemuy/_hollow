# ADR — Issue #113: real OCR / PDF adapters (Anthropic)

## ADR-001: `AnthropicPDFExtractor` は `pageImages: []` / `textual: true` 固定で返す

### Status
Proposed

### Context

`PDFExtractor` port は `{ textual, text, pageImages }` を返す契約で、`runIngestionJob.extractText` は `textual && text.trim().length > 0` のとき素直に `text` を、それ以外のとき `pageImages` を OCR にループしてから合成する設計になっている (scanned PDF への OCR fallback)。

Anthropic Messages API は `document` content block で PDF を直接受け、内部で text 抽出 + visual reading を兼ねるため、textual / scanned の区別を adapter 層で持つ意味が薄い。ユーザー指示「ファイルを設定された LLM に投げるだけ」を踏まえ、scope を縮小する必要がある。

選択肢:
1. `textual: true` 固定で `pageImages: []` を返し、scanned 経路 (OCR fallback) を dead path 化
2. `text` の有無で `textual` を切り替え、空のとき `pageImages` に「LLM への原 PDF 投げ直し用」のダミー image を埋める
3. Port 契約を変更して `pageImages` フィールドを廃止する

### Decision

選択肢 1 を採用。`AnthropicPDFExtractor.extract` は常に `{ textual: true, text: <LLM 抽出文字列>, pageImages: [] }` を返す。

### Consequences

- 良い点:
  - usecase 側 (`runIngestionJob.ts`) のコード変更が不要
  - `pdfTextual` 分岐は `textual && text.length > 0` で素直に `text` を使い、Anthropic 1 リクエストで完結
  - port 契約を変更しないため、将来別の PDF adapter (pdf.js 等) を実装する場合の互換性が保たれる
- トレードオフ:
  - `pdfScanned` 分岐 (kind detector が現状 `application/pdf` を `pdfTextual` 固定で分類するため通常通らない) は `pageImages: []` で空 OCR ループに落ちる退化形を踏む — 実害なしの dead path
  - LLM が PDF から本当にテキストを抽出できなかったケース (例: 画像のみ PDF で LLM が "no text" と判断) でも `textual: true` を返すため、空文字 `text` が下流に渡る → `text.trim().length > 0` で空判定されて OCR fallback に落ちようとするが `pageImages: []` のため最終的に空文字での LLM structuring に進む。これはユーザー指示「LLM に投げるだけ」と整合
  - 後続 Issue で本物の PDF parser (pdf.js / pdfium 等) を入れる場合、textual / scanned の意味論を再設計する必要 (本実装の adapter とどう共存するか別途検討)

---

## ADR-002: 共通 `anthropicMessagesClient.ts` を新規追加するが、既存 `AnthropicLLMProvider` の helper 移行は本 Issue scope 外

### Status
Proposed

### Context

`AnthropicLLMProvider` に既に存在する `invoke()` / `throwForStatus()` / `parseJsonEnvelope()` のうち、HTTP fetch + AbortController + status → error class マッピングのロジックは port を問わず同型。本 Issue で OCR / PDF の 2 adapter を追加すると同じロジックが 3 箇所に分散することになる (`llmConnectionTester.ts` を含めると 4 箇所)。

選択肢:
1. 共通 helper を新規追加し、本 Issue で OCR / PDF だけ使う。既存 `AnthropicLLMProvider` は触らない (一時的に重複許容)
2. 共通 helper を新規追加し、本 Issue で `AnthropicLLMProvider` も helper 経由に移行
3. 共通化しない (3 ファイルで重複コピー)

### Decision

選択肢 1 を採用。

### Consequences

- 良い点:
  - 新規 OCR / PDF adapter は最初から共通 helper を使うため重複が増えない
  - 既存 `AnthropicLLMProvider` の挙動を本 Issue で壊すリスクがゼロ (リファクタによる回帰が分離される)
  - フォロー PR で `AnthropicLLMProvider` を helper に寄せるとき、本 Issue のレビューで helper の API contract が既に固まっているため安全に移行可能
- トレードオフ:
  - `llmProvider.ts` と OCR / PDF / helper の間でしばらく HTTP コードが部分重複 (新規 helper を full-fledged にして OCR / PDF だけ使う形)
  - 「`buildLlmProvider` helper も切り出すべき」というスタイル一貫性の要求と矛盾するが、本 Issue scope を「OCR / PDF 投入」に絞ることを優先
  - **helper の `callAnthropicMessages` は空 response (`content` が空 / text block が無い) のとき `""` を返す挙動**。既存 `AnthropicLLMProvider.invoke` は同条件で `LLMUnavailableError` を throw するため、将来 `AnthropicLLMProvider` を helper に寄せる際は呼び出し側で「空文字 → `LLMUnavailableError` 変換」を再導入する必要がある。空文字の意味論は port ごとに異なる (OCR / PDF は「テキスト未検出 = 空文字」を許容、LLM は「envelope 破綻」として失敗扱い) ことを移行時に再確認

---

## ADR-003: OCR / PDF の DI 三項分岐は `llmProvider` と同じ `adminLlmApiKey && adminLlmModel` 条件を共有する

### Status
Proposed

### Context

OCR / PDF は Anthropic Messages API を叩く実装のため、認証情報 (`apiKey`) とモデル ID (`model`) が必要。Issue #110 で配布済みの `ADMIN_LLM_API_KEY` (secret) と `ADMIN_LLM_MODEL` (var) がそのまま使える。

選択肢:
1. `llmProvider` と同じ env を共有 (1 セットで全機能 ON/OFF)
2. `ADMIN_OCR_MODEL` / `ADMIN_PDF_MODEL` などを別に配布 (機能ごとに別モデルを選択可能)
3. `apiKey` だけ共有してモデルは hard-code

### Decision

選択肢 1 を採用。`createRequestContainer` の三項分岐は `adminLlmApiKey && adminLlmModel ? new Anthropic*Provider({ apiKey, model }) : new Stub*()` の構造を維持する。

### Consequences

- 良い点:
  - 運用が単純: env 1 セットで LLM + OCR + PDF の 3 機能が同時に ON / OFF される
  - LLM が動くモデル (claude-3-5-sonnet 系) は Vision / Document も同時にサポートするため、共有モデル ID で実用上問題なし
  - 将来 Speech (別 provider, e.g., OpenAI Whisper) を追加する場合は別 env (`OPENAI_API_KEY` 等) で分けるのが自然 — 共有不可能な領域は無理に共有しない
- トレードオフ:
  - 機能ごとに別モデルを使いたい (例: OCR だけ Haiku で安く回す) ニーズには応えられない — Phase 4 のフォロー Issue 候補として記録

---

## ADR-004: error mapping は port 固有エラー (`OCRFailureError` / `PDFParseError`) に集約する

### Status
Proposed

### Context

`AnthropicLLMProvider` は port (`LLMProvider`) の規定通り `LLMRateLimitError` / `LLMUnavailableError` / `LLMQuotaExceededError` / `LLMTimeoutError` の 4 種を投げ分ける。一方 `OCRProvider` port は `OCRFailureError` 1 種のみ throw 許容 (catastrophic failure)、`PDFExtractor` port は `PDFParseError` 1 種のみ throw 許容。

選択肢:
1. Anthropic 系 4 エラーを port 固有 1 エラーに集約する (port 契約準拠)
2. port 契約を緩めて Anthropic 系 4 エラーをそのまま漏らす (リトライ判定の情報を上に伝える)
3. 新たな port エラー型を追加 (`OCRRateLimitError` 等)

### Decision

選択肢 1 を採用。`callAnthropicMessages` に渡す `mapper` を port 別に用意し、OCR は全 failure を `OCRFailureError` に、PDF は `PDFParseError` に集約する。

### Consequences

- 良い点:
  - port 契約を破らない (透明性): usecase 層が `LLMRateLimitError` を予期せず受け取ることはない
  - `runIngestionJob.classifyPipelineError` の既存実装が変更不要 — OCR 失敗は `"ocr_failure"`、PDF 失敗は `"pdf_parse_failure"` で分類される
- トレードオフ:
  - レート制限 / quota 超過などのリトライ可能 / 不可能の判別情報が port を超えて失われる — 当面は worker のリトライポリシーで吸収
  - 将来 OCR / PDF のリトライポリシーを LLM と揃えたくなった場合は port 契約の見直しが必要 (フォロー Issue 候補として記録)

---

## ADR-005: Speech / Office を本 Issue で据え置く理由とフォロー Issue 起票方針

### Status
Proposed

### Context

Issue #113 の本文には `OfficeExtractor` / `SpeechRecognitionProvider` の実 adapter 実装も含まれているが、ユーザー指示で「音声は現時点で未対応」「Office も現時点で未対応」と scope が縮小された。理由:

- **Speech**: Anthropic は ASR (speech-to-text) を提供しない。OpenAI Whisper / Cloudflare Workers AI Whisper 等の別 provider が必要 — 認証情報の追加配布、provider 選定、cost 評価が別途必要
- **Office**: Anthropic は Office 文書 (docx / xlsx / pptx) を直接受け付けない。ライブラリ (mammoth, xlsx 等) の Workers 互換性確認、bundle size 影響、format ごとの handler 分岐などが別途必要

選択肢:
1. 本 Issue で OCR / PDF のみ実装し、Speech / Office は別 Issue を起票する
2. 本 Issue で 4 つすべて実装する (Issue 本文と完全一致)
3. Speech / Office も Stub のまま放置し、別 Issue 起票せず後回し

### Decision

選択肢 1 を採用。本 Issue では:

- `SpeechRecognitionProvider` / `OfficeExtractor` は Stub のまま据え置き
- `createRequestContainer` 内の wire 行も `new Stub*()` を維持 (コメントだけ「Issue #113 では未対応、フォロー Issue で別 provider を検討」と明記)
- Phase 4 でフォロー Issue を 2 件起票 (Speech / Office)

### Consequences

- 良い点:
  - Issue scope が「Anthropic adapter 投入」に絞られ、レビュー / 検証が単純化
  - フォロー Issue で provider 選定や bundle size 影響などの個別判断をじっくり議論できる
  - Issue #110 ADR-003 (「実 adapter 不在のため別 Issue で実装後に wire」) の延長として一貫性のある運用
- トレードオフ:
  - Issue #113 の本文記載 (`OCR / Office / PDF / SpeechRecognition` の 4 つ) と完了範囲が乖離する — Phase 4 で起票するフォロー Issue で明示 catch up
  - 完了条件チェックボックスのうち 2 つ (`OfficeExtractor` / `SpeechRecognitionProvider`) が本 Issue では未達 — Issue クローズ時に「フォロー Issue に分離した」コメントを残す必要

---

## ADR-006: OCR / PDF の system prompt は当面 adapter 内 hard-code、将来 `PromptResolver` 経由は別 Issue

### Status
Proposed

### Context

既存 `AnthropicLLMProvider` は `structureToHtml` / `suggestMetadata` の system prompt を caller から渡された `input.prompt` で上書きできる形 (admin が DB で編集可能、`PromptResolver` 経由) を取っている。OCR / PDF の adapter も同様に「admin が prompt をチューニングする」体験を提供する余地はあるが、本 Issue では:

- `PromptResolver` の DB schema に OCR / PDF 用のキーが存在しない
- usecase 側 (`runIngestionJob`) の port 呼び出しで prompt を渡す経路が無い

選択肢:
1. 本 Issue で `PromptResolver` 拡張 + port シグネチャ拡張 + usecase 配線まで一気に対応
2. 本 Issue では hard-code で済ませ、将来必要になったら別 Issue で動的化

### Decision

選択肢 2 を採用。`AnthropicOCRProvider` / `AnthropicPDFExtractor` の system prompt は adapter 内に hard-code で持つ。

### Consequences

- 良い点:
  - 本 Issue scope が「実 adapter 投入」に絞られ、`PromptResolver` 拡張 / port 拡張のリスクを抱え込まない
  - 動的化が必要になった段階で port / schema / usecase の 3 層を整合的に拡張できる
- トレードオフ:
  - admin から prompt を変更できない (OCR の出力フォーマットを変えたい場合に code change が必要)
  - 将来 prompt を動的化する Issue で port シグネチャ (`extractText` の引数) を後方互換ありで拡張する必要
