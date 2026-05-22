# 実装計画 — Issue #141: feat(llm): unified error sanitizer for connection-ping / provider responses

**Issue:** #141
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

`connectionPing` 系および provider レスポンス由来の error 文字列が admin UI / log にそのまま露出する現状を是正する。`fetch` の `TypeError` や Workers ランタイム由来のエラーメッセージに、リクエスト URL（クエリ含む）やプロキシ情報、admin が baseURL に誤って含めた secret などが混入する可能性を排除するため、横断的な error sanitizer layer を導入する。

## スコープ

### 含まれるもの

- `app/core/application/llm/sanitizeErrorReason.ts`（新規）: 既知 category への正規化 + secret-like pattern の masking を行う pure function。
- 3 つの `connectionPing.ts`（anthropic / openai / gemini）の `catch` 経路および 4xx の `detail` 組立てを sanitize 経由に変更。
- `app/core/application/di/llmConnectionTester.ts` の dispatcher に最終 fallback sanitize を追加（将来追加 probe での漏れ防止の薄い防御層）。
- 3 つの `messagesClient.ts` の `throwForStatus` の `detailSuffix` を **masking のみ** で sanitize 経由に変更（category 化は既存 mapper が担うため重複させない）。
- `sanitizeErrorReason` の新規ユニットテストと、既存テストの assertion 更新。

### 含まれないもの

- UI 表示文字列の翻訳・日本語化（category prefix は英 snake_case のまま渡す。翻訳 layer はフォローアップ扱い）。
- 既存 mapper の status → category 判定ロジック自体の変更。
- timeout/network の固定文言メッセージの変更（secret を含まない既知文字列のため不要）。
- HTML body 用 `app/core/adapters/sanitizer/htmlSanitizer.ts` への変更（責務が違う別物）。

## 実装ステップ

### 1. error sanitizer の新設

- **対象ファイル:** `app/core/application/llm/sanitizeErrorReason.ts`（新規）
- **変更内容:**
  - `export type SanitizedErrorReason = "timeout" | "network" | "auth_failed" | "rate_limited" | "quota" | "server_error" | "unknown"`
  - `export function sanitizeErrorReason(input: unknown): { category: SanitizedErrorReason; message: string }` を export。入力は `unknown`（`Error` / 文字列 / 任意 object / `undefined` / `null` すべて受ける）。
  - 処理:
    1. `instanceof Error` の `name`/`code` ベースで category 判定（`AbortError` → timeout、`TypeError` → network、HTTP status / type 由来の文字列パターン → rate_limited / quota / auth_failed / server_error、それ以外 → unknown）。
    2. message 文字列を `maskSecrets()` に通す:
       - URL 全体（`https?://[^\s]+`）→ origin + path のみ残し query を `?…` に置換。
       - `Bearer <token>` → `Bearer ***`。
       - `(?:^|[?&])(?:key|api[_-]?key|access[_-]?token|token|password|secret|authorization)=([^&\s]+)` → 値を `***` に置換。
       - 既知 provider prefix を持つ token（`sk-` で始まる文字列、`AIza` で始まる文字列など）→ `***`。汎用の「32 文字以上の連続英数記号列」マッチは行わない（モデル名・GUID・base64 chunk・stack trace アドレスなど false positive が多い）。
  - `export function toReasonString(sanitized: { category; message }): string` — 既存 UI の `error?: string` 形式に合わせ、`"<category>: <message>"` 形式に組み立てる。message が masking 後に空なら category のみを返す。
  - `export function maskSecrets(text: string): string` — masking のみを行う軽量関数（`messagesClient.ts` の detail 組立てから使う）。
- **理由:** Issue 要件 1 の sanitize 関数。`unknown` を受けるのは、catch ブロックの値、provider レスポンス body の `error.message` 文字列、`undefined` 等すべてのケースを一箇所で扱うため。

### 2. `pingAnthropic` の sanitize 適用

