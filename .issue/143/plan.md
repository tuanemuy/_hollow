# 実装計画 — Issue #143: feat(admin/llm): surface env override state in UI (read-only fields + lock badge)

**Issue:** #143
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

Issue #101 (PR #138) で実装した env override > DB resolution > Stub fallback の優先順位 (ADR-007) を admin UI に反映する。具体的には `ADMIN_LLM_PROVIDER` / `ADMIN_LLM_MODEL` / `ADMIN_LLM_API_KEY` / `ADMIN_LLM_BASE_URL` のうち env で set されている項目を `/admin/llm` 上で lock 表示し、save 経路でも env 値を保持する。あわせて `.dev.vars.example` を 3 provider 対応に書き換える。

## スコープ

### 含まれるもの

- `AdminSettingsEnv` 型を 4 field（apiKey / provider / model / baseURL）に拡張
- DI (`serverCloudflare`) で `ADMIN_LLM_BASE_URL` を含めた 4 env を threaded
- `InstanceSettingsDTO.llm.envOverrides` を boolean 4 つで追加
- DTO の provider/model/baseURL 表示値を env 由来現値で上書き（DB 値ではなく実行時の有効値）
- view 関数で env を参照、`getInstanceSettings` で env を view に渡す
- `updateLLMConfig` usecase で env override 項目を silent skip
- admin UI (`LLMSettingsForm/index.tsx`) で disabled / lock badge / banner / 保存ボタン抑制
- `.dev.vars.example` を Issue 本文のテンプレートで書き換え（3 provider 対応 + ペア設定例）
- 既存 test fixture / helper の追従と新規テスト追加

### 含まれないもの

- consumer 側 `resolveConsumerLlmConfig` のロジック変更（実行時挙動は既に正しい）
- transport schema (`updateLLMConfigSchema`) の緩和（silent skip 方針なので strict のまま）
- domain 層への env reconcile 関数追加（env はインフラ runtime config であり domain invariant ではない）
- `AdminSettingsService.assertEnvOverride` のシグネチャ拡張（apiKey 専用のまま据え置き、provider/model/baseURL の reconcile は usecase 層で別途実装）

## 実装ステップ

### 1. `AdminSettingsEnv` 型を 4 field に拡張

- **対象ファイル:** `app/core/application/di/types.ts`
- **変更内容:**
  ```ts
  export type AdminSettingsEnv = Readonly<{
    apiKey: string | null;
    provider: string | null;
    model: string | null;
    baseURL: string | null;
  }>;
  ```
- **理由:** env override の各 field を application 層から観測する単一窓口にする。`null` は env 未設定、非 null は env 値（空文字判定は `length > 0`、trim しない — consumer 経路 `resolveConsumerLlmConfig` line 680 の `envBaseURL.length > 0` と完全一致させる）。

