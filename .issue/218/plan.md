# 実装計画 — Issue #218: 管理画面：プロンプト・デザイントークンを「デフォルト上書き」モデルにしてリセット可能にする

**Issue:** #218
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

管理画面のプロンプト・デザイントークン編集を「システム既定値 + ユーザー上書き」モデルに整え、既定の可視化・項目/全体リセット・確認モーダルにより試行錯誤を可逆にする。あわせて、既存の `PromptPurpose` 列挙が UI と domain で割れている既存バグも本 Issue 範囲内で揃える。

## スコープ

### 含まれるもの

- **PromptPurpose の SSOT 整合（既存バグ修正）**: UI 用 ID（`ingestion_structuring` / `title_generation` / `directory_suggestion`）を domain 列挙（`structure` / `title` / `directory` / `metadata` / `ocr_assist`）に揃える。`spec/domains/adminSettings.md` の 5 値を SSOT とする。`scenario/admin.md`・`manual-tests/admin.md` の記述（3 種）を 5 種に更新。
- **プロンプト集約のセマンティクス変更**: `Prompts` 型を `Readonly<Record<PromptPurpose, PromptTemplate>>` から `Readonly<Partial<Record<PromptPurpose, PromptTemplate>>>` に変える。**キー存在 = 上書きあり / キー欠落 = 既定継承**。`UserPromptOverride` 側と同型のセマンティクスに揃え、`text === ""` の二義性（明示空 vs 未上書き）を排除する。
- **ドメイン操作の追加**: `InstanceSettings.resetPrompt(settings, purpose, now)`（キー削除）／`InstanceSettings.resetAllPrompts(settings, now)`（map を空に）。`resetDesignTokens` は既存据置。
- **ユースケース**: `ResetPromptTemplate`（単項目）／`ResetAllPromptTemplates`（全項目）を追加。`ResetDesignTokens` は既存。
- **DTO 拡張（最小）**: `InstanceSettingsDTO.prompts[purpose]` に `isOverridden: boolean` を追加。`promptDefaults: Record<PromptPurpose, { text: string; expectedVariables: readonly string[] }>` を `view.ts` で `BUILTIN_PROMPT_DEFAULTS` から埋め込む。
- **既定値 SSOT（プロンプトのみ）**: `app/core/domain/adminSettings/defaults.ts` に `BUILTIN_PROMPT_DEFAULTS` を新規。**text は空文字を保持**（= ingestion パイプラインで「LLM プロバイダの既定指示にフォールバック」する契約と一致）。UI 表示用の補足説明（descriptor）はプレゼン層に置く。
- **デザイントークン**: 上書きキー単位の編集・行削除（=リセット）に絞る。全リセットは確認モーダル経由。**`BUILTIN_DESIGN_TOKENS` の SSOT 化は行わない**（CLAUDE.md で `app/styles/tokens.css` が SSOT と明示されているため、二重化を避ける）。UI placeholder には key 名のみのヒント。
- **プレゼン層**: `PromptsForm` を 5 purpose に拡張、「上書き中」バッジ、項目／全リセット（ConfirmDialog 経由）。`DesignTokensForm` に行リセット、全リセットモーダル化。
- **`ConfirmDialog` 再利用**: `app/components/common/ConfirmDialog.tsx` が既存。新規作成しない。
- **`promptResolver` 契約は維持**: 「user override → instance override（テキストが存在するキー）→ 空文字」のフォールバックを維持。空文字 = LLM プロバイダ既定指示にフォールバックする契約を壊さない。
- **spec 反映**: `spec/domains/adminSettings.md`／`spec/usecases/adminSettings.md`／`spec/pages/index.md`（P42/P43）／`spec/scenario/admin.md`（I2/I3）／`spec/manual-tests/admin.md`（TC-I2/I3）。

### 含まれないもの

- LLM 設定画面（env 優先の既存表現で「現在値」が明確）、登録制御画面（二値トグルで既定が自明）への横展開。
- `UserPromptOverride` 編集画面（P23）の改修。**ただし** 「インスタンスデフォルト継承中」の表示文言が本 Issue の `Partial<Record<>>` 化により意味が変わるため、文言レビューだけ実施（コード変更を伴わない場合あり）。
- DB スキーマ変更。既存 `prompts_json` の互換性は **リハイドレート時の正規化**（後述）で吸収する。
- ingestion パイプラインへの挙動影響（`promptResolver` 契約は据置）。

