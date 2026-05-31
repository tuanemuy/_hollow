# Issue #358 — manual-test seed data

アップロードモーダルの「解決済み既定プロンプト」表示（structure / metadata の
カスタムプロンプト欄）をブラウザで動作確認するためのシード。`getEffectiveIngestionPromptsFn`
が `instance_settings.prompts_json` / `user_prompt_overrides.prompts_json` を読むだけで、
実アップロードや ingestion 実行は不要。

DB: ローカル D1 `hollow-local-d1`（`pnpm wrangler d1 execute hollow-local-d1 --local ...`）。
`pnpm db:execute:local -- <file>` は pnpm が `--` を吸収するため使わない。

## 1. ベースラインユーザーシード

`.manual-test/2026-05-17/seed.sql`（12 アカウント、`INSERT OR IGNORE`）を適用済み。
全アカウント共通: password `Password123!`、サインインは `/sign-in`。

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file=.manual-test/2026-05-17/seed.sql
```

確認結果（`SELECT id, email, role FROM users`）— 本テストで使うアカウント:

| 用途 | email | password | role | user_id |
|---|---|---|---|---|
| User A（member, 上書き対象） | `existing@example.com` | `Password123!` | `member` | `01938f00-0000-7000-8000-0000000000a1` |
| 上書きなし比較用（admin） | `admin@example.com` | `Password123!` | `admin` | `01938f00-0000-7000-8000-0000000000c1` |
| 上書きなし比較用（member） | `existing-new@example.com`（mailowner） | `Password123!` | `member` | `01938f00-0000-7000-8000-0000000000b1` |

スローアウェイ/事前状態アカウント（tc-* 等）も seed.sql に含まれるが本テストでは未使用。
詳細は `.manual-test/2026-05-17/seed-data.md` を参照。

## 2. prompts_json の正しい JSON 形状（コードで裏取り）

形状:

```json
{ "<purpose>": { "text": "<string>", "expectedVariables": ["<var>", ...] } }
```

`purpose` は `structure` / `metadata`（本機能の対象。他に title / directory / ocr_assist）。

裏取りしたコード:

- 読み取り（instance / override 両方）: `app/core/adapters/d1/promptResolver.ts`
  — `PromptsJson = Record<string, { text: string; expectedVariables?: readonly string[] }>`。
  resolver は `text` しか読まないので instance 側は緩い。
- override の rehydrate 経路（厳密）: `userPromptOverrideRepository.findByOwner`
  → `app/core/adapters/d1/repositories/userPromptOverrideRepository.ts` `toEntity`
  → `UserPromptOverride.reconstruct`
  → `app/core/domain/adminSettings/entity.ts` `rehydratePartialPrompts`
  → 各 present key で `PromptTemplate.create({ text, expectedVariables })`
  → `app/core/domain/adminSettings/valueObject.ts`。

### expectedVariables の要否

- **override（user_prompt_overrides）は厳密**。`rehydratePartialPrompts` は present な
  全 key を `PromptTemplate.create` に渡す。型上 `expectedVariables: readonly string[]`
  は必須。runtime では `new Set(undefined)` が空集合になるため undefined でも即死は
  しないが、**`expectedVariables: []` を明示する**のが正しい契約。
- **`text` に `{{var}}` プレースホルダを含めると、それが expectedVariables に無い場合
  `PromptTemplateVariableMismatch` で reconstruct が落ちる**（valueObject.ts L100-108）。
  本シードのテキストはプレースホルダを含めないので `expectedVariables: []` で安全。
- **instance_settings は緩い**（resolver が raw JSON を直接読む）。ただし将来 admin 設定
  画面が `InstanceSettings.reconstruct` 経由で読む可能性に備え、同じく
  `expectedVariables: []` + プレースホルダ無しで統一した。

`getEffectiveIngestionPrompts`（`app/core/application/ingestion/getEffectiveIngestionPrompts.ts`）
は override を `findByOwner` で rehydrate して `isUserOverride =
entry !== undefined && entry.text.length > 0` を導出し、text 自体は resolver で解決する。
本シード形状で rehydrate が落ちないことを D1 適用＋再適用で確認済み。

## 3. 作成した SQL ファイル

`.issue/358/manual-test/` に配置（適用は手動）。

### seed-prompts.sql（Phase 2: インスタンス既定 + ユーザー上書き）

- `instance_settings` singleton 行を `INSERT ... ON CONFLICT(id) DO UPDATE`。
  fresh DB（行なし）では NOT NULL 全カラム（llm_model, llm_api_key_source,
  limits_json, updated_at 等）と `id='singleton'` CHECK を満たす完全行を INSERT。
  既存行があれば prompts_json と updated_at だけ UPDATE（他カラム＝本番値を温存）。
  - structure: `これはテスト用のインスタンス既定 構造化プロンプトです`
  - metadata: `これはテスト用のインスタンス既定 メタデータプロンプトです`
- `user_prompt_overrides` に existing-user（`...a1`）の **structure のみ** を
  `INSERT ... ON CONFLICT(owner_id) DO UPDATE`。
  - structure: `これはテスト用の existing-user ユーザー上書き 構造化プロンプトです`
  - metadata は意図的に未設定（→ インスタンス既定にフォールバック）。

### cleanup-prompts.sql（Phase 1 へ戻す）

- `instance_settings.prompts_json` を `'{}'` に UPDATE（singleton 行は残す＝本番安全）。
- existing-user の override 行を DELETE。
- 行ごと消したい場合の `DELETE FROM instance_settings WHERE id='singleton';` も
  コメントで明記。

### 各状態で誰が何を見るか

| フェーズ | DB 状態 | サインインユーザー | structure 表示 | metadata 表示 |
|---|---|---|---|---|
| **Phase 1 空フォールバック** | instance_settings 行なし or prompts_json='{}'、override なし | 任意（例: existing@example.com / admin@example.com） | プロバイダ組み込み（「LLM プロバイダの既定指示を使用」） | プロバイダ組み込み |
| **Phase 2 インスタンス既定** | seed-prompts.sql 適用後、上書きを持たないユーザー | `admin@example.com` または `existing-new@example.com` | インスタンス既定 + 上記テキスト | インスタンス既定 + 上記テキスト |
| **Phase 2 ユーザー上書き** | seed-prompts.sql 適用後、existing-user | `existing@example.com` | ユーザー設定で上書き中 + 上書きテキスト | インスタンス既定 + 既定テキスト |

UI のバッジ文言は `app/components/ingestion/UploadDialog.tsx`（`isUserOverride`
→「ユーザー設定で上書き中」、text 非空 →「インスタンス既定」、空 →「プロバイダ組み込み」、
`BUILTIN_PROMPT_FALLBACK_COPY = "LLM プロバイダの既定指示を使用"`）に対応。

## 4. 現在の DB 状態（Phase 1 再現可否）

**Phase 1（空フォールバック）を今すぐ再現できる。** 検証手順の後、検証で作った
singleton 行も削除して pristine 状態へ戻してある:

- `instance_settings`: 0 行
- `user_prompt_overrides`: 0 行
- ベースラインユーザー: 投入済み（existing@example.com, admin@example.com ほか）

→ サインインしてアップロードモーダルを開き accordion を展開すれば、structure /
metadata とも「プロバイダ組み込み」「LLM プロバイダの既定指示を使用」が出る。

Phase 2 をテストするとき:

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file=.issue/358/manual-test/seed-prompts.sql
# ... テスト ...
pnpm wrangler d1 execute hollow-local-d1 --local --file=.issue/358/manual-test/cleanup-prompts.sql
```