### 2. DI で `ADMIN_LLM_*` 全 4 env を `adminSettingsEnv` に threaded

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`
- **変更内容:**
  - `RequestServerConfig` に `adminLlmBaseUrl?: string` を追加
  - `readRequestServerConfig` で `env.ADMIN_LLM_BASE_URL` を spread
  - `createRequestContainer` の destructuring で受け取り、`adminSettingsEnv` 初期化を 4 field に拡張（各 field とも `value !== undefined && value.length > 0 ? value : null` で判定 — consumer 経路と semantics 一致）
- **理由:** presentation 層が DTO 経由で env 状態を観測できるようにする唯一の経路。

### 3. `InstanceSettingsDTO.llm.envOverrides` を追加

- **対象ファイル:** `app/core/application/dto/adminSettings.ts`
- **変更内容:**
  - `InstanceSettingsDTO.llm` に `envOverrides: Readonly<{ provider: boolean; model: boolean; apiKey: boolean; baseURL: boolean }>` を追加
  - DTO の provider/model/baseURL は env 由来現値で上書き
  - apiKey の実値は絶対に DTO に流さない（boolean のみ）
- **理由:** UI が lock badge / disabled / env 由来現値を描画するための単一データソース。

### 4. view 関数で env を参照

- **対象ファイル:** `app/core/application/adminSettings/view.ts`
- **変更内容:**
  - `toInstanceSettingsView(settings, env: AdminSettingsEnv)` に signature 拡張
  - `envOverrides` の 4 boolean を env の各 field が非 null かつ非空文字列かで判定
  - env 由来の現値を DTO に流し込む（provider/model/baseURL）
  - env override 時 `apiKeyMasked` は `null` を返す（既存挙動踏襲）
- **理由:** env override の有無判定を application 層に閉じ込め、presentation には判定済み boolean だけを露出。

### 5. `getInstanceSettings` usecase が env を view に渡す

- **対象ファイル:** `app/core/application/adminSettings/getInstanceSettings.ts`
- **変更内容:** `toInstanceSettingsView(settings, container.adminSettingsEnv)` を呼ぶ
- **理由:** env 情報を usecase 層で view に注入する経路を確立。

### 6. transport schema は無変更

- **対象ファイル:** `app/components/admin/schema.ts` — 触らない
- **理由:** silent skip 方針なら schema を緩める必要はなく、strict のままで non-admin 経路の安全性を保つ。

### 7. `updateLLMConfig` usecase で env override 項目を silent skip

- **対象ファイル:** `app/core/application/adminSettings/updateLLMConfig.ts`
- **変更内容:**
  - usecase 冒頭で `container.adminSettingsEnv` を読み、env override されている field については **DB の現状を維持**（input の値も env の値も DB には書き込まない — `current.llm.<field>` を採用して既存値を保つ）
  - 既存 `AdminSettingsService.assertEnvOverride`（apiKey 専用）は据え置き、provider/model/baseURL の silent reconcile は usecase 層で実施
  - apiKey は既存 `assertEnvOverride` 任せ（encrypt → drop の冗長計算は許容、コード構造シンプル化を優先）
  - `providerChanged` は env override 時 false 扱い（env で固定された provider は変更不可、apiKey 再入力強制も skip）
  - silent skip した field は `logger.warn` で監査ログ。payload は `{ event: "admin_llm_env_override_skip", fields: ["provider", "model", "baseURL"] }` 形式（env 値そのものは log に出さず field 名だけ）
- **理由:** UI 側で disabled + submit 除外しているが、万一直接 POST されても env > DB の優先順位と一貫させたい。reject ではなく無視が semantic に正しい。「DB の現状維持」方針は ADR-005 を参照。

### 8. admin UI で envOverrides に応じた lock 表示

- **対象ファイル:** `app/components/admin/LLMSettingsForm/index.tsx`
- **変更内容:**
  - props で受け取った `settings.llm.envOverrides` を各 field の `disabled` 判定に使う
  - env override field に `<input disabled>` または `<select disabled>` + 「環境変数で固定中」バッジ + hint テキスト
  - `disabled` 属性により HTML 仕様で自動的に formData から除外される（明示的な JS 除外ロジックは不要）。`readOnly` ではなく `disabled` を統一採用
  - 4 field 全部 override の場合は上部に banner + 保存ボタン `disabled`
  - provider 変更時の警告ロジックは env override 時 dead code 化
  - `apiKeyRequired` 判定は `providerChanged && !envOverrides.apiKey` で env override 時の必須化を抑制
  - `data-*` attribute pattern（CLAUDE.md styling 規約）に従う
  - 保存成功時のトースト/フィードバックは既存パターン踏襲。env override 中の hint は常時表示しているので submit 後も「DB の env override 項目だけ変わっていない」状態は UI 上明示済み
- **理由:** 受け入れ基準 1-4 を満たす。

### 9. `.dev.vars.example` を 3 provider 対応に更新

- **対象ファイル:** `.dev.vars.example`
- **変更内容:** Issue 本文「実装スケッチ § 4」のテンプレートをそのまま反映
  - セクションヘッダ `# --- LLM provider env override`
  - Anthropic / OpenAI / Gemini の API key 形式説明
  - provider 切替ペア設定例 4 種（Anthropic / OpenAI 本家 / Groq / Gemini）
- **理由:** 受け入れ基準「`.dev.vars.example` が 3 provider 対応に書き換えられている」。

### 10. 既存 test fixture / helper の追従

- **対象ファイル:**
  - `app/core/application/__tests__/helpers.ts` line 123 — `adminSettingsEnv: { apiKey: null }` を 4 field に
  - `app/core/adapters/d1/__tests__/helpers.ts` line 116 — 同上
  - `app/core/application/di/__tests__/serverCloudflare.test.ts` — assertion を 4 field に拡張
  - `app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` — `adminSettingsEnv: { apiKey: ... }` 出現箇所を 4 field に
  - `app/core/application/adminSettings/__tests__/view.test.ts` — `toInstanceSettingsView` signature 変更に追従
  - その他 `adminSettingsEnv` を渡している箇所を `grep -rn "adminSettingsEnv:" app/` で確認して機械的に追従
- **理由:** 型変更の機械的追従。`AdminSettingsEnv` を 4 field 化すると TypeScript の structural type check で漏れが捕まる前提。

### 11. 新規テスト追加

- `view.test.ts`: env override 4 パターン（all off / partial / all on / apiKey のみ）の `envOverrides` boolean と env 由来現値の DTO 出力を検証
- `adminSettings.integration.test.ts`: env override 状態で `updateLLMConfig` の env 項目が silent skip され DB の既存値を保つことを確認（受け入れ基準 3 の最終防衛線）
- `LLMSettingsForm`: 既存テストファイルがあれば envOverrides=true で input disabled / banner 表示 / `disabled` 属性で formData 除外を追加（UI 側の防御）