- **対象ファイル:** `app/core/adapters/anthropic/connectionPing.ts`
- **変更内容:**
  - import `sanitizeErrorReason`, `toReasonString`, `maskSecrets` を `@/core/application/llm/sanitizeErrorReason`。
  - 戻り値の `error?: string` フィールドに渡す文字列の組立てを sanitize 経由に変える（フィールド名は `error`。後述 `pingOpenAI`/`pingGemini` の `reason` とは別だが、sanitize の適用箇所＝ probe が戻り値の中で持つ文字列値そのもの、という点で扱いは同一）。
  - 4xx 経路: `body.error?.message` を `maskSecrets()` に通してから `detail` に組み込む。
  - `catch` 経路: `error.name === "AbortError"` 分岐は既存の固定文言を維持（secret 非混入のため masking 不要）。それ以外は `toReasonString(sanitizeErrorReason(error))` で組み立てる。
- **理由:** Issue 要件 2。secret-like pattern の漏洩を防ぐ。

### 3. `pingOpenAI` の sanitize 適用

- **対象ファイル:** `app/core/adapters/openai/connectionPing.ts`
- **変更内容:** ステップ 2 と同じ pattern を適用。フィールド名は `reason`。`{ ok: false, reason }` の文字列値そのものを sanitize 経由に変える。
- **理由:** Issue 要件 2。Azure baseURL の `?api-version=`/`?key=` 系が `TypeError` メッセージに含まれた場合の漏洩を防ぐ（OpenAI で特に重要）。

### 4. `pingGemini` の sanitize 適用

- **対象ファイル:** `app/core/adapters/gemini/connectionPing.ts`
- **変更内容:** ステップ 2 と同じ pattern を適用。フィールド名は `reason`。
- **理由:** Issue 要件 2。

### 5. dispatcher 最終 fallback sanitize（masking のみ）

- **対象ファイル:** `app/core/application/di/llmConnectionTester.ts`
- **変更内容:** `HttpLLMConnectionTester.ping` 内で probe から返った文字列を **`maskSecrets()` のみ**に通す薄い防御層を追加する。category 化は probe 側で既に適用済みのため二重に行わない。`maskSecrets` は冪等な文字列→文字列変換（`***` 化済みの文字列を再度通しても変化しない）なので副作用なし。
- **理由:** 将来 probe 追加時に masking を忘れた場合の保険として機能する。category 漏れは UI 整合性問題で secret 漏洩ではないため、防御層の対象は masking に絞る。設計判断 ADR-002 参照。

### 6. `messagesClient.ts` の detailSuffix masking

- **対象ファイル:**
  - `app/core/adapters/anthropic/messagesClient.ts`
  - `app/core/adapters/openai/messagesClient.ts`
  - `app/core/adapters/gemini/messagesClient.ts`
- **変更内容:** `throwForStatus()` で `body.error?.message`（および各 provider 固有の `errorType` / `errorCode`）から組み立てる `detailSuffix` を、`maskSecrets()` のみに通す。category 化は HTTP status → mapper が担う既存設計を保持。
- **`cause` 経路の扱い:** mapper には `cause: error` を渡す既存 pattern を保持する。`*Error extends Error` の `message` には sanitize 済みの固定文言 + sanitize 済み `detailSuffix` のみが入り、`error.cause` の中身は標準のシリアライズ経路（`error.message` / `JSON.stringify(error)` / `toSerialized()`）では露出しない。`cause` を再露出するロガー実装は本リポジトリには存在しない（確認方針: `grep -r "\.cause" app/core --include "*.ts"` で再露出箇所がないことを実装時に最終確認する）。
- **log 経路:** adapter は直接 `console.log` / `logger` を呼ばず、throw した error が presentation 層の serializer・log 層を通る。`message` に sanitize 済み文字列のみが入る設計のため、log 経路も masking 適用の範囲に含まれる。
- **理由:** Issue 要件 3。provider レスポンス body は外部由来文字列のため、URL/secret が含まれる可能性を排除。timeout/network 経路の固定文言は変更不要（`Request timed out after Xms` 等は secret 非混入）。

