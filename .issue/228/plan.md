# 実装計画 — Issue #228: アップロード前にカスタムプロンプトを入力できる画面を追加する

**Issue:** #228
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

アップロード回ごとに、その回だけ適用するカスタムプロンプト（structure / metadata）を上書きできるようにする。ユーザーデフォルト（#218 で管理画面側に保存）とは別軸で、「このアップロードだけ」効くプロンプトを UI から入力できるようにし、空入力なら従来どおり `promptResolver` のユーザー設定／システムデフォルトに自然にフォールバックさせる。

## スコープ

### 含まれるもの

- アップロードフロー（`UploadDialog` の選択ビュー）に「詳細オプション」アコーディオンを追加し、structure / metadata のカスタムプロンプトを任意入力できる UI
- 入力されたプロンプトを **そのジョブ単位** で `IngestionJob` 集約の永続フィールドとして持たせ、DB に保存
- `runIngestionJob` のパイプラインで override を resolver より優先
- 空文字／未入力なら resolver にフォールバック
- transport boundary（`uploadFileFn`）と VO 構築の2点での入力検証（長さ上限含む）
- 複数ファイル一括アップロード時は、入力された override を **その一括分の全ファイルに同一適用** する（`submitFiles` のループ内で同じ FormData フィールドを付与するだけで成立し、完了条件1を素直に満たせるため）

### 含まれないもの

- ユーザーデフォルトとしての永続化（#218 の管轄）
- プロンプトテンプレートの変数補間（override は補間済みリテラルとして扱う）
- `/upload` 直下の簡易 `UploadForm` への override UI 追加 — Issue 意図はアップロードモーダル中心。`UploadForm` は別動線のため本 Issue では対象外
- ファイル種別に応じた override 入力欄の出し分け UI（後述の structure override の種別依存は仕様として受容し、UI 出し分けは行わない）

### 既知の仕様上の制約

- **structure override は LLM 構造化が走る種別でのみ作用する**。`runIngestionJob.runPipeline` は `kind === "html"` / `"markdown"` では `llm.structureToHtml`（structure prompt を消費する唯一の箇所）を呼ばず sanitizer / markdown 変換で処理するため、html / markdown アップロードでは structure override は無視される。metadata override は `suggestMetadata` が全種別で走るため常に有効。UI での出し分けはスコープ外とし、この制約は受容する（テストの期待値・動作確認手順はこれを踏まえる）。

## 実装ステップ

### 1. PromptOverride 値オブジェクトの追加

- **対象ファイル:** `app/core/domain/ingestion/valueObject.ts`
- **変更内容:** branded string VO `PromptOverride` を新設。`create(raw)` は「非空・上限内のプレーンテキスト」を保証（バイト長上限は `adminSettings` の `PromptTemplate` と同じ 16 KiB）。**バイト長計測は `new TextEncoder().encode(text).length`**（`PromptTemplate` と同方式。文字数 `.length` ではない）。空文字判定は呼び出し側（entity の `create`）に任せ、本 VO は非空前提。
- **理由:** 検証は VO 構築点で行う原則（CLAUDE.md「Input validation」）。template ではなく literal なので変数検証は付けない。

### 2. エラーコード追加

- **対象ファイル:** `app/core/domain/ingestion/errorCode.ts`
- **変更内容:** `InvalidPromptOverride: "ingestion_invalid_prompt_override"` を追加（命名規約: 左辺 PascalCase / 右辺 lower_snake、`BusinessRuleError` 文言と一致）。既存の VO 構築系コード（`InvalidFileName: "ingestion_invalid_file_name"` 等）が `ingestion_` プレフィックスで統一されているため、それに合わせる。
- **理由:** `*ErrorCode` 命名規約と `errorCodeNaming.test.ts` の担保、ドメイン内一貫性。

### 3. IngestionJob エンティティの拡張

- **対象ファイル:** `app/core/domain/ingestion/entity.ts`
- **変更内容:**
  - `IngestionJobBase` に `promptOverride: Readonly<{ structure: PromptOverride | null; metadata: PromptOverride | null }>` を追加。
  - `CreateInput` に `promptOverride?: { structure?: string | null; metadata?: string | null }` を追加。`create` 内で空文字／undefined → `null`、非空 → `PromptOverride.create`。
  - `ReconstructInput` に `structurePromptOverride: string | null` / `metadataPromptOverride: string | null` を追加（必須フィールドにして adapter の更新漏れを型で検出）。`buildBase` の **`Pick<ReconstructInput, ...>` リストに2フィールドを追加** し、`buildBase` 内で `promptOverride` を再構築する（Pick 漏れは型で検出されない静かな取りこぼしになるため明示）。
  - `regenerate` / `retry` / `startProcessing` / `attachPreview` / `commit` / `markFailed` / `discard` は `...job` スプレッドで override を保持（明示変更不要、テストで担保）。
- **理由:** 集約の全状態で一貫して保持できる正しい場所。再生成・リトライでも「そのジョブのプロンプト」を維持するのが自然。

