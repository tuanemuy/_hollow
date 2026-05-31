# 実装計画 — Issue #363: 取り込みのディレクトリ提案: 新規ネストパス（多階層）の作成をサポートする

**Issue:** #363
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

#355（PR #361）で「既存ディレクトリツリーへのマッチ」は実装したが、ADR-004 により「新規パス提案」は root 直下の単一名に縮退させていた。本 Issue ではこの縮退を正式に解除し、取り込みのディレクトリ提案で**多階層ネストパス（例 `技術/AI`）をそのまま作成**できるようにする。

## スコープ

### 含まれるもの
- `IngestionPreview` VO の `suggestedDirectoryName` を「`/` 区切りの正準ネストパス」を表現できる意味へ拡張
- コミット経路 `resolveDirectoryId` で root から末端まで中間ディレクトリを順次 ensure（`DirectoryService.ensureRoot` のネスト版を新設）
- `runIngestionJob` のフォールバックを「末尾セグメント単一名」から「正準パスをそのまま新規パスとして渡す」へ変更
- LLM プロンプトの「single top-level name」制約を多階層許可へ変更
- `DirectoryPicker` / `IngestionPreviewForm` で新規ネストパスを編集・確認できる UI
- `MAX_DIRECTORY_DEPTH`（=10）の上限と整合
- 各層のテスト追加・更新

### 含まれないもの
- グローバルなトースト/通知基盤の導入（#355 ADR-003 の方針を踏襲）
- NoteEditor 通常編集側のディレクトリ作成 UX の拡張（共用 `DirectoryPicker` を壊さない範囲で扱う。齟齬があれば ingestion 専用に限定）
- wire/DTO への新規フィールド追加（既存 `suggestedDirectoryName: string | null` の意味拡張で対応）

## 実装ステップ

### 1. ドメインに「ネストパス正準化」を追加
- **対象ファイル:** `app/core/domain/ingestion/valueObject.ts`
- **変更内容:** `IngestionPreview.create` で `suggestedDirectoryName` を「`/` 区切り正準パス文字列」として受け入れる。VO 構築時に (a) `/` split → 各セグメント trim → 空セグメント除去、(b) セグメント数が `MAX_DIRECTORY_DEPTH` 超過なら採用中止（null 化）、(c) 各セグメントを `DirectoryName.create`（max 80 字・禁止文字）で検証、(d) 正準化した `親/子` を再構築して保持。
- **既存検証の再定義（P-002/P-003 反映）:** 現状の `SUGGESTED_DIRECTORY_NAME_MAX_LENGTH = 200` は「単一名の長さ上限」だが、フルパス（最大 10 セグメント × 80 字 + スラッシュ ≒ 809 字）を載せると正当な深いパスを誤って弾く。そこで**フルパス長の単一キャップ検証を撤廃し、「各セグメント ≤ DirectoryName 上限（80）」＋「セグメント数 ≤ MAX_DIRECTORY_DEPTH」へ置換**する。長さ・深さ・禁止文字いずれの超過も ADR-003 (a) に従い best-effort で null 化（業務エラーにしない）し、VO の意味を「採用可能な正準パス、不採用なら null」に統一する。**`SUGGESTED_DIRECTORY_NAME_MAX_LENGTH` 定数は撤廃する**（パス全体上限はセグメント数 × セグメント長で導出され、単一キャップは不要になるため）。この定数を参照している `runIngestionJob.ts`（後述ステップ4）も同時に更新し、参照が宙に浮かないようにする（2周目 S-001 反映）。
- **理由:** ネストパスの業務不変条件（深さ・セグメント妥当性）を VO 構築境界で1回検証する。単一名 200 字キャップがネストパスを誤って弾くのを防ぐ。

### 2. `DirectoryService` にネスト ensure を追加
- **対象ファイル:** `app/core/domain/directory/service.ts`
- **変更内容:** `ensureNestedPath(ownerId, segments: DirectoryName[], now, idGen, repo): Promise<DirectoryId>` を新設。root を `ensureRoot` で確保し、各セグメントについて既存子を探す→あれば再利用、無ければ `Directory.create`（`DirectoryDepth.next` が深さ超過時 `TooDeep` throw）→ `insert`。末端 id を返す。
- **理由:** 「中間ディレクトリを順に ensure しながら末端まで作成」を冪等にドメインサービスとして表現（`ensureRoot` のネスト版）。