---

## 調査結果

### 関連ファイルと役割

- `app/core/domain/adminSettings/entity.ts` — `InstanceSettings` 集約。`defaultPrompts()` は現状「全 5 purpose を空文字 `PromptTemplate` で埋めた full map」を返す。`updatePrompt` / `updateDesignTokens` / `resetDesignTokens` を提供。
- `app/core/domain/adminSettings/valueObject.ts` — `PROMPT_PURPOSES = ["structure", "title", "directory", "metadata", "ocr_assist"]`。`PromptTemplate.create` は **空文字を許容**。
- `app/core/domain/ingestion/ports/promptResolver.ts` — `IngestionPromptPurpose = "structure" | "title" | "directory" | "metadata"`（4 値、`ocr_assist` 含まず）。本 Issue 関心外。
- `app/core/application/adminSettings/{updatePromptTemplate,updateDesignTokens,resetDesignTokens,getInstanceSettings,view,getInstancePromptDefaults}.ts` — ユースケース／DTO 射影。
- `app/core/application/dto/adminSettings.ts` — `InstanceSettingsDTO` `PromptDTO`。
- `app/core/adapters/d1/repositories/instanceSettingsRepository.ts` — JSON 列 `prompts_json` / `design_tokens_json` に永続化。空マップ保存可能。
- `app/core/adapters/d1/promptResolver.ts` — JSDoc に「empty-string = LLM プロバイダ既定指示にフォールバックする合図」と明文化された ingestion 用契約。**本 Issue では契約据置**。
- `app/components/admin/PromptsForm/index.tsx` — 既存バグ箇所。`PROMPT_DESCRIPTORS` の purpose ID が domain enum と不一致。
- `app/components/admin/DesignTokensForm/index.tsx` — 全リセットあり・確認モーダルなし、行単位リセットなし。
- `app/components/common/ConfirmDialog.tsx` — 既存の汎用確認モーダル。

### あるべき姿（spec から）

- `spec/scenario/admin.md` I2/I3 はユーザー上書きと「リセットで初期値に戻せる」を明文化。
- `spec/usecases/adminSettings.md` には `ResetDesignTokens` のみ記載。**プロンプトのリセット系は未定義**であり本 Issue で追加。
- `spec/domains/adminSettings.md` の `PromptPurpose` 5 値が SSOT。UI 側 3 値は spec から逸脱しており、本 Issue で寄せる。

### 既存実装の理想形との一致／乖離

- `UserPromptOverride` は既に `Partial<Record<>>` 相当のセマンティクスを持つ。**インスタンス側だけが「full map + 空文字」表現になっている**ため、本 Issue でセマンティクスを揃える。
- ingestion で実際に使うのは `IngestionPromptPurpose`（4 値）。`ocr_assist` は domain enum に含まれるが ingestion port 上は別枠（今後 OCR 機能で参照される可能性のあるプロビジョン）。本 Issue では 5 値全て admin 画面で扱えるようにするが、descriptor の表記は spec/scenario/admin.md を更新して 5 種に揃える。

---

## 実装ステップ

### 1. ドメイン: 既定値 SSOT を切り出す（プロンプトのみ）

- **対象:** `app/core/domain/adminSettings/defaults.ts`（新規）／`entity.ts`
- **変更:** `BUILTIN_PROMPT_DEFAULTS: Readonly<Record<PromptPurpose, { text: string; expectedVariables: readonly string[] }>>` を export。`text` は空文字（= LLM プロバイダ既定指示にフォールバック）、`expectedVariables` は **空配列を維持**（既存 `defaultPrompts()` と同じ最小セット）。`entity.ts` の `defaultPrompts()` は **新規モデルでは不要**（空 `Partial` map が既定）になるため、`InstanceSettings.default()` で `prompts: {}` を返すように整理。
- **理由:** 既定値 SSOT を 1 ファイルに固定。プロンプトの「既定 = 空文字 = LLM プロバイダ既定指示」を `view.ts` の DTO 射影に流し込みつつ、ingestion 側の契約（空文字フォールバック）と整合させる。**`BUILTIN_DESIGN_TOKENS` は作らない**（`tokens.css` SSOT を尊重）。expectedVariables を空配列維持することで `PromptTemplate.create` の placeholder ↔ expected mismatch チェックに変化を持ち込まない（S-002）。

