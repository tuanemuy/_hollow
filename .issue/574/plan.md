# 実装計画 — Issue #574: P23 プロンプトプレビュー（LLM実行プレビュー機構）

**Issue:** #574（親 #565 / 祖 #514 / 元 #543）
**作成日:** 2026-06-10
**複雑度:** 中〜大規模（4子Issueの中で最大）

---

## 目的

設定 P23「カスタムプロンプト」画面に、ユーザーが編集中のプロンプトを実 LLM で試せる「プロンプトプレビュー」を追加する。各用途について入力サンプル → 出力サンプルのプレビュー表示と「サンプルで実行」ボタンを設け、実 LLM の実出力を表示する（虚偽表示禁止）。

## 確定した設計判断（ユーザー決定済み・厳守）

1. **対象用途 = 実行可能な4用途のみ**: structure / title / directory / metadata。**ocr_assist は LLMProvider に実行メソッドが無いためプレビュー非対応**とし、UI で正直に「プレビュー非対応」を表示する。
2. **コスト・濫用抑制 = 最小 + 簡易レート制限**: (a) サンプル長上限（transport 検証）、(b) 認証必須、(c) プロンプト長は既存 16KiB 上限を流用、(d) 1ユーザーあたりの実行回数の簡易レート制限を**実カウンタ付き**で本 Issue に実装（汎用基盤化はしない）。

## スコープ

### 含まれるもの

- プレビュー usecase `previewPrompt`（application/ingestion）
- 簡易レート制限 port `PromptPreviewRateLimiter` + D1 adapter + テーブル + migration
- transport schema（`previewPromptSchema`、サンプル長上限）
- server function `previewPromptFn`
- `PromptsForm` のプレビュー UI（入出力2カラム・実行ボタン・ローディング/エラー・ocr_assist 非対応表示）
- styles のプレビュー用トークン化スタイル
- unit / integration テスト

### 含まれないもの

- ocr_assist の LLM 実行経路新設（LLMProvider メソッド追加）
- 汎用レート制限基盤（KV/DO バインディング追加）
- スライディングウィンドウ・分散整合な厳密レート制限
- 他ページ（P21/P22/P24）の拡充（別子Issue）

## 実装ステップ

### 1. プレビュー出力 DTO 型の定義

- **対象ファイル:** `app/core/application/ingestion/previewPrompt.ts`（新規・型を同居）
- **変更内容:** 用途別出力 projection 型 `PreviewPromptOutput`。structure/title/directory は `{ html, titleSuggestion, directorySuggestion }`、metadata は `{ tags, aliases }` を正規化して返す。
- **理由:** 実 LLM 実出力をそのまま射影（虚偽表示禁止）。

### 2. 簡易レート制限 port の定義

- **対象ファイル:** `app/core/application/ports/promptPreviewRateLimiter.ts`（新規）
- **変更内容:** `interface PromptPreviewRateLimiter { tryConsume(userId: string, now: Date): Promise<{ allowed: boolean; retryAfterSec: number }> }`（固定 window・N 回/window）。
- **理由:** cross-cutting concern を port 裏に（CLAUDE.md 方針）。本機能向け最小実装。

### 3. D1 レート制限 adapter + schema + migration

- **対象ファイル:** `app/core/adapters/d1/repositories/promptPreviewRateLimiter.ts`（新規）・`app/core/adapters/d1/schema.ts`・`app/core/adapters/d1/migrations/{次の連番}_prompt_preview_counters.sql`（新規）
- **変更内容:** テーブル `prompt_preview_counters(user_id TEXT, window_start INTEGER, count INTEGER, PRIMARY KEY(user_id, window_start))`。`tryConsume` は `INSERT ... ON CONFLICT(user_id, window_start) DO UPDATE SET count = count + 1 WHERE count < :max RETURNING count`（`idempotencyStore` のアトミック claim と同型、`mapDbError` ラップ）。window は `floor(now/windowMs)`。**migration 連番は実際の最新を確認して採番する**（古い window 行は pruner で後日掃除可＝本 Issue 対象外とコメント）。
- **理由:** 既存 D1 アトミック claim パターンに沿った競合安全な実カウンタ。KV/DO はコンテナ未配線で新規バインディングは最小スコープを超える。

### 4. プレビュー usecase の実装