### 3. `commitIngestionPreview.resolveDirectoryId` をネスト対応に置換
- **対象ファイル:** `app/core/application/ingestion/commitIngestionPreview.ts`
- **変更内容:** `nameToCreate` の扱いを「単一 `DirectoryName` を root 直下に1個 insert」から「パス文字列を split→`DirectoryName[]`→`DirectoryService.ensureNestedPath`」へ変更。`suggested === null` で `suggestedDirectoryName` がある場合のフォールバックも同じ経路を通す。優先順位（explicitId > nameToCreate > suggestedId > root）は維持。
- **理由:** commit 経路の root 直下単一作成制約（ADR-004）を解除する本丸。

### 4. `runIngestionJob` のフォールバックを正準パスへ変更
- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`
- **変更内容:** 既存ツリーにミスした際、「末尾セグメント単一名」を返すのをやめ、正準化したパス（`/` 区切り、空セグメント除去、**作成名は元の大小文字を保持**）を `suggestedDirectoryName` として返す。現状 `runIngestionJob.ts` の over-long leaf null 化は `SUGGESTED_DIRECTORY_NAME_MAX_LENGTH`（ステップ1で撤廃する定数）を参照しているため、この early-null 判定を撤去し、`resolveDirectorySuggestion` は正準パスを組み立てるところまでを担う。深さ・セグメント長・禁止文字の最終可否判定は VO 構築（ステップ1）の best-effort null 化に一本化し、判定の二重化と宙に浮く定数参照を解消する。
- **理由:** Issue「末尾セグメント単一名 → 正準パスをそのまま新規パスとして渡す」。

### 5. LLM プロンプトの新規制約を多階層許可へ変更
- **対象ファイル:** `app/core/adapters/llm/prompts.ts`
- **変更内容:** `directoryGuidance` の "single top-level name (one segment, no slashes)" を「適切な新規ネストパス（`親/子` のように `/` 区切り、最大10階層）を提案してよい」に変更。既存マッチ優先は維持。**制約文言は `existingDirectories` がある分岐と空（`hasExistingDirectories === false`）の分岐の2箇所に存在するため、両方を多階層許可へ揃える**（S-003 反映）。
- **理由:** プロンプト側の単一名制約（ADR-004）解除。

### 6. DTO / wire の意味拡張
- **対象ファイル:** `app/core/application/dto/ingestion.ts`、`app/components/ingestion/wire.ts`
- **変更内容:** `suggestedDirectoryName: string | null` の型は維持（パス文字列を載せる）。JSDoc/コメントを「`/` 区切り新規ネストパス」を表す旨に更新。
- **理由:** 後方互換のため新フィールドを足さず意味を拡張（ADR 参照）。

### 7. transport schema / actions の調整
- **対象ファイル:** `app/components/ingestion/schema.ts`、`app/components/ingestion/actions.ts`
- **変更内容:** 現状 `directoryNameToCreate` は `z.string().trim().optional()` で**max 長制約が存在しない**（P-001 修正）。ネストパス長に合わせた max（`MAX_DIRECTORY_DEPTH × (80 + 1)` ≒ 810 程度）を**新規追加**し DoS ガードを設ける。`.trim()` は維持。actions のマッピングは既存どおり（usecase 側がパス分解を担当）。NoteEditor 側 `createDirectory` の name 経路（単一名）には影響させない。
- **理由:** transport 境界の DoS ガードをネストパス長に合わせる。

### 8. `DirectoryPicker` / `IngestionPreviewForm` / `IngestionJobRow` の UI 更新
- **対象ファイル:** `app/components/note/editor/DirectoryPicker.tsx`、`app/components/ingestion/IngestionPreviewForm.tsx`、`app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:**
  - **`DirectoryPicker`（P-001 反映・確定）:** NoteEditor 経路は `pendingDirectoryName` をそのまま `createDirectory({ name })` → `DirectoryName.create` に渡すため、`/` を含む入力は禁止文字で**確実に保存失敗する**。よって ingestion 専用 prop `allowNestedPath?: boolean` を**必ず導入**し、true のときのみ「`/` 区切りで階層を指定（例 `技術/AI`）」ヒント・ネスト意味を有効化、false（NoteEditor）は従来どおり単一名。条件付きの「齟齬があれば分岐」ではなく分岐を確定させる。
  - **`IngestionPreviewForm`:** `allowNestedPath` を渡し、可能なら `/` 分割のパンくず風プレビュー（任意）。
  - **`IngestionJobRow`（P-002 反映）:** preview フォームを介さず `suggestedDirectoryName` を直接 `directoryNameToCreate` に転送するクイックコミット経路。編集欄は持たないため UI 入力変更は不要だが、`willCreateDirectory` 時の表示がネストパスを正しく表示するか確認し、ネストパス作成が機能することを integration テストで担保する（ステップ9）。