### 7. sanitizer 専用ユニットテスト

- **対象ファイル:** `app/core/application/llm/__tests__/sanitizeErrorReason.test.ts`（新規）
- **変更内容:**
  - 各 category への正規化（7 種類 + unknown）。
  - secret masking:
    - `https://example.com/api?key=abcd1234&foo=bar` → query が `?…` に潰される。
    - `Bearer sk-ant-xxx` → `Bearer ***`。
    - Azure 風: `https://res.openai.azure.com/...?api-version=2024-02-01&key=xxx` → query 全体が潰される。
    - 既知 provider prefix 付きトークン（`sk-ant-xxx` / `AIza...`）→ `***`。
    - **false positive 非対象**: 一般的な GUID（`550e8400-e29b-41d4-a716-446655440000`）、長い URL path セグメント、モデル名（`gpt-4-turbo-preview`）等は `***` 化しないことを fixed assertion で確保。
  - **冪等性**: `sanitizeErrorReason(sanitizeErrorReason(x))` および `maskSecrets(maskSecrets(x))` が初回適用と同じ結果を返すことを assertion。
  - 入力が `undefined` / `null` / 数値 / object でも throw せず unknown category を返す。
- **理由:** Issue 要件 4。

### 8. 既存テストの更新

- **対象ファイル:**
  - `app/core/adapters/anthropic/__tests__/connectionPing.test.ts`
  - `app/core/adapters/openai/__tests__/connectionPing.test.ts`
  - `app/core/adapters/gemini/__tests__/connectionPing.test.ts`
  - `app/core/application/di/__tests__/llmConnectionTester.test.ts`
  - `app/core/adapters/{anthropic,openai,gemini}/__tests__/messagesClient.test.ts`
  - その他の `messagesClient` 経由のエラーを assert している test（必要に応じて）。
- **変更内容:** 既存の `reason: "fetch failed"` / `reason: "network down"` のような期待値を sanitize 後の表現（`"network: fetch failed"` 等）に更新。`messagesClient.test.ts` の `detailSuffix` を含む assertion を sanitize 後の文字列に更新。
- **理由:** 挙動変更に伴う追従。

## 設計判断

詳細は `.issue/141/adr.md` 参照。要点:

- **ADR-001**: sanitizer は `app/core/application/llm/sanitizeErrorReason.ts` に配置（application 層）。adapter からも pure function として import する。
- **ADR-002**: dispatcher に最終 fallback sanitize を入れる（薄い防御層）。
- **ADR-003**: URL の query は whitelist ではなく丸ごと潰す（安全側に倒す）。
- **ADR-004**: `messagesClient` には masking のみ適用（category 化は既存 mapper が担う）。

## リスクと注意点

- **テスト assertion の固定文字列が複数変わる**。本変更の「見た目の差分」の半分はテスト更新になる見込み。
- **UI のエラー文言が読みづらくなる可能性**。category prefix は英 snake_case のまま渡す。日本語化は別 Issue でフォローアップ可能。
- **正規表現での masking は false positive のリスクがある**。Azure base URL の `api-version=2024-02-01` のような診断に有用な query も潰されるが、安全側に倒す方針。ADR-003 で明示。
- **log での運用影響**。`LLMRateLimitError` 等の `message` に sanitize（masking のみ）を適用するため、provider native message を tail していた運用がある場合に影響しうるが、secret 部分のみ書き換わるため最小限。
- **timeout/network 経路の `cause` チェーンは secret 漏洩リスクなし**。固定文言（`Request timed out after Xms` 等）には secret は含まれず、`error.cause` の中身は標準シリアライズ経路（`error.message` / `JSON.stringify(error)` / `toSerialized()`）では露出しない。本リポジトリには `cause` を再露出する logger 実装はなく、masking 不要。

