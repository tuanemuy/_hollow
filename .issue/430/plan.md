# 実装計画 — Issue #430: プロンプト設定の関心分離: #396 の残課題（P23 ユーザー画面の文言整合 / dead-input カード）

**Issue:** #430
**作成日:** 2026-06-03
**複雑度:** 中〜大規模

---

## 目的

#396（PR #429）で確立した「operator/user が触るのは『分析の意図（任意）』だけ、role 宣言・JSON 出力契約はシステム所有」という関心分離モデルを、admin 画面に閉じていた状態から #396 の残り2点に広げる。

1. **残課題1**: P23 ユーザー向けカスタムプロンプト画面（`identity/PromptsForm`）の UI 文言を「全文上書き」前提から「分析の指示（任意）／システム既定」モデルへ整合させる（振る舞いは #396 で既に追記モデル、文言のみ乖離）。
2. **残課題2**: admin の title/directory カードに operator が書いた意図がどこにも届かない dead-input を解消し、`buildStructureSystemPrompt` へ実際に反映して生きた入力にする（ユーザー選択方針: **(a) operator 意図を実際に反映**）。

## スコープ

### 含まれるもの
- `identity/PromptsForm/index.tsx` の文言整合（説明文・ラベル・バリデーションメッセージ・placeholder）
- `LLMStructureInput` への title/directory 意図フィールド追加
- `buildStructureSystemPrompt` での title/directory 意図の追記
- `runIngestionJob` の LLM 構造化分岐での title/directory resolve と伝播
- 上記に対応する単体・結合テストの追加/修正

### 含まれないもの
- **ocr_assist**: spec（`spec/domains/adminSettings.md:63`, `spec/scenario/admin.md:57`）で「ingestion 未参照だが将来プロビジョン」と明記済み。今回は title/directory のみ生きた入力にする。
- `UploadDialog` / `getEffectiveIngestionPrompts`: per-upload override は structure/metadata のみ。title/directory は per-upload override 経路がなく resolver 解決のみのため変更不要。
- port purpose 列挙（既に4値で title/directory を含む）・DTO・DB スキーマ・migration の変更（#396 の「型・スキーマ変更ゼロ」原則を踏襲、port 型への非永続フィールド追加に留める）。

## 実装ステップ

### 1. `LLMStructureInput` に意図フィールド追加

- **対象ファイル:** `app/core/domain/ingestion/ports/llmProvider.ts`
- **変更内容:** `prompt` の直後に `titlePrompt: string` と `directoryPrompt: string` を追加。JSDoc は既存 `prompt` と同一セマンティクス（operator の任意の追加意図、空文字＝意図なし、追記であり置換でない）を記述。`prompt` は structure 本体（HTML 化）の意図として残す。
- **理由:** title/directory の operator 意図を port 契約として表現。`IngestionPromptPurpose` は既に4値（`structure|title|directory|metadata`）なので resolver/port purpose の変更は不要。

### 2. `buildStructureSystemPrompt` で title/directory 意図を追記

- **対象ファイル:** `app/core/adapters/llm/prompts.ts`
- **変更内容:** 既存の `titleSuggestion` ガイダンス行の直後に `...operatorIntentSection(input.titlePrompt)`、`directoryGuidance` 行の直後に `...operatorIntentSection(input.directoryPrompt)` を挿入。`operatorIntentSection` と `OPERATOR_INTENT_LABEL` を再利用。
- **理由:** title/directory のシステムガイダンス行の近傍に operator 意図を置き「どの関心への補足か」を LLM に文脈付け。JSON 出力契約は引き続き末尾固定（システム所有・破壊不可）。3プロバイダ（anthropic/openai/gemini）は共通ビルダーを呼ぶため1箇所変更で全反映。

### 3. `runIngestionJob` で title/directory を resolve して渡す

- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`
- **変更内容:** LLM 構造化分岐（`structureToHtml` を呼ぶ `else` 枝）の中で title/directory を resolver 解決し、`structureToHtml` 呼び出しへ `titlePrompt`/`directoryPrompt` として渡す。
  - `const titlePrompt = await deps.promptResolver.resolveFor(deps.ownerId, "title")`
  - `const directoryPrompt = await deps.promptResolver.resolveFor(deps.ownerId, "directory")`
- **理由:** title/directory は LLM 構造化時のみ意味を持つ。per-upload override 対象外なので resolver 解決のみで十分。html/markdown 分岐では LLM を呼ばないので解決しない（不要 I/O 回避）。

### 4. P23 ユーザー画面の文言整合

- **対象ファイル:** `app/components/identity/PromptsForm/index.tsx`
- **変更内容:**
  - セクション説明（`:41-44`）「各用途のプロンプトを上書きできます。空のまま保存すると…」→ 「分析の意図を補足できます。空欄のままならシステム既定の動作が適用されます。」相当。
  - ラベル（`:147`）「あなたのプロンプト」→ 「あなたの分析の指示（任意）」（admin と概念一致しつつ所有ニュアンスを残す）。
  - バリデーションメッセージ（`:86`）「プロンプト本文を入力してください」→ 「分析の指示を入力してください（空にする場合は『デフォルトに戻す』を使用）」相当。空保存は reset 経路へ誘導。
  - placeholder（`:155`）`defaultPrompt.text` → 意図記入を促す固定文言。admin の `INTENT_PLACEHOLDER` に倣い、所有ニュアンス込みの**モジュール定数**として定義（例 `INTENT_PLACEHOLDER = "あなたの分析の意図を記入（空欄ならシステム既定の動作）"`）。defaultPrompt.text は `<details>デフォルトプロンプト</details>`（`:137-146`）で引き続き参照可能なので情報は失われない。
  - inheriting 説明（`:132-136`）は概念的に妥当なので維持または微調整に留める。
- **UX 機構は現状維持:** P23 は空 trim 時にバリデーションメッセージを出して保存をブロックする現行方式（エラー表示）を維持し、admin の「ボタン disable」方式へは寄せない。今回は文言整合がスコープで、入力機構の作り替えは含めない（[S-002] 検討の結論）。
- **理由:** 振る舞いは #396 で既に追記モデルだが、文言だけ全文上書き前提が残る乖離を解消。

### 5. テスト追加・修正

- **対象ファイル:** `app/core/adapters/llm/__tests__/prompts.test.ts`, `runIngestionJob` の結合テスト
- **変更内容:**
  - `prompts.test.ts`: `structureInput` ヘルパのデフォルトに `titlePrompt: ""`, `directoryPrompt: ""` を追加。これで**既存ケースは label が1回のまま不変**（structure の `prompt` のみ非空、title/directory 空）。
  - 新規ケースで title/directory 意図が非空のとき、対応ガイダンス行直後に追記されることを assert。**`OPERATOR_INTENT_LABEL` 単独の `indexOf` では非ユニークになり別の意図を掴むため使わない**。代わりに `` `${OPERATOR_INTENT_LABEL}\n${titleIntentText}` `` のように**ラベル＋本文の複合文字列**で各意図の存在・位置を識別する（既存の structure テストと同形式）。空文字時に出ないこと、JSON 出力契約 tail が維持されることも assert（[P-001] / [S-001] 対応）。
  - 結合テスト: LLM 構造化 kind で title/directory も `resolveFor` 呼びされ `structureToHtml` に伝播することを assert。`FakeLLMProvider` は `structureCalls` に入力全体を記録するため fake 改修は不要。
  - **必須フィールド追加（ADR-002）の型追従先**: `structureToHtml` を組む/呼ぶ箇所は anthropic / openai / gemini の各 adapter、`prompts.test.ts` の `structureInput` ヘルパ、結合テストの fake/stub、`runIngestionJob` の計6系統。必須 `string` 追加で型エラーになる箇所を漏れなく追従する（adapter は input を build に丸ごと渡すだけなので透過反映 = ロジック変更なし、ヘルパ/fake のみデフォルト追加）。
- **理由:** title/directory 意図の追記挙動と空文字セマンティクスをテストで固定。

### 6. 仕上げ

`pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test:unit` と該当結合テスト実行。

## 設計判断

詳細は `.issue/430/adr.md` 参照。要点:
- title/directory 意図フィールドは optional ではなく必須 `string`（`prompt` と一貫、空文字＝意図なし）。
- 空文字セマンティクスは既存 `operatorIntentSection` を再利用し3フィールドで完全統一。
- 追記位置は対応ガイダンス行の直後、JSON 出力契約は末尾固定。
- P23 文言は admin の流用ではなく所有ニュアンスを残す（概念は一致）。

## リスクと注意点

- 同一 `OPERATOR_INTENT_LABEL` がシステムプロンプト内に最大3回現れうる（structure/title/directory 意図がすべて非空のとき）。テストは `OPERATOR_INTENT_LABEL` 単独の `indexOf`/`lastIndexOf` ではなく **ラベル＋意図本文の複合文字列**で各意図を識別する（step5 参照）。
- **意図セクションの配置は非対称**: structure 意図（`input.prompt`）は役割宣言の直後・JSON 出力契約宣言の前に置く既存挙動を維持する一方、title/directory 意図は出力契約宣言**後**の対応ガイダンス行（titleSuggestion / directoryGuidance）の直後に置く。これは「どの関心への補足か」を文脈付けする意図的な選択で、`prompts.test` で配置を固定し、`prompts.ts` の JSDoc に一文残す（ADR-004）。
- `runIngestionJob` で resolver 呼び出しが2回増える（LLM 構造化 kind のみ）。軽量 lookup なので許容。html/markdown 分岐では呼ばないこと。
- `LLMStructureInput` の必須フィールド追加で fake/ヘルパが未設定だと型エラー（ガードとして機能）。全呼び出し側を追従。
- スコープ厳守: ocr_assist・UploadDialog・getEffectiveIngestionPrompts・port purpose・DTO・DB は変更しない。

## テスト方針

- 単体（`prompts.test.ts`）: title/directory 意図の追記有無・位置・出力契約維持を固定。
- 結合（runIngestionJob）: LLM 構造化 kind で title/directory が resolve・伝播することを確認。
- フロント（残課題1）: 文言変更のみで挙動不変。manual-test で P23 画面の表示文言を目視検証。
- 全体: `pnpm typecheck && pnpm lint:fix && pnpm format` 後 `pnpm test:unit` と結合テスト。

## レビュー履歴

### 1周目: 両視点ともほぼ実装可（要件カバレッジは問題点ゼロ）

**修正した点**:
- [P-001 / S-001(要件)] テスト assert を「`OPERATOR_INTENT_LABEL` 単独の `indexOf`」から「ラベル＋意図本文の複合文字列」での識別に具体化（step5・リスク欄）。既存ケースは空デフォルト追加で不変、新規複合ケースのみ複数出現を扱うと明記。

**取り込んだ改善提案**:
- [S-002(アーキ)] 意図セクションの非対称配置（structure は契約宣言の前、title/directory は契約宣言後のガイダンス行直後）を明示し、ADR-004 として JSDoc 注記を約束（リスク欄・adr.md）。
- [S-002(要件)] 必須フィールド追加の型追従先6系統を列挙（step5）。
- [S-003 両視点] placeholder をモジュール定数化し所有ニュアンス込みの具体文言案を提示（step4）。
- [S-002(アーキ・UX機構)] P23 のバリデーション機構は現状維持（エラー表示方式、ボタン disable には寄せない）と明記（step4）。

**見送った提案**: なし（全提案をスコープ内で取り込み or 方針確定）。

レビューループは1周で収束（要件は問題点ゼロ、アーキの P-001 は計画文の明確化で解消）。