### 2. ドメイン: `Prompts` 型を `Partial<Record<>>` に変更 + rehydrate も Partial 化

- **対象:** `app/core/domain/adminSettings/{valueObject.ts,entity.ts}`
- **変更:**
  - `Prompts` 型を `Readonly<Partial<Record<PromptPurpose, PromptTemplate>>>` に変更（valueObject.ts に型 alias を導入）。
  - `InstanceSettings.default()` の `prompts: {}` を返す。
  - `InstanceSettings.updatePrompt(settings, purpose, template, now)`: 引数 `template` は **非空文字を前提**（後段ユースケース層で空文字を reset 分岐へルーティング、ADR-006 を参照）。`{ ...settings.prompts, [purpose]: template }` を返す。
  - `InstanceSettings.resetPrompt(settings, purpose, now)`: `Object.fromEntries(Object.entries(settings.prompts).filter(([k]) => k !== purpose))` 相当でキーを削除。
  - `InstanceSettings.resetAllPrompts(settings, now)`: `prompts: {}` に置換。
  - **`rehydratePrompts` を Partial に書き換え**: `UserPromptOverride` 側の `rehydratePartialPrompts`（entity.ts L277-292）と同型に。raw に存在するキーで `text === ""` のものは map に含めない（= 旧 full-map + 空文字データを Partial へ移行）。raw に無いキーも当然キー無し。
- **理由:** キー存在 = 上書き / 欠落 = 既定継承で `isOverridden` を曖昧さなく判定。`UserPromptOverride` と同型のセマンティクス。互換性ロジックをドメインの責務に集約し、アダプタは raw を素のまま渡すだけにする（DDD 原則と整合）。

### 3. アダプタ: rehydrate に raw を渡すだけ（追加正規化なし）

- **対象:** `app/core/adapters/d1/repositories/instanceSettingsRepository.ts`
- **変更:** 読み込みは raw をそのまま `InstanceSettings.reconstruct` に渡し、ドメイン側 `rehydratePrompts` で Partial 化する。書き込みは `Partial<Record<>>` をそのまま JSON 化（不要キーは出力しない）。
- **理由:** ADR-004 の通り、Partial 化セマンティクスはドメインに帰属。アダプタの責務はテーブル↔オブジェクトの直訳に留める。マイグレーション不要で透過的に新セマンティクスへ移行。

### 4. ドメイン: テスト追加・更新

- **対象:** `app/core/domain/adminSettings/__tests__/entity.test.ts`
- **変更:** `resetPrompt` / `resetAllPrompts` / `updatePrompt` の境界（空文字 → キー削除、非空 → キー追加）。

### 5. ユースケース: プロンプトリセット 2 種を追加 + `updatePromptTemplate` の空文字ルーティング

- **対象:** `app/core/application/adminSettings/{resetPromptTemplate.ts,resetAllPromptTemplates.ts}`（新規）／`updatePromptTemplate.ts`（更新）／`index.ts`
- **変更:**
  - `resetPromptTemplate` / `resetAllPromptTemplates`: 既存 `updatePromptTemplate.ts` を雛形に、admin チェック → UoW → 集約取得 → `InstanceSettings.resetPrompt(All)` → save。
  - `updatePromptTemplate.ts`: 入力 `template.text` が空文字なら **`resetPromptTemplate` と等価に動かす**（内部で `resetPrompt` を呼ぶ）。これにより、ドメイン `updatePrompt` は常に「非空テンプレートを上書き」と読める（ADR-006）。
- **理由:** illegal states unrepresentable の原則。空 = 削除のセマンティクスをユースケース層で吸収し、ドメイン操作の名前と動作のズレを排除。spec/usecases にリセット操作を明文化。

### 6. ユースケース/DTO: 「現在値・上書き状態・既定」を露出 + `getInstancePromptDefaults` の互換維持

