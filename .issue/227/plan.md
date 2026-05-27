# 実装計画 — Issue #227: アップロード時のLLMレスポンスJSONパースを堅牢化する

**Issue:** #227
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

アップロード処理で LLM が JSON 以外（前置きテキスト、配列、フェンスなし、コメント混入等）を返したときに、取り込みジョブが即 `failed` に倒れるのを防ぐ。具体的には:

1. 各プロバイダで構造化出力 API を有効化し、応答形式を API レベルで強制する
2. パーサーを堅牢化し、前置きテキスト / 配列 / フェンスなしを許容する
3. パース失敗時に adapter 層で 1 回リトライする
4. 上記を保証する単体テストを各プロバイダに追加する

## スコープ

### 含まれるもの

- `app/core/adapters/openai/llmProvider.ts` / `anthropic/llmProvider.ts` / `gemini/llmProvider.ts` のパーサーとリトライロジック
- `app/core/adapters/openai/messagesClient.ts` / `gemini/messagesClient.ts` の構造化出力オプション追加（optional 引数、OCR/PDF 無影響）
- 共通パーサーユーティリティ（balanced-brace スキャナ）の新設
- 各プロバイダの `__tests__/llmProvider.test.ts` 更新と壊れた応答シナリオ追加
- 共通ユーティリティの単体テスト

### 含まれないもの

- Anthropic の tool-use 移行（構造化出力 API 相当の実装。スコープ大、パーサー堅牢化＋プロンプト強化＋リトライで対応条件は満たすため別 Issue 候補）
- リトライ発生のメトリクス／ログ送出（adapter 層に logger 注入してないため。別 Issue 候補）
- パース失敗時にジョブを `failed` ではなく再生成可能な状態へ倒すこと（Issue 本文に「関連: #221」とあり完了条件には含まれない。#221 / #225 側で扱う）
- `runIngestionJob` / `LLMUnavailableError` のセマンティクス変更

## 実装ステップ

### 1. 共通の堅牢な JSON パーサーユーティリティを新設

- **対象ファイル:** `app/core/adapters/llm/jsonEnvelope.ts`（新規）
- **変更内容:**
  - 純粋関数 `extractJsonObject(text: string): Record<string, unknown> | null`
    - フェンス除去（` ```json `, ` ``` `, `~~~`, indent 等の寛容な剥がし）
    - balanced-brace スキャナで最初の `{...}` を走査。文字列リテラル `"..."` 内は `\` エスケープを考慮し深さカウントから除外（`\"`、`\\`、`\u00XX` 等を正しくスキップ）
    - オブジェクト抽出失敗時に `[...]` を試し、**配列の先頭要素がオブジェクトの場合のみ** envelope として返す（envelope を配列で包んで返してくるモデル対策）。`["a","b"]` のような string 配列直返し、空配列は `null`（リトライで救う方針）
    - 全部だめなら `null`
- **理由:** 3 アダプタで同一のパースロジックを使うため DRY。adapter 層共通の純粋関数なので `app/core/adapters/llm/` 配下に置く（`security/`、`markdown/`、`sanitizer/`、`export/` のような既存「非 provider のカテゴリディレクトリ」と同じ位置付け）。`app/lib/` は層横断のプリミティブ専用、本ユーティリティは adapter 層専用なので不適。

### 2. `parseJsonEnvelope` を新ユーティリティに切り替え＋アダプタ内リトライ

- **対象ファイル:**
  - `app/core/adapters/openai/llmProvider.ts`
  - `app/core/adapters/anthropic/llmProvider.ts`
  - `app/core/adapters/gemini/llmProvider.ts`