- **理由:** ユーザーが新規ネストパスを編集・確認できる UI（Issue 明記）と、共用コンポーネント・クイックコミット経路の回帰防止。

### 9. テスト追加/更新
- **対象ファイル:** `app/core/domain/directory/__tests__/service.test.ts`、`app/core/domain/ingestion/__tests__/valueObject.test.ts`、`runIngestionJob.integration.test.ts`、`ingestion.integration.test.ts`
- **変更内容:** `ensureNestedPath`（新規・既存再利用・`TooDeep`・禁止文字・空）、`IngestionPreview` パス正準化・深さ上限、フォールバックが正準パスを載せること、commit でネストパスが root→末端まで作成され中間既存なら再利用すること。
- **理由:** 縮退解除の不変条件を担保。

## 設計判断

詳細は adr.md を参照。要点:
- **データモデル:** 既存 `suggestedDirectoryName: string | null` の単一文字列 + `/` デリミタを維持し意味を拡張（wire/DTO への新フィールド追加を回避、後方互換）。利用時は必ず split→`DirectoryName[]` に展開する二段構え。
- **ネスト ensure 戦略:** `DirectoryService.ensureNestedPath` に集約、commit の同一 UoW 内で root から findBySiblingName→再利用 or create。
- **深さ検証の置き場所:** VO 構築時は best-effort null 化（LLM 暴走は非致命）、commit の `ensureNestedPath` 内は `TooDeep` throw（ユーザー明示入力の超過は業務エラー）。
- **DirectoryPicker UI:** 単一テキスト入力を流用しヒント追加が最小変更。NoteEditor 共用の破壊を避ける。

## リスクと注意点
- **空/重複セグメント:** `a//b`、` /技術/ `、末尾 `/` → split + trim + 空除去で正準化。全セグメント空なら `null`。
- **深さ超過:** LLM が11階層 → VO で null 化（無提案）。ユーザー手入力で超過 → commit で `DirectoryErrorCode.TooDeep`（業務エラー、UI 表示）。
- **既存マッチとの優先順位:** 既存ツリー完全一致を最優先（`suggestedDirectoryId` 解決）、ミス時のみネスト新規にフォールバック。ADR-005 の決定的マッチ順序を崩さない。
- **部分一致（合流）:** `技術` 既存・`AI` 新規のケースは、`ensureNestedPath` の findBySiblingName 再利用で「技術は再利用・AI は新規作成」になる（改善点）。
- **兄弟名衝突:** find→あれば再利用、なければ create の順序。`assertSiblingNameUnique` は新規作成時のみ呼ぶ。
- **NoteEditor 共用 DirectoryPicker の回帰:** 通常ノート編集の単一ディレクトリ作成を壊さない。
- **後方互換:** 単一名で保存済みの previewing ジョブも「`/` 無し → 1セグメント」として矛盾なく解釈（マイグレーション不要）。
- **作成名の大小文字:** マッチは lower 正規化だが、新規作成名は元の大小文字を保持して `DirectoryName.create` に渡す。

## テスト方針
- **ユニット（ドメイン）:** `ensureNestedPath`（全新規・中間再利用・`TooDeep`・禁止文字・空）、`IngestionPreview.create`（パス正準化・深さ上限・セグメント長）。
- **ユニット（usecase 純関数）:** `resolveDirectorySuggestion`（既存一致優先・ミス時正準パス保持・深さ超過 null）。
- **integration（`ingestion.integration.test.ts`）:** `directoryNameToCreate="技術/AI"` で root→技術→AI が作成、既存「技術」があれば再利用、深すぎで `TooDeep`、同一パス2連続コミットで2回目が既存再利用される冪等性（S-001）、`IngestionJobRow` クイックコミット経路でのネストパス作成（P-002）。
- **integration（`runIngestionJob.integration.test.ts`）:** LLM 新規ネストパスがミス → preview に正準パスが載る、既存一致時は `suggestedDirectoryId` 解決でパス null。
- **frontend:** cross-origin 制約（MEMORY）により agent-browser の server-fn POST 検証は不可 → ネストパス commit は integration で担保。UI はレンダリング/state 遷移のユニットに留める。