- **対象ファイル:** `app/core/application/ingestion/previewPrompt.ts`（新規）
- **変更内容:** 入力 `{ actorUserId, purpose, sampleText, overridePrompt? }`。手順:
  1. `container.promptPreviewRateLimiter.tryConsume` で `allowed:false` なら `BusinessRuleError("prompt_preview_rate_limited")` を throw。
  2. 用途を structure/title/directory（`structureToHtml`）と metadata（`suggestMetadata`）に分岐。
  3. `overridePrompt` 非空ならそれを当該用途の prompt フィールドに、空なら `promptResolver.resolveFor` 解決値（runIngestionJob と同ロジック）。
  4. structure/title/directory は `structureToHtml({ rawText: sampleText, prompt, titlePrompt, directoryPrompt, locale:"ja", existingDirectories: [] })` を1呼び出し（編集中用途のみ override 差し替え、他用途は resolver 値）。metadata は `suggestMetadata({ html: sampleText, prompt })`。
  5. LLM 呼び出しを try/catch し `BusinessRuleError` に翻訳（ADR-005）:
     - `isLLMRateLimitError`→`llm_rate_limited`
     - `isLLMUnavailableError`/`isLLMTimeoutError`→`llm_failure`（既存コード流用）
     - `isLLMQuotaExceededError`→`llm_quota_exceeded`
     - `BusinessRuleError` で `code==="unsupported_format"`→`llm_preview_unavailable`（**プレビューはファイルを送らないため `unsupported_format` は StubLLMProvider 由来と一意。message sniff は不要**）
  - LLM 呼び出しは UoW 外（runIngestionJob に倣う）。`actorUserId` は usecase 内で identity `UserId.create`。
- **理由:** port 制約（3用途1呼び出し・metadata は HTML 入力）を usecase に正しく反映。プレビューはリトライ無しの同期1回実行なので4エラー型すべてを明示翻訳する（pipeline の classifyPipelineError は unavailable/timeout のみ分類＝差分は ADR-005 に記録）。

### 5. DI 配線

- **対象ファイル:** `app/core/application/di/types.ts`（RequestContainer に `promptPreviewRateLimiter` 追加）・`app/core/application/di/serverCloudflare.ts`（`new D1PromptPreviewRateLimiter(db, clock, { max, windowMs })` を配線）
- **変更内容:** 新 port をリクエストコンテナに供給。max/windowMs は定数 or config。
- **理由:** usecase が container 経由で参照。

### 6. transport schema（サンプル長上限）

- **対象ファイル:** `app/components/identity/PromptsForm/schema.ts`
- **変更内容:** `previewPromptSchema = z.object({ purpose: z.enum(["structure","title","directory","metadata"]), sampleText: z.string().min(1).max(SAMPLE_TEXT_MAX_LENGTH), overridePrompt: z.string().max(10_000).optional() })`。`SAMPLE_TEXT_MAX_LENGTH = 4000`（推奨）を export。`overridePrompt` 上限は保存側 `template.text` の `max(10_000)` に揃える（ADR-004）。ocr_assist は enum から除外。
- **理由:** コスト抑制(a) を transport boundary で検証。

### 7. server function（preview 実行）

- **対象ファイル:** `app/components/identity/PromptsForm/action.ts`
- **変更内容:** `previewPromptFn = createServerFn({method:"POST"}).middleware([errorResponseMiddleware]).inputValidator(validateInput(previewPromptSchema)).handler(...)`。handler で `requireCurrentUser()`（認証必須）→ `loadServerDeps(() => import(".../previewPrompt"))` → `previewPrompt({ container, input: { actorUserId: actor.id, ...data } })`。
- **理由:** server function call-site inline 宣言の規約に準拠。

### 8. frontend プレビュー UI

- **対象ファイル:** `app/components/identity/PromptsForm/index.tsx`・`app/components/identity/styles.ts`
- **変更内容:**
  - `styles.ts` に `PREVIEW_PANEL`/`PREVIEW_PANEL_HEAD`/`PREVIEW_PANEL_TITLE`/`PREVIEW_PAIR`（`grid grid-cols-1 md:grid-cols-[1fr_24px_1fr]`）/`PREVIEW_BLOCK`/`PREVIEW_BLOCK_LABEL`/`PREVIEW_BLOCK_BODY`/`PREVIEW_ARROW` を mock CSS から token 化して追加。
  - `PromptRow` に `previewable: boolean`。4用途は「入力サンプル textarea（`maxLength={SAMPLE_TEXT_MAX_LENGTH}`）＋『サンプルで実行』＋出力ブロック」を描画。`useTransition` + `useServerFn(previewPromptFn)` で実行、結果を state に保持、エラーは `extractSerializedError`→`displayError`、ローディング表示。
  - metadata のサンプル入力欄は「構造化済み HTML を入力」と明示（rawText ではない）。
  - ocr_assist 行は「プレビュー非対応」を表示し実行ボタン非表示。