- **対象:** `app/core/application/dto/adminSettings.ts` / `view.ts` / `getInstanceSettings.ts` / `getInstancePromptDefaults.ts`
- **変更:**
  - `PromptDTO` に `isOverridden: boolean` を追加。
  - `InstanceSettingsDTO` に `promptDefaults: Record<PromptPurpose, { text: string; expectedVariables: readonly string[] }>` を追加（`BUILTIN_PROMPT_DEFAULTS` を埋め込む）。
  - `toInstanceSettingsView(settings)` で 全 purpose を走査し、`settings.prompts[purpose]` が存在すれば `{ ...override, isOverridden: true }`、欠落していれば `{ ...BUILTIN_PROMPT_DEFAULTS[purpose], isOverridden: false }` を返す。
  - **`getInstancePromptDefaults` の互換維持**: 既存返却 DTO（`defaults: Record<string, PromptDTO>`）の意味を保つため、ユースケース内で `settings.prompts` に存在するキーは override 値、欠落キーは `BUILTIN_PROMPT_DEFAULTS` で穴埋めして「全 5 purpose 揃った map」を返す。これにより `P23`（UserPromptOverride 編集画面）のクライアントは触らずに済む。
- **理由:** UI が単一の DTO で「現在値・既定値・上書き状態」を表示できる。`getInstancePromptDefaults` の API 互換性を保つことで P23 を改修スコープから外せる。

### 7. プレゼン: PromptsForm 改修

- **対象:** `app/components/admin/PromptsForm/{index.tsx,action.ts}`
- **変更:**
  - `PROMPT_DESCRIPTORS` を **5 purpose（structure/title/directory/metadata/ocr_assist）に揃える**。各 descriptor に「タイトル・説明文・期待変数」を持たせる（説明文は UI 文言、descriptor は presentation 層 SSOT）。
  - 各カードに `isOverridden` でバッジ（"上書き中"）、未上書き時は「既定値: LLM プロバイダの既定指示を使用」のヒント文を表示。`placeholder` は `promptDefaults[purpose].text` または「（プロバイダ既定指示）」のラベル。
  - 「この項目をリセット」ボタン → `resetPromptTemplateFn(purpose)` server action（`isOverridden=false` 時は disable または非表示）。
  - 「全プロンプトをリセット」ボタン → `ConfirmDialog` 経由 → `resetAllPromptTemplatesFn()`。
  - **保存ボタンの disabled 条件**: 既存の `text.trim().length === 0` 維持（空文字での明示保存は別ボタン「リセット」経由とし、保存系統と reset 系統の UI 分離を保つ）。
  - server action（`action.ts`）に reset 系を追加し、エラー契約・validateSearch/inputValidator を既存に倣う。
- **理由:** Issue 完了条件「各項目に既定値が見える / リセットできる」「全リセット確認モーダル」を満たす。S-001 / S-004 を反映。

### 8. プレゼン: DesignTokensForm 改修

- **対象:** `app/components/admin/DesignTokensForm/{index.tsx,action.ts}`
- **変更:**
  - 行ごとに「この上書きを削除（既定に戻す）」ボタンを追加。クリックで該当行を map から削除して save。
  - 既存「全リセット」を `ConfirmDialog` 経由に変更。
  - 「上書きあり」セクションのみを表示し、「既定値一覧」は表示しない（`tokens.css` SSOT との整合）。Issue の完了条件「既定値が見える」は「上書きキーの行に placeholder で key 名を出す + spec/design/tokens.md へのリンクを補助テキストで提示」で満たす。
- **理由:** 「上書き = 行がある / リセット = 行削除」を一貫させ、`BUILTIN_DESIGN_TOKENS` の二重 SSOT 化を回避。

### 9. spec / マニュアルテスト反映

- **対象:** `spec/domains/adminSettings.md`／`spec/usecases/adminSettings.md`／`spec/pages/index.md`（P42/P43）／`spec/scenario/admin.md`（I2/I3 を 5 purpose に拡張、リセット手順追加）／`spec/manual-tests/admin.md`（TC-I2/I3 をリセット系に更新／追加）
- **変更:**
  - `PromptPurpose` SSOT は domain 5 値であることを明記。
  - 「上書きモデル（キー存在 = 上書き / 欠落 = 既定継承）」を明示。
  - 既定値 SSOT: プロンプト → `domain/adminSettings/defaults.ts`、デザイントークン → `app/styles/tokens.css`（CLAUDE.md と一致）。
  - リセット系ユースケースを `spec/usecases/adminSettings.md` に追記。
  - `UserPromptOverride` 画面（P23）の「継承中」文言が「インスタンスに上書きがあればそれ、なければ builtin（空= LLM プロバイダ既定）」を意味することを spec で明文化（コード変更は不要）。