## 設計判断

詳細は `.issue/143/adr.md` を参照。

- **ADR-001**: env override 項目への save 受信は silent skip（案 A）。reject せず env 値を保持。
- **ADR-002**: `AdminSettingsEnv` の env presence 判定は `value.length > 0`（trim しない、consumer 経路と完全一致）
- **ADR-003**: DTO の provider/model/baseURL は env 由来現値で上書き（Issue 要件「表示値は env 由来の現値」）
- **ADR-004**: env reconcile は application 層完結（domain には追加しない）
- **ADR-005**: silent skip 時の DB 書き込み方針は「DB の現状維持」（input も env 値も DB に書かない）
- **ADR-006**: UI の `disabled` 属性で HTML 仕様の formData 除外を活用、`readOnly` ではなく `disabled` を統一採用

## リスクと注意点

- **DTO 後方互換**: `envOverrides` を新規 required field として追加するため、`InstanceSettingsDTO.llm` 消費箇所を grep で要確認
- **`AdminSettingsEnv` 型変更の波及**: 7 箇所程度の test fixture / DI threading の機械的追従が必要。型エラーで全部捕まるはず
- **API key boolean 化**: env 由来の API key 文字列を絶対に DTO に流さない不変条件を維持
- **provider 変更 × env override**: env で provider 固定時に `ProviderChangedRequiresApiKey` が dead code 化する分岐を usecase 側で抑制
- **consumer 経路は無変更**: `resolveConsumerLlmConfig` の実行時挙動は不変

## テスト方針

### Unit (vitest)
- `view.test.ts`: env override boolean 出力 + env 由来現値の DTO 反映
- `serverCloudflare.test.ts`: 4 env の all / partial / unset 3 ケースで `adminSettingsEnv` 組立
- `adminSettings.integration.test.ts`: silent skip 挙動

### Manual (manual-test スキル or 手動)
- `/admin/llm` を 4 ケース（all unset / 1 field set / all 4 set / apiKey のみ set）で表示確認
- env override 含めて submit → DB の env 項目が更新されないことを D1 で確認
- env 値変更 → 再起動 → UI 表示値が追従

### Typecheck / lint
- `pnpm typecheck && pnpm lint:fix && pnpm format`

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点（P）**:
- **P-001（アーキ）**: step 10 の test fixture パスを修正。実在パスは `app/core/application/__tests__/helpers.ts:123` と `app/core/adapters/d1/__tests__/helpers.ts:116`。`app/core/application/di/__tests__/helpers.ts` という想定パスは存在しない。`grep -rn "adminSettingsEnv:"` での全件洗い出しも明記
- **P-002（アーキ）**: ADR-002 の baseURL semantics を consumer 経路 (`envBaseURL.length > 0`) と一致させた。trim 不要、4 field 共通で `value.length > 0` 判定に統一

**取り込んだ改善提案（S）**:
- **S-001（カバレッジ）**: テスト方針に「`disabled` 属性で formData 除外」の UI 側防御テストを明記（step 11）
- **S-001（アーキ）**: step 7 の `providerChanged` 抑制を「DB の現状維持（`current.llm.<field>` 採用）」と明確化し ADR-005 として記録
- **S-002（アーキ）**: apiKey は既存 `assertEnvOverride` 任せで encrypt → drop の冗長計算を許容することを step 7 に明記
- **S-003（アーキ）**: step 8 を `disabled` 統一採用に修正（`readOnly` 不採用）、ADR-006 として記録
- **S-004（アーキ）**: `logger.warn` の payload shape を step 7 に明記（env 値そのものは出さず field 名のみ）
- **S-006（アーキ）**: `apiKeyRequired` 判定を `providerChanged && !envOverrides.apiKey` に調整、step 8 に追記

**見送った提案とその理由**:
- **S-002（カバレッジ）**: 保存後のトースト挙動の明示 — env override の hint は常時表示しているため UI 上の挙動は自明。実装で標準パターン踏襲することは step 8 に明記済みなので追加 ADR は過剰
- **S-005（アーキ）**: `testLLMConnection` の env override 中挙動 — Issue 範囲外。env override 中の draft test は form の current snapshot を使う既存挙動で問題なく、env rotation の即時反映は別 Issue で扱うのが妥当

### 2周目（要件カバレッジ / アーキ・リスク 並列）

両視点とも問題点ゼロ・改善提案なし・APPROVED で終了。1周目の指摘反映は実コード grep（`adminSettingsEnv` 9 箇所、`serverCloudflare.ts:680` の length 判定）と内容照合で確認済み。実装フェーズへ移行可。