### 4. DB スキーマ＆マイグレーション

- **対象ファイル:** `app/core/adapters/d1/schema.ts` / `app/core/adapters/d1/migrations/0012_*.sql`
- **変更内容:** `ingestionJobs` に `structurePromptOverride: text("structure_prompt_override")`, `metadataPromptOverride: text("metadata_prompt_override")`（共に nullable）を追加。`pnpm db:generate` で `0012_ingestion_prompt_override.sql` を生成し、生成結果が `ALTER TABLE ADD COLUMN` 2本だけになるか精査。
- **理由:** nullable で既存行（NULL=override なし）と後方互換。

### 5. アダプターマッピング

- **対象ファイル:** `app/core/adapters/d1/repositories/ingestionJobRepository.ts`
- **変更内容:**
  - `toEntity` の `reconstruct` 引数に `structurePromptOverride` / `metadataPromptOverride` を渡す。
  - `toRowValues` に2列を追加（`insert` は全列を書くので OK）。
  - `save` の `.set()` には **追加しない**（override は insert 時に確定する provenance 扱いで、ライフサイクル中に変化しない）。
- **理由:** 上書きをアップロード回に固定し、OCC 更新パスから不変条件を守る。既存 `save` が owner 等の provenance 列を書かないのと同じ扱い。

### 6. uploadFile ユースケース

- **対象ファイル:** `app/core/application/ingestion/uploadFile.ts`
- **変更内容:** `UploadFileInput` に `promptOverride?: { structure?: string; metadata?: string }` を追加し、`IngestionJob.create` の引数に渡す（空文字は entity 側で null 化）。
- **理由:** 集約生成の入口。

### 7. runIngestionJob の解決ロジック

- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`
- **変更内容:** `PipelineDeps` に `promptOverride` を追加し、`runPipeline` 呼び出し（104-118）で **`promoted.promptOverride`** を渡す（`promoted` は冒頭 UoW の `startProcessing` 戻り値 `ProcessingIngestionJob`。base フィールド継承で override が載るため、DB 再ロード不要）。`structurePrompt` / `metadataPrompt` を `override?.structure ?? await resolver.resolveFor(...)` の形へ（override があれば resolver を呼ばない）。
- **理由:** override 優先・空は resolver フォールバック（完了条件）。

### 8. transport: actions.ts

- **対象ファイル:** `app/components/ingestion/actions.ts`
- **変更内容:** `uploadFileFn` ハンドラで `data.get("structurePrompt")` / `data.get("metadataPrompt")` を読み、**`typeof value === "string"` かつ非空（trim 後）** のときだけ `input.promptOverride` に詰める（`FormDataEntryValue` は `string | File` なので File 等は override 無しとして無視）。VO 構築前に長さ上限（16 KiB 相当のバイト数）を transport 側で先行ガード。FormData フィールド名 `structurePrompt` / `metadataPrompt` は UI（ステップ9）と一致させ、テストで固定する。
- **理由:** transport boundary 検証点（外部入力は信頼しない原則）。未入力・空は usecase に渡さない。巨大 payload の DoS ガード。

### 9. UI: UploadDialog

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** override の入力 state（structure / metadata）を `UploadDialog` レベルの `useState` で保持し、`SelectView` に `<details>`（アコーディオン）で「詳細オプション」を畳んで2つの `<textarea>` を配置（値・onChange を props で受け取る）。`submitFiles` は単一・複数いずれの経路でも、各ファイルの `FormData` に override 値（非空時のみ）を append する。SelectView での入力 → ファイル選択/ドロップ → `submitFiles` 実行という順序のため、override state は選択時点の値が読まれる。
- **理由:** 普段使いの邪魔をしない畳み込み（Issue 提案）。複数ファイル時も同一 override を全件適用（完了条件1の素直な充足）。

### 10. テスト

- domain（entity / valueObject）→ adapter ラウンドトリップ → usecase（runIngestionJob の override 優先・空フォールバック）の順で更新・追加。詳細は testing.md とレビューで担保。

## 設計判断

詳細は `adr.md` を参照。要点:

- **override をどの遷移まで保持するか**: regenerate / retry でも保持（`...job` スプレッドで自動保持、ユーザー期待として自然）。
- **save パスで override 列を書かない**: アップロード回に確定する provenance としてライフサイクル中不変に保つ。
- **プロンプト長バリデーション**: `PromptOverride` VO に 16 KiB 上限。変数検証は付けない（補間済みリテラル）。transport 側でも同等ガード。
- **DB カラム設計**: JSON 1列ではなく2列分割（purpose は固定2種、型・クエリが素直）。
- **DTO/wire への非射影**: override をクライアントに返さない（`errorReason` を wire から外す先例に倣う）。
- **複数ファイル時**: 入力された override を一括分の全ファイルに同一適用（`submitFiles` のループで成立、完了条件1を素直に充足）。

## リスクと注意点

- **マイグレーション生成**: `pnpm db:generate` の出力が schema 全体差分から余計な変更を含まないか精査（ADD COLUMN 2本になるよう確認）。適用は `pnpm db:apply:local`（local）。
- **既存テストのコンパイル破壊**: `IngestionJob.create` / `reconstruct` の引数が増えると `entity.test.ts` / `entity.property.test.ts` / worker 統合テストが影響。`create` の `promptOverride` はオプショナル（未指定=両 null）にして既存呼び出しの破壊を最小化しつつ、`reconstruct` は必須にして adapter の更新漏れを型で検出する。
- **DoS ガード**: textarea は巨大入力可能。transport で VO 構築前に長さチェック。
- **複数ファイル一括 UI**: 一括分の全ファイルに同一 override が適用される挙動を実機確認。

## テスト方針

- **ユニット（domain）**: `valueObject.test.ts` に `PromptOverride.create` の境界（空・上限超過・正常）。`entity.test.ts` に「`create` が空文字を null 正規化」「非空を VO 化」「regenerate/retry が override 保持」「reconstruct ラウンドトリップ」。`entity.property.test.ts` の生成器を新フィールド込みに更新。
- **ユニット（usecase）**: `runIngestionJob` で「override あり→resolver を呼ばずその値を LLM へ」「override なし/空→resolver の値」を検証。**structure override の LLM 到達検証は LLM 経由 kind（例 `office` / `pdfTextual`）で行う**（html/markdown では structure prompt が LLM に渡らないため意味のある assert にならない）。metadata override は任意 kind で検証可。
- **統合（adapter）**: `ingestionJobRepository` の insert→findById ラウンドトリップで2列保持、NULL の往復。さらに **save 経由（regenerate/retry 後）で override 列が DB 上変化しないこと** を assert（ADR-002 の provenance 不変条件をコードレベルで担保。`.set()` は列を明示列挙する方式で将来の誤追加が型エラーにならないため）。
- **ユニット（usecase 再生成）**: `regenerate` 後に `runIngestionJob` が再走しても **同じ override が LLM に渡る** ことを検証（完了条件の再生成時挙動を担保）。
- **統合（worker）**: `handlers.integration.test.ts` の `seedPendingIngestionJob` は新カラムが nullable のため**既存 seed 呼び出しは無変更で通る**（Drizzle 型付き insert は省略可）。override 経路を検証する新規ケースを足す場合のみ seed に列を追加する。
- **ブラウザ**: アコーディオン展開→入力→アップロード→ previewing まで override が効くこと（LLM 経由 kind で）、空入力でフォールバックすること、複数ファイル時の UI 挙動。

## レビュー履歴

### 1周目（2視点: 要件カバレッジ / アーキ・リスク）

**修正した点**:
- [要件P-002 / アーキP-002] structure override が html/markdown 種別では LLM に渡らず無効になる仕様を「既知の仕様上の制約」セクションに明記。テスト方針も「structure override の LLM 到達検証は LLM 経由 kind で行う」に修正。
- [アーキP-001] ADR-001 と plan ステップ7 の記述を「DB 再ロード」から「`promoted`（startProcessing 戻り値）経由」に統一。
- [アーキP-003] errorCode を `invalid_prompt_override` → `ingestion_invalid_prompt_override`（VO 構築系の `ingestion_` プレフィックス慣習に合わせる）。
- [要件P-001] 複数ファイル一括時の override 適用を「単一ファイルのみ」から「全ファイルに同一適用」に変更（`submitFiles` のループで成立、完了条件1を素直に充足）。UI もそれに合わせて override state を UploadDialog レベルに持つ設計に修正。

**取り込んだ改善提案**:
- [アーキS-002] `buildBase` の `Pick` リストへの2フィールド追加をステップ3に明示。
- [アーキS-003] バイト長計測を `TextEncoder().encode().length` とステップ1に明記。
- [アーキS-004] transport で `typeof === "string"` チェック（File を override 無し扱い）をステップ8に明記。
- [アーキS-001] worker 統合テストの seed は nullable のため無変更で通ることをテスト方針に反映（必須ではなく条件付き）。
- [要件S-002] FormData フィールド名を UI と一致させテストで固定する旨をステップ8に追記。
- [要件S-001 / アーキ] `promoted` 経由参照の前提（ステップ3→7 の依存）を ADR-001 に明記。

**見送った提案とその理由**:
- ファイル種別に応じた override 入力欄の出し分け UI: Issue スコープを超えるため見送り（制約は仕様として受容）。

### 2周目
（下記参照）

**2周目結果**: 両視点とも問題点ゼロで終了。

**2周目で取り込んだ改善提案**:
- [アーキS-001] adapter テストに「save 経由で override 列が変化しない」assert を追加（ADR-002 の不変条件担保）。
- [アーキS-002 / 要件S-002] regenerate 後も同じ override が LLM に渡る usecase テストを追加。
- [要件S-001] ADR-001 Context に「永続化しない」の意味（ユーザー横断デフォルトとして残さない／ジョブ行保存は反しない）を補足。