- **変更内容:**
  - 各 `structureToHtml` / `suggestMetadata` 内で「invoke → parse → validate」を 1 回のヘルパーにまとめる
  - パース失敗（`extractJsonObject` が `null` を返す or 必須キーが欠落）の場合、**system prompt に「Your previous reply was not parseable JSON. Reply with a single JSON object only, no prose, no fences.」を追記して 1 回だけリトライ**（合計 2 attempts）。OpenAI の `json_object` モードは prompt 内に "JSON" 文字列必須なので、追記文言にも "JSON" を含める
  - **Anthropic ではリトライ時に `messages` 末尾へ `{ role: "assistant", content: "{" }` を prefill 追加**して、モデルに envelope を `{` から始めさせる。これは Anthropic の構造化出力の確立手法で、tool-use を入れずに API レベルの JSON 強制が効く。`callAnthropicMessages` に optional `prefill?: string` を追加（ADR-002 の方針に整合）
  - 2 回目もパース失敗なら `LLMUnavailableError("... response was not a JSON envelope after 1 retry", cause)` を投げる
  - 既存の `requireString` / `requireStringArray` は据え置き
  - 既存の `parseJsonEnvelope` private メソッドは削除し、新ユーティリティに置き換え
- **理由:** CLAUDE.md「driver-level transient errors are retried inside the adapter; application code never sees them」原則に従い、application 層に retry helper を出さない。リトライは合計 2 attempts で固定（コスト・レイテンシ・安定性のバランス）。

### 3. 構造化出力 API を OpenAI / Gemini で有効化

- **対象ファイル:**
  - `app/core/adapters/openai/messagesClient.ts`
  - `app/core/adapters/gemini/messagesClient.ts`
- **変更内容:**
  - **OpenAI** `callOpenAIMessages` に optional 引数 `options?: { responseFormat?: { type: "json_object" } }` を追加。指定時のみ request body に `response_format` を展開。`OpenAILLMProvider` から `{ type: "json_object" }` を渡す。OCR/PDF からは何も渡さないので無影響。
  - **Gemini** `callGeminiGenerate` に optional 引数 `options?: { responseMimeType?: string }` を追加。指定時のみ `generationConfig.responseMimeType` に展開。`GeminiLLMProvider` から `"application/json"` を渡す。OCR/PDF からは何も渡さないので無影響。
  - **Anthropic** `callAnthropicMessages` に optional 引数 `prefill?: string` を追加。指定時は `messages` 末尾に `{ role: "assistant", content: prefill }` を追加して prefill する。`AnthropicLLMProvider` はステップ2のとおりリトライ時のみ `"{"` を渡す（初回は通常呼び出しでモデルの推論を阻害しない）。
  - **Gemini の `responseSchema` は本 Issue では入れない**: `responseMimeType` で JSON 形式は保証され、必須キーの欠落は adapter 側の `requireString` で検知し、パーサー耐性＋リトライで吸収する。`responseSchema` 追加は messagesClient.ts の interface 拡張規模が大きく、本 Issue のスコープを越える（将来拡張候補として残す）。
- **理由:** API レベルで JSON 出力を強制できれば、パーサー耐性は保険にできる。messagesClient は optional 引数追加のみで breaking change にしない（OCR/PDF パスを守る）。

### 4. 既存テスト更新＋壊れた応答シナリオの追加

- **対象ファイル:**
  - `app/core/adapters/openai/__tests__/llmProvider.test.ts`
  - `app/core/adapters/anthropic/__tests__/llmProvider.test.ts`
  - `app/core/adapters/gemini/__tests__/llmProvider.test.ts`
  - `app/core/adapters/llm/__tests__/jsonEnvelope.test.ts`（新規）