- **理由:** Issue 完了条件、および UI/domain/spec の三者整合。

### 10. ユースケースのテスト

- **対象:** `app/core/application/adminSettings/__tests__/{resetPromptTemplate,resetAllPromptTemplates}.test.ts`（新規）、`view.test.ts`（`isOverridden` / `promptDefaults` の射影）、`updatePromptTemplate.test.ts`（空文字入力時の reset ルーティング検証を追加）
- **変更:** admin 権限・UoW・保存内容・DTO 射影を検証。rehydrate 正規化はドメイン責務に集約したため、テストも `app/core/domain/adminSettings/__tests__/entity.test.ts` に統一（リポジトリ単体テストでの重複を避ける、S-003）。

---

## 設計判断（adr.md に詳細）

- **ADR-001**: `Prompts` を `Partial<Record<PromptPurpose, PromptTemplate>>` に変更（キー存在 = 上書き）。
- **ADR-002**: `BUILTIN_PROMPT_DEFAULTS.text` は空文字を維持（= LLM プロバイダ既定指示にフォールバックする contract と整合）。UI 表示用の「説明文」は presentation 層に置く。
- **ADR-003**: `BUILTIN_DESIGN_TOKENS` の SSOT 化を見送り、`tokens.css` を SSOT とする CLAUDE.md 規約に従う。UI には既定値の値リストを出さず、上書き行の操作に絞る。
- **ADR-004**: 既存 `prompts_json` データの互換性は **ドメイン側 `rehydratePrompts` の Partial 化** で吸収。アダプタは raw を素のまま渡し、マイグレーションは行わない。
- **ADR-005**: `PromptPurpose` の SSOT は domain 5 値。UI/scenario/manual-tests の 3 値表記を 5 値に揃える。
- **ADR-006**: ドメイン `InstanceSettings.updatePrompt` は非空テンプレート前提。空文字入力はユースケース層で `resetPromptTemplate` へルーティングする（illegal states unrepresentable の原則）。

## リスクと注意点

- **`UserPromptOverride` 画面（P23）の「継承中」表示の意味変化**: 仕様文言レビューを Phase 2 で行い、コード変更を伴う場合は plan に追記。
- **`promptResolver` の挙動は不変**: 既存テスト（empty → empty）はそのまま通る想定。空文字フォールバック契約を維持。
- **既存データ互換**: 「full map + 空文字」を新セマンティクスに変換するリハイドレート正規化を入れる（マイグレーション不要）。
- **purpose 5 値の UI 露出**: `ocr_assist` は ingestion パイプラインで未使用だが、admin 画面で編集可能にする（将来の OCR 機能のプロビジョン）。spec/scenario/admin.md を 5 値に更新する点を PR description で強調。

## テスト方針

- **ユニット**:
  - 集約: `updatePrompt`（空 → キー削除、非空 → キー追加）、`resetPrompt`、`resetAllPrompts`。
  - DTO 射影: `isOverridden` がキー存在で判定されること、`promptDefaults` が `BUILTIN_PROMPT_DEFAULTS` を返すこと。
  - リポジトリ rehydrate: 既存「full map + 空文字」を読んで `isOverridden=false` になること。
  - `promptResolver`: 契約変更なし（既存テスト維持）。
- **手動確認重点項目**:
  - プロンプト 5 purpose 各々で編集 → 「上書き中」バッジ → 項目リセット → バッジ消失 → placeholder が既定（=空）を示す。
  - 「全プロンプトリセット」確認モーダルでキャンセル／確定。
  - デザイントークンで 1 行追加 → 保存 → 「この上書きを削除」で行が消える、全リセットモーダル。
  - ingestion ジョブ実行で「上書きなし purpose は LLM プロバイダ既定指示にフォールバック」が引き続き効くこと。

---

## レビュー履歴

### 1 周目（要件カバレッジ / アーキ・リスク 2 視点）

