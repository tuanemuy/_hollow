# ADR — Issue #218: 管理画面：プロンプト・デザイントークンを「デフォルト上書き」モデルにしてリセット可能にする

## ADR-001: `Prompts` 集約を `Partial<Record<PromptPurpose, PromptTemplate>>` に変える

### Status
Proposed

### Context
現状 `InstanceSettings.prompts` は `Readonly<Record<PromptPurpose, PromptTemplate>>` で、`default()` で「全 5 purpose を空文字 `PromptTemplate` で埋めた full map」を返す。これだと「上書き」と「未上書き」を区別する手段が `text === ""` 比較しかなく、ユーザーが意図的に空を保存した場合や、builtin と同じ文を保存した場合に `isOverridden` が誤判定になる。`UserPromptOverride` 側はすでに `Partial<Record<>>` 相当のセマンティクス（キーがあれば上書き、なければ継承）。

### Decision
`Prompts` 型を `Readonly<Partial<Record<PromptPurpose, PromptTemplate>>>` に変更する。**キー存在 = 上書きあり / キー欠落 = 既定継承**。`InstanceSettings.default()` は `prompts: {}` を返す。`updatePrompt` は非空テンプレートを前提（空文字入力はユースケース層で `resetPrompt` にルーティング — ADR-006）。`resetPrompt(purpose)` でキー削除、`resetAllPrompts()` で map 空化。

### Consequences
- **良い点**: `UserPromptOverride` と同型でセマンティクスが揃う。`isOverridden` 判定が曖昧さなくキー存在で導出できる。新規操作（reset 系）が自然に表現できる。
- **トレードオフ**: 既存 DB データ（full map + 空文字）の互換性を rehydrate 側で吸収する必要がある（ADR-004 を参照）。

---

## ADR-002: `BUILTIN_PROMPT_DEFAULTS.text` は空文字を保持する

### Status
Proposed

### Context
管理画面で「既定値」を可視化するため `BUILTIN_PROMPT_DEFAULTS` を新設する。`text` を実体文（例: 「以下の note を構造化してください…」）にすると、`promptResolver` のフォールバック（user override → instance override → 空文字）を「空文字 → builtin」まで延長することで ingestion パイプラインで既定文を LLM に送れる、という案が考えられる。しかし `promptResolver` の JSDoc は明示的に「empty string = LLM プロバイダの既定指示にフォールバックする合図」と定めており、`runIngestionJob` が `structure` / `metadata` で実際にこの契約を前提に動いている。

### Decision
`BUILTIN_PROMPT_DEFAULTS[purpose].text` は **空文字** を保持する（既定 = LLM プロバイダの既定指示）。`expectedVariables` は purpose ごとの最小セットを定義する。UI 表示用の補足説明文（「LLM プロバイダの既定指示を使用」などの人間向けラベル）は presentation 層に置く。`promptResolver` の契約は変更しない。

### Consequences
- **良い点**: ingestion パイプラインの挙動が変わらない。既存テスト・既存ユーザーへの影響なし。「既定 = プロバイダ既定」という事実を歪めない。
- **トレードオフ**: 「既定値が見える」という Issue 文言を厳密に解釈すると「既定文 = 空文字 / プロバイダ既定指示」と説明する UI 文言の工夫が必要。リテラル「placeholder にデフォルト文」ではなく「説明テキスト」で代替する。

---

## ADR-003: `BUILTIN_DESIGN_TOKENS` の SSOT 化を見送る

### Status
Proposed

### Context
Issue 文言上、デザイントークンも「既定値を併記してリセット可能」が完了条件。プロンプト同様にコード側 SSOT を作る案があるが、`CLAUDE.md` は「Design tokens live in `app/styles/tokens.css` (single source of truth, mirrored in `spec/design/tokens.md`)」と SSOT を `tokens.css` に明示している。さらに `tokens.css` は 100+ 個の変数を持ち、ビルド時にパースする仕組みもない（lightningcss 制約あり）。

### Decision
`BUILTIN_DESIGN_TOKENS` というコード SSOT は作らない。admin UI には「上書きキーの一覧（上書きあり）」のみを表示し、各行に「この上書きを削除（既定に戻す）」ボタンを置く。全リセットは `ConfirmDialog` 経由。既定値の参照は `spec/design/tokens.md` へのリンクで提示する補助テキストにとどめる。

### Consequences
- **良い点**: SSOT の二重化を回避。`tokens.css` を更新したときに `BUILTIN_DESIGN_TOKENS` がドリフトするリスクなし。
- **トレードオフ**: Issue の「placeholder に既定値併記」は字義どおりには満たさない。代わりに「上書きあり/なし」「リセット可能」というモデル側の意図は十分満たせる。

---