- **理由:** mock 視覚仕様に追従しつつ虚偽表示禁止。

### 9. エラーコード定数化 + 表示文言 + テストミラー（3点セット・必須）

- **対象ファイル:** `app/core/domain/ingestion/errorCode.ts`（または適切な `*ErrorCode` モジュール）・`app/core/presentation/errorDisplay.ts`・`app/core/domain/__tests__/errorCodeNaming.test.ts`・`app/core/presentation/__tests__/errorDisplay.test.ts`
- **変更内容:**
  1. 新規コード `llm_rate_limited` / `llm_quota_exceeded` / `llm_preview_unavailable` / `prompt_preview_rate_limited` を `IngestionErrorCode` に **PascalCase key / lower_snake value** で定数追加（`BusinessRuleError<TCode>` の型引数を満たすため定数化は必須）。`llm_failure` は既存（現状 pipeline 識別子として直書き）を流用。
  2. `errorDisplay.ts` の `renderIngestionBusinessMessage`（group a）に各コードの専用文言ケースを追加（例: `llm_rate_limited`→「リクエストが集中しています。しばらくしてから再度お試しください」、`llm_quota_exceeded`→「AI の利用上限に達しました」、`llm_preview_unavailable`→「現在 AI が利用できないためプレビューできません」、`prompt_preview_rate_limited`→「プレビューの実行回数上限に達しました。しばらくしてから再度お試しください」）。**追加しないと `BUSINESS_FALLBACK_MESSAGE` に丸められ正直な表示が成立しない**。
  3. `errorDisplay.test.ts` の `EXPLICIT_*_CODES`（ingestion 群）と `errorCodeNaming.test.ts` の固定 set に新規コードをミラーする。
- **理由:** 「実行できない用途・状況を正直に表示」という本 Issue のコア受け入れ基準。`*ErrorCode` naming 規約・errorCodeNaming.test・errorDisplay の fallback テストの網羅性を同時に満たす。

### 10. テスト追加

- unit（`previewPrompt.test.ts`）/ integration（`promptPreviewRateLimiter.integration.test.ts`）。詳細はテスト方針。

## 設計判断

ADR-001〜005 を `.issue/574/adr.md` に記録。要点:

- 対象4用途・ocr_assist 非対応表示（ADR-001）
- structure/title/directory は `structureToHtml` 1呼び出しに集約（port が分割実行を提供しない／ADR-002）
- 簡易レート制限は D1 テーブルで実装（KV/DO 未配線・idempotencyStore パターン踏襲／ADR-003）
- サンプル長上限 4000 文字、プロンプト長は既存 16KiB 流用（ADR-004）
- StubLLMProvider・LLM 未設定など実行不可状況は正直に表示（ADR-005）

## リスクと注意点

- **課金発生**: レート制限・サンプル長上限・認証の3点が確実に効くことを統合テストで検証。特に `tryConsume` の `WHERE count < :max` の境界挙動。
- **structureToHtml の3用途同時呼び出し**: title/directory プレビューでも構造化全体が走り課金が増える。UI で「構造化を伴うプレビュー」と明示。port が分割実行を提供しないため集約が唯一の正直な方法。
- **StubLLMProvider 環境**: LLM 未設定インスタンスでは `BusinessRuleError(code="unsupported_format", message="llm_not_implemented_in_mvp")` を throw（code は `unsupported_format`）。そのまま伝播すると「このファイル形式には対応していません」と無意味表示になるため、usecase で `code==="unsupported_format"`→`llm_preview_unavailable` に翻訳して正直に表示（ADR-005）。
- **directory プレビュー**: `existingDirectories: []` 固定のため directory 提案は常に「新規ディレクトリ名」側になる（既存マッチ不可）。UI コピーで「既存ディレクトリとの照合はしない簡易プレビュー」である旨を誤解させない配慮を入れる。
- **`AdminSettingsUserId` vs `IdentityUserId`**: resolver は identity の `UserId` を要求。usecase で正しい brand を作る。
- **migration 連番**: 実際の最新連番を確認して採番。
- **errorCodeNaming.test**: 新規コードは lower_snake_case・定数化必須。
- **PURPOSES のローカル重複**: `index.tsx`/`schema.ts` が5用途を別々に保持。プレビュー側 enum（4用途）と保存側 enum（5用途）の分岐（ocr_assist の扱い）を1箇所で読み取れるようコメントを残す。