**修正した点:**
- **[両者 P-001]** UI と domain の `PromptPurpose` 不整合に対応 — スコープ内で SSOT を domain 5 値に揃える方針を実装ステップ 7 と 9 に明示。
- **[要件 P-002]** `spec/domains/adminSettings.md`（5 値）と `scenario/admin.md`（3 種）の乖離をステップ 9 で 5 値に統一すると明記。
- **[要件 P-003]** `getInstancePromptDefaults` と新規 `promptDefaults` DTO の用語衝突を、後者を「builtin defaults」として明確化（前者は instance 上書きを返す既存 usecase のまま）。Phase 2 で P23 の表示文言レビューを行うとリスク欄に追加。
- **[アーキ P-002]** `promptResolver` 契約を据置（空文字 = プロバイダ既定指示）。`BUILTIN_PROMPT_DEFAULTS.text` は空文字を保持。ADR-002 で根拠を残す。
- **[アーキ P-003]** `Prompts` を `Partial<Record<>>` に変更し、`text === ""` の二義性を排除。ADR-001。
- **[S-002]** `BUILTIN_DESIGN_TOKENS` の SSOT 化を取り下げ。ADR-003。
- **[S-003]** `ConfirmDialog` は既存利用を明示。
- **[S-004]** デザイントークン UI は「行削除のみ」に統一。

**取り込んだ改善提案:**
- **[要件 S-001]** `promptResolver` フォールバック変更を撤回したため、破壊的変更の懸念が消滅。
- **[要件 S-003]** `spec/manual-tests/admin.md` の既存規約に従う旨を Step 9 に内包。
- **[アーキ S-006]** 既存 `prompts_json` データの正規化を ADR-004 で明文化。

**見送った提案とその理由:**
- **[アーキ S-001]** DTO に `promptDefaults` を埋め込まずクライアントローダで合流する案 → RSC / Cloudflare Workers 構成では DTO 1 本のほうがリクエストが単純。`BUILTIN_PROMPT_DEFAULTS` の量も多くないため負荷的に過剰ではないと判断。
- **[アーキ S-005]** `UserPromptOverride` 画面（P23）の改修 → コード変更は射程外。文言レビューのみリスク欄に追記。

### 2 周目（要件カバレッジ / アーキ・リスク 2 視点）

**結果サマリ**: 要件視点 → 問題点ゼロ（APPROVED）／アーキ視点 → 軽微 P-001/P-002/P-003 と S-001〜S-004。

**修正した点:**
- **[アーキ P-001]** ADR-004 の事実誤認（promptResolver の instance default 側挙動）を修正。Partial 化セマンティクスはドメインに帰属させる方向に書き直し。
- **[アーキ P-002]** Step 2 を更新し、`entity.ts` の `rehydratePrompts` を Partial に書き換える旨を明示。Step 3 はアダプタ側で追加正規化を行わない方針に変更（互換性ロジックをドメインに集約）。
- **[アーキ P-003]** Step 6 で `getInstancePromptDefaults` を「`BUILTIN_PROMPT_DEFAULTS` で穴埋めして全 5 purpose 揃った map を返す」よう更新。P23 のクライアントを触らずに API 互換を維持。
- **[アーキ S-001]** Step 5 で `updatePromptTemplate` の空文字入力を `resetPromptTemplate` へルーティング。ドメイン `updatePrompt` は非空前提。ADR-006 を追加。
- **[アーキ S-002]** Step 1 で `BUILTIN_PROMPT_DEFAULTS[purpose].expectedVariables` は空配列維持と明記。
- **[アーキ S-003]** Step 10 で rehydrate テストをドメイン側に統一。
- **[アーキ S-004]** Step 7 で PromptsForm の保存ボタン disabled 条件を維持（リセットは別ボタン）と明記。

**取り込んだ改善提案:**
- **[要件 W-001]** Step 9 の manual-tests 更新で、未上書き状態のカードに「LLM プロバイダの既定指示を使用」ヒントが表示されること、を確認項目に追加（テスト方針セクション既存記述で実質カバー）。
- **[要件 W-002]** 「全リセットモーダルでキャンセル → 何も変わらない」「項目リセット直後にバッジが消失する」を manual-tests に明示する旨をテスト方針に内包。
- **[要件 W-003]** P23 文言レビューの完了基準を「コード変更不要なら spec 文書のみ更新」と決定（スコープ外）。本 Issue では `getInstancePromptDefaults` の API 互換を維持するため、文言変更は spec 側のみで足りる。

**結論**: 3 周目は不要。実装フェーズへ進める。