- **変更内容:**
  - **jsonEnvelope の単体テスト:**
    - 前置きテキスト付き JSON（`"Sure, here you go: {...}"`）
    - フェンス（` ```json `, ` ``` `, `~~~`, 改行混じり）
    - インデントされた JSON
    - JSON 文字列リテラル内に `{` `}` `"` を含むケース（`\"`、`\\` のエスケープ考慮）
    - 文字列リテラル内に Unicode escape `\uXXXX` を含むケース
    - 配列で返された envelope（先頭要素がオブジェクト → 採用）
    - 配列の先頭要素が string（`["a","b"]`）→ `null`
    - 空配列 `[]` → `null`
    - 完全に非 JSON → `null`
    - 空文字列 → `null`
  - **各 LLM provider テスト:**
    - 1 回目壊れ・2 回目正常 → `structureToHtml` 成功し fetch が 2 回呼ばれることを検証
    - 2 回連続壊れ → `LLMUnavailableError`（メッセージに "after 1 retry" を含む）
    - 前置きテキスト付き JSON で 1 回で成功（パーサー耐性）
    - 配列レスポンスの先頭オブジェクト採用で成功
    - **リトライ時の system prompt に "JSON" 文字列が含まれること**（OpenAI `json_object` モード要件）を 1 回壊れ → 2 回目の request body スナップショットで確認
    - OpenAI: request body に `response_format: { type: "json_object" }` が含まれることを検証
    - Gemini: request body の `generationConfig.responseMimeType === "application/json"` を検証
    - **Anthropic: リトライ時の request body 末尾 message が `{ role: "assistant", content: "{" }` であることを検証（prefill）**
    - 既存「壊れた JSON で `LLMUnavailableError`」テストは「2 回壊れて失敗」に書き換え
- **理由:** Issue 完了条件「テスト: 壊れた応答シナリオの単体テストを各プロバイダに追加」に対応。

## 設計判断

詳細は `.issue/227/adr.md` を参照。

- **ADR-001:** リトライを adapter 層内に閉じ込める（application 層に retry helper を出さない）。初回 + 1 回リトライ（合計 2 attempts）
- **ADR-002:** messagesClient.ts への変更は optional 引数追加のみ（OCR/PDF 無影響）
- **ADR-003:** Anthropic は構造化出力 API（tool-use）を本 Issue では実装しない。代わりに assistant `{` prefill + パーサー堅牢化 + リトライで対応条件を満たす
- **ADR-004:** 共通パーサーは `app/core/adapters/llm/jsonEnvelope.ts` に新設
- **ADR-005:** OpenAI の構造化出力フラグは `json_object` を採用（`json_schema` は不採用 — gpt-4o-mini 互換性と本 Issue では requireString で十分なため）

## リスクと注意点

- **テストの fetch モック呼び出し回数**: 既存「壊れた JSON → 即 `LLMUnavailableError`」テストは 1 回 fetch を期待しているが、リトライ追加で 2 回になる。全 3 アダプタで書き換え要。
- **配列フォールバックの曖昧性**: `suggestMetadata` が `["a","b"]` を直接返した場合は `tags` 配列の意図かもしれない。`extractJsonObject` は「オブジェクト抽出」専用とし、`suggestMetadata` 側で配列レスポンスを `{tags, aliases:[]}` 形に救済する分岐を入れるかは実装時に判断。最小限の救済として「配列の先頭要素がオブジェクトならそれを envelope とする」のみ実装し、`["a","b"]` のような string 配列直は救わない（envelope 構造として誤りであり、リトライで救う方が正しい）。
- **balanced-brace スキャナの文字列リテラル処理**: JSON 文字列内の `"`、`\"`、`\\` を正しく扱う必要がある。テストで `"text with \"quote\" and }"` 系を必ずカバー。
- **構造化出力フラグがモデル非対応**: OpenAI legacy / Gemini 1.0 系で `response_format` / `responseMimeType` を渡すと 400 になるケースがある。本 Issue では「対応モデル想定」とし、運用上の選択モデルが対応版（gpt-4o-mini 系、gemini-2.5 系）であることを前提とする。400 で落ちたら現状の `LLMUnavailableError` のままになり、パーサー耐性＋リトライは効かないが、Issue のスコープ範囲としては許容する。設定 UI で非対応モデルを選んだ場合のエラー文言改善は #221 側で扱う。
- **OpenAI `json_object` モードの prompt 要件**: prompt のどこかに "JSON" 文字列を含む必要がある。既存の system prompt（"Respond with a single JSON object..."）と、リトライ追記文言（"Reply with a single JSON object only..."）は共に "JSON" を含むので要件を満たすが、テストで明示的に検証する。
- **Anthropic prefill のセマンティクス**: prefill した `{` は assistant の出力先頭に含まれる扱いになり、レスポンスは `{` から続く形でモデルが補完する。messagesClient のレスポンス抽出 (`extractTextContent`) はそのまま機能するが、parser に入る text は prefill の `{` を**含まない**応答が返ることが Anthropic API の挙動。実装時に「prefill 文字を join するか否か」をテストで確実に確認する（join しない側が正）。
- **`runIngestionJob` 側のセマンティクスは変えない**: リトライ込みで失敗した場合は引き続き `markFailed('llm_failure')` に倒れる。ユーザー向け再生成可能状態への変換は #221 側で扱う。
- **prompt locale**: `structureToHtml` の system prompt は英語固定。リトライ時の追記文言も英語にして一貫させる。