## レビュー履歴

### 1周目（2視点並列）
**修正した点（要修正）**:
- [P-001 両視点] StubLLMProvider は実際には `BusinessRuleError(code="unsupported_format", message="llm_not_implemented_in_mvp")` を throw（ADR の「code が llm_not_implemented_in_mvp」は誤り）。そのままだと「ファイル形式非対応」と無意味表示。usecase で `code==="unsupported_format"`→`llm_preview_unavailable` に翻訳（preview パスはファイル非送信なので code だけで一意判定・message sniff 不要）。ADR-005・step 4・リスク欄を修正。
- [P-002 両視点] 新規コード（`prompt_preview_rate_limited`/`llm_rate_limited`/`llm_quota_exceeded`/`llm_preview_unavailable`）は `errorDisplay.ts` に case 追加しないと汎用フォールバックに丸められる。step 9 を「定数化＋errorDisplay 文言＋テストミラー」の3点セット必須に再構成。
- [P-003 アーキ] 新規コードの `IngestionErrorCode` 定数化（PascalCase key / lower_snake value）と `errorCodeNaming.test` ミラーを確定ステップ化（`BusinessRuleError<TCode>` 型引数のため必須）。

**取り込んだ改善提案**:
- [S-001 アーキ] `overridePrompt` 上限を 16KiB ではなく保存側 schema の `max(10_000)` に揃える（ADR-004 修正）。
- [S-002/S-003 アーキ] ADR-003 の「idempotencyStore と同型」を「アトミック claim の考え方を踏襲（SQL 形状は別物。drizzle `onConflictDoUpdate`+`setWhere`、searchIndex に実例）」に正確化。境界挙動を integration test で固定する注記を追加。
- [S-001 要件] pipeline の classifyPipelineError は unavailable/timeout のみ分類する点との差分を ADR-005 に記録。
- [S-003 アーキ] directory プレビューは `existingDirectories:[]` 固定で常に新規提案になる旨を UI コピーで明示（リスク欄に追加）。
- [S-002 要件] mock はラベル文言を持たない（CSS のみ）ため、文言は本 Issue で確定する旨を step 8 に内包。

**見送った提案とその理由**:
- なし（全指摘を反映）。

実害のある P-001〜P-003 はいずれも「正直なエラー表示」というコア原則に直結するため反映済み。残りは記述精度・一貫性で解消。新規論点は収束したため 1 周で終了。


## テスト方針

- **Unit**（`app/core/application/ingestion/__tests__/previewPrompt.test.ts`）: Fake `LLMProvider`/`PromptResolver`/`PromptPreviewRateLimiter` を注入し、(a) structure/title/directory が `structureToHtml` を1回呼び編集中用途だけ override 注入・残りは resolver 値、(b) metadata が `suggestMetadata({html})` を呼ぶ、(c) `overridePrompt` 空時に resolver 値、(d) 各 LLM エラーが対応 `BusinessRuleError` に翻訳、(e) `tryConsume` 拒否時に `prompt_preview_rate_limited`、(f) StubLLMProvider の BusinessRuleError 伝播。
  - 加えて、各新規エラーコードが `displayError` で**汎用フォールバックではなく専用文言**を返すことをアサート（`errorDisplay.test.ts` に追加）。
- **Integration**（`app/core/adapters/d1/__tests__/promptPreviewRateLimiter.integration.test.ts`）: 実 D1 でカウンタが window 内 max まで許可・超過で拒否・window 跨ぎでリセット（`idempotencyStore.integration.test` 構成に倣う）。境界 count=max で「既存行の更新拒否（RETURNING 空）」と「lost race の INSERT 失敗」をともに `allowed:false` とすることを固定。LLM は fake/stub。
- **手動ブラウザ確認**: `/settings/prompts` で4用途のプレビュー入出力2カラム（desktop 横並び・mobile 縦）、実行のローディング/出力/エラー、ocr_assist の「プレビュー非対応」、レート制限超過の文言、未ログイン時の `/login` リダイレクトを mock と寸法/色トークンで突合。