## 5. テストアカウント早見

| role | email | password | user_id |
|---|---|---|---|
| member（User A / 上書き対象） | `existing@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000a1` |
| member（上書きなし） | `existing-new@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000b1` |
| admin（上書きなし） | `admin@example.com` | `Password123!` | `01938f00-0000-7000-8000-0000000000c1` |

## 6. 問題と対処

- **pnpm db:execute:local の `--` 吸収**: 既知。`pnpm wrangler d1 execute hollow-local-d1
  --local --file=<path>` を直接使用した。
- **seed-data.md（2026-05-17）の DB 名表記**: ドキュメントには
  `tanstack-start-template-d1` と書かれているが、`wrangler.toml` の現行
  `database_name` は `hollow-local-d1`。本テストは後者を使用（実 DB に投入済みを確認）。
- **冪等性**: seed-prompts.sql / cleanup-prompts.sql とも 2 回連続適用してエラー無しを確認
  （`ON CONFLICT` / `UPDATE` / `DELETE` ベース）。
- **override rehydrate の落とし穴回避**: テキストに `{{}}` を含めず `expectedVariables: []`
  を明示することで `PromptTemplate.create` の variable-mismatch / invalid-name 検証を回避。
  D1 へ実適用し reconstruct 経路が通ることを確認済み。
- **本番データ保護**: instance_settings は `ON CONFLICT DO UPDATE` で prompts_json /
  updated_at のみ更新（既存行の他カラムは温存）。cleanup は singleton 行を残し
  prompts_json を '{}' に戻すのみ。INSERT する値はすべて「テスト用」と明示した識別可能文言。