## ADR-004: 既存 `prompts_json` データの互換性はドメイン rehydrate の Partial 化で吸収

### Status
Proposed

### Context
ADR-001 で `Prompts` を `Partial<Record<>>` に変えるが、既存 DB データは「full map + 空文字」で保存されている。マイグレーションで一括正規化する選択肢もあるが、Cloudflare D1 では JSON 内部のマイグレーション SQL が煩雑になる。また、互換性ロジックをアダプタに置くか、ドメインに置くかも判断ポイント。

### Decision
**ドメイン側 `rehydratePrompts`（entity.ts）を Partial 化する**。`raw[purpose]` が存在しないキー、および存在しても `text === ""` のエントリは map に含めない（`UserPromptOverride` 側の `rehydratePartialPrompts` と同型）。アダプタは raw を素のまま `InstanceSettings.reconstruct` に渡し、追加正規化は行わない。書き込みは `Partial<Record<>>` をそのまま JSON 化（不要キーは出力しない）。マイグレーションは行わない。

### Consequences
- **良い点**:
  - 互換性ロジックがドメインに集約される（Partial セマンティクスの所有が DDD 的に正しい場所に置かれる）。
  - マイグレーション不要で透過的に新セマンティクスへ移行。
  - アダプタの責務がテーブル↔オブジェクトの直訳に留まる。
- **トレードオフ**:
  - `promptResolver`（adapter）側はもともと、user override は `entry.text.length > 0` 判定、instance default は `entry !== undefined` でそのまま `entry.text` を返す。**instance default 側は空文字を次段フォールバックしない**実装だが、rehydrate で `text === ""` エントリが落ちることで「entry 無し → 空文字」を返すパスに合流し、最終的に観測される戻り値は不変（空文字 = LLM プロバイダ既定指示）。
  - 読み出し時に必ず正規化が走る分の極小コスト（map 走査 1 回）。

---

## ADR-006: ドメイン `updatePrompt` は非空テンプレート前提、空文字入力はユースケースで `resetPrompt` ルーティング

### Status
Proposed

### Context
`Prompts` を Partial 化（ADR-001）した結果、「`text === ""` を保存」と「キーを削除（リセット）」が同じ意味になる。ここでドメイン `InstanceSettings.updatePrompt` に「空文字なら自動でキー削除」させると、操作名（update）と動作（delete）がズレ、illegal states unrepresentable の原則（CLAUDE.md「Principles」）から外れる。`PromptTemplate.create` 自体は空文字を許容するため、型レベルでは弾けない。

### Decision
- ドメイン `InstanceSettings.updatePrompt` は **非空テンプレートを前提**として `{ ...prompts, [purpose]: template }` を返す（実装上は空文字を渡しても動くが、契約として非空を期待）。
- ユースケース `updatePromptTemplate` の入力検証で `template.text` が空文字なら **`resetPromptTemplate` と等価に処理**する（内部で `InstanceSettings.resetPrompt` を呼ぶ）。
- これにより、ドメイン操作の名前と動作が一致し、ユースケース層が「ユーザー意図 → ドメイン操作」の対応を持つ正しいレイヤリングが保たれる。

### Consequences
- **良い点**: ドメイン操作の意味が明確になる。`updatePrompt` の読み手は「上書きを設定する」とだけ理解すればよい。リセットは独立した `resetPrompt` 操作として明示。
- **トレードオフ**: ユースケース層に分岐ロジックが増える（1 if 文程度）。フロント側の保存ボタン disabled 条件は維持し、空文字保存は別ボタン（リセット）経由とすることで UI 層でも意図の分離が保たれる。

---

## ADR-005: `PromptPurpose` の SSOT は domain 5 値（structure/title/directory/metadata/ocr_assist）

### Status
Proposed

### Context
UI の `PROMPT_DESCRIPTORS` は `ingestion_structuring` / `title_generation` / `directory_suggestion` の 3 種で送っており、domain enum (5 種) と不一致。現状 UI から保存しようとすると `PromptPurpose.create` が `BusinessRuleError` を投げる既存バグ。`spec/scenario/admin.md` / `spec/manual-tests/admin.md` も 3 種表記。`spec/domains/adminSettings.md` の 5 値がアーキ的 SSOT。

### Decision
domain 5 値を SSOT とし、UI の descriptor とすべての spec 文書を 5 値に揃える。本 Issue のスコープ内で寄せる（既存バグ修正を内包）。

### Consequences
- **良い点**: UI/domain/spec の三者整合。Issue で言及される「項目ごとリセット」の対象集合が明確になる。
- **トレードオフ**: `ocr_assist` は ingestion port では未参照（将来の OCR 機能のプロビジョン）。admin 画面では編集可能とするが「現状は OCR 機能未実装」と spec/scenario に注記する。