## テスト方針

- **ユニットテスト**:
  - `sanitizeErrorReason` の category 正規化全パターン（7 種類 + unknown）。
  - secret masking の各 pattern（query 全体置換 / Bearer / 単発トークン文字列 / 既知 provider prefix）。
  - 入力 `undefined` / `null` / 数値 / object など edge case。
  - 3 つの `pingXxx` の既存テストを sanitize 後の出力に更新。
  - 各 `pingXxx` に URL 入り `TypeError` を投げ secret 部分がマスクされる追加テスト。
  - `HttpLLMConnectionTester` の dispatcher テストで secret 入り raw メッセージを mock し、最終的に sanitize 済み文字列が返ることを検証。
  - `messagesClient.ts` の `throwForStatus` の `detailSuffix` に secret 入り message を mock し masking テスト。
- **人手で確認**:
  - 管理画面で意図的に間違った baseURL（例: `https://example.com/?key=fake-secret-xxx`）を入力 → 「接続テスト」実行 → エラーバナーに `fake-secret-xxx` が出ないこと。
  - 意図的に無効な API key で接続テスト → エラー reason が `auth_failed:` 等の category prefix 付きで UI に表示されること（受け入れ基準「既知 category に正規化された reason が UI に表示される」の確認）。
  - 通常系の接続成功・想定範囲内の auth 失敗が壊れていないこと（既存機能の回帰確認）。

## レビュー履歴

### 1周目

**修正した点**:

- **[P-001 対応]** ADR-002 と実装ステップ 5 を「dispatcher は `maskSecrets()` のみ通す（category 再適用なし）」に確定。`maskSecrets` は文字列→文字列の自明な冪等性を持つため、二重 prefix リスクを排除。
- **[P-002 対応]** plan ステップ 6 と ADR-004 に `cause` 経路の安全性確認手順（`grep -r "\.cause" app/core --include "*.ts"`）と log 経路の説明を明示追加。adapter は直接 log を出さず、throw → presentation 層 serializer の経路を通るため、masking 済み `message` で log 経路もカバーされる旨を明文化。
- **[P-003 対応]** ステップ 2/3 で `pingAnthropic` の戻り値フィールド名が `error`、`pingOpenAI`/`pingGemini` が `reason` であることを明示。「フィールド名は問わず、戻り値の文字列値そのものを sanitize 経由に変える」と統一表現に書き直し。

**取り込んだ改善提案**:

- **[S-001 (req cov)]** plan ステップ 6 に「adapter は log を直接呼ばず、throw 後の serializer 経路で sanitize 済み message が log される」と一文追加し、Issue 要件「log への混入も同時に sanitize」の解釈を明文化。
- **[S-002 (req cov)]** dispatcher は `maskSecrets()` のみ適用に確定（P-001 と同じ）。
- **[S-003 (req cov)]** テスト方針「人手確認」に「category prefix が UI に表示されること」を追加。
- **[S-001 (arch)]** ADR-001 の Consequences で d1 adapter の既存 import pattern を引用し、「将来の方向性確認の余地」を「既存パターンに整合」と明確化。
- **[S-003 (arch)]** ステップ 1 と 7 で「32 文字以上の連続英数記号列」マッチを取り下げ、「`sk-` / `AIza` 等の既知 provider prefix を持つ token」に限定。false positive 非対象（GUID、モデル名等）も fixed assertion で確保するよう追記。
- **[S-004 (arch)]** ADR-001 に補足セクションを追加し、`SanitizedErrorReason` は UI 表示用 prefix で `*ErrorCode` / `kind` とは別系統であると明示。
- **[S-005 (arch)]** 「リスクと注意点」に timeout/network 経路の `cause` チェーンが secret 漏洩リスクなしである結論を一文追加。

**見送った提案とその理由**:

- なし（全提案を取り込み）。

### 2周目

両視点とも「問題点ゼロ」で終了。新たな指摘なし、レビューループ完了。