## レビュー履歴

### 1周目
2視点（要件カバレッジ / アーキ・リスク）並列レビュー実施。

**修正した点**:
- P-001（DirectoryPicker 破綻）: 共用 `DirectoryPicker` は `/` ヒントを一律導入すると NoteEditor 経路（`DirectoryName.create` が `/` を禁止文字で弾く）が確実に保存失敗する。ステップ8・ADR-004 を「`allowNestedPath?: boolean` prop を必ず導入し ingestion 専用に分岐」へ確定。
- P-002/P-003（VO フルパス長上限）: `SUGGESTED_DIRECTORY_NAME_MAX_LENGTH=200` 単一キャップが正当な深いパスを誤って弾く。ステップ1を「フルパス単一キャップを撤廃し、各セグメント ≤ 80 ＋ セグメント数 ≤ MAX_DIRECTORY_DEPTH へ置換、超過は best-effort null 化」へ修正。
- schema max（reviewer2 P-001）: `directoryNameToCreate` に現状 max 制約は無い。ステップ7を「引き上げ」から「max 新規追加（≒810）」へ訂正。
- IngestionJobRow（reviewer2 P-002）: クイックコミット経路が `suggestedDirectoryName` を直接転送するため挙動が変わる。ステップ8 に対象追加・integration 担保を明記。
- runIngestionJob over-long null 化（reviewer1 S-001）: leaf 単体長のみ判定を「フルパス/セグメント長/深さ超過で null 化」へ更新する旨をステップ4に追記、VO との役割分担も明記。
- prompts.ts 2分岐（reviewer2 S-003）: 制約文言は existingDirectories 有無の2箇所にあるためステップ5に両方更新を明記。
- ensureNestedPath 空配列契約（reviewer2 S-002）: 空セグメントは root id を返す契約を ADR-002 に追記。新規 port 不要（findBySiblingName 等実在）も明記。

**取り込んだ改善提案**:
- 同一パス2連続コミットの冪等性テスト（reviewer1 S-001）をテスト方針に追加。

**見送った提案とその理由**:
- なし（全提案がスコープ内で妥当だったため反映）。

両レビューとも「実装前に計画へ反映すべき」とした3点（P-001/P-002/P-003）はすべて反映済み。骨子（port は揃っている・データモデル意味拡張・ネスト ensure のドメインサービス化・深さ検証二段構え）は両視点で妥当と評価された。

### 2周目
2視点とも**問題点ゼロ**で収束。

**確定した点（S-001 反映）**:
- `SUGGESTED_DIRECTORY_NAME_MAX_LENGTH` 定数は撤廃で確定（両論併記を解消）。VO のセグメント検証＋深さ上限で導出されるためフルパス単一キャップは不要。`runIngestionJob.ts` の early-null 判定（同定数参照）も撤去し、可否判定を VO に一本化。

**確認された整合性**:
- VO の best-effort null 化（プレビュー＝非致命）と commit の `TooDeep` throw（ユーザー明示入力＝業務エラー）の役割分担が重複なく成立。
- `ensureNestedPath` 空配列 → root id 契約により、commit の「nameToCreate あり / suggested null / root フォールバック」を1経路に統合可能。
- repo port（`findBySiblingName`/`findChildren`/`findRoot`/`insert`）実在を再確認。新規 port 不要。
- `DirectoryPicker` は既存の opt-in prop パターン（`allowExistingActions`）を持つため `allowNestedPath` 追加は確立済みパターンの踏襲。

**実装時の留意（S-002）**:
- ingestion VO が `MAX_DIRECTORY_DEPTH`（`@/core/domain/directory/valueObject`）を新規 import する。既に `DirectoryId` 参照の前例があり許容されるが循環 import が生じないこと確認。

レビューループ終了（2周目で両視点問題点ゼロ）。