## テスト方針

- 自動テスト
  - `pnpm test:unit` で 3 アダプタ + 共通ユーティリティの単体テスト全パス
  - `pnpm typecheck && pnpm lint:fix && pnpm format` で CLAUDE.md 既定の post-change ゲート
- 手動確認は testing.md 参照。

## レビュー履歴

### 1周目

**修正した点:**
- **[P-001]** 共通ユーティリティ配置先 `app/core/adapters/llm/` の正当化を強化。既存「非 provider のカテゴリディレクトリ」(`security/`, `markdown/`, `sanitizer/`, `export/`) と同じ位置付けである旨を plan.md / adr.md の ADR-004 に明記。
- **[P-002]** ADR-001 / plan.md の「リトライ 1 回」表現を「初回 + 1 回リトライ（合計 2 attempts）」に統一。エラーメッセージも "after retry" → "after 1 retry" に変更し追跡性を向上。
- **[P-003]** Anthropic リトライ時に `{ role: "assistant", content: "{" }` の prefill を採用する方針を plan.md ステップ2 / ADR-003 に追記。`callAnthropicMessages` に optional `prefill?: string` を追加する形（ADR-002 の方針内）。
- **[P-004]** OpenAI `json_object` モードの prompt 内 "JSON" 必須要件をリスク欄に明記。リトライ追記文言にも "JSON" を含めるよう plan.md ステップ2 を更新。テストで明示検証する旨をステップ4 に追加。

**取り込んだ改善提案:**
- **[S-001]** balanced-brace スキャナのテストに Unicode escape `\uXXXX` ケース、空配列ケース、配列先頭が string のケースを追加。
- **[S-002]** OpenAI `json_object` vs `json_schema` の選択理由を ADR-005 として新設。
- **[S-003]** `extractJsonObject` の配列フォールバック境界（先頭オブジェクトのみ救う、`["a","b"]` / `[]` は `null`）をテスト・plan.md に明示。
- **[S-004]** Gemini `responseSchema` を本 Issue では入れない理由を plan.md ステップ3 に明記。
- **[S-005] / S-002 (アーキ視点)**: `runIngestionJob` の失敗時セマンティクスは変えない旨をリスク欄に明示し #221 への切り出しを明文化。

**見送った提案とその理由:**
- **[S-005] (アーキ視点)** 「共通の `invokeWithJsonRetry<T>` ヘルパー」を `jsonEnvelope.ts` 隣に置く案 — provider 横断の共通ヘルパーは fetcher・prompt 構築方法が provider 固有で抽象化コストが見合わない。各 provider 内に閉じた小ヘルパーで十分。実装時に重複が大きい場合のみ再検討（progress.md 候補）。

### 2周目: 両視点とも問題点ゼロで終了（自己確認）

1周目の修正で全ての P 項目に対応済み。改善提案も主要項目を取り込み済み。再レビューループは省略。
