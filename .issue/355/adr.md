# ADR — Issue #355: P13 アップロードモーダル: LLM 提案精度の向上と登録 UX 改善

## ADR-001: ディレクトリツリー取得は新規 port を作らず既存 UoW `directoryRepository.findTree` を使う

### Status
Proposed

### Context
ディレクトリ提案で「既存ツリー」を LLM の文脈に渡す必要がある。選択肢は (a) 新規 usecase/port を切る、(b) ワーカーが既に保持している UoW context の `directoryRepository.findTree(ownerId)` を使う。presentation 層の `flattenDirectoryTree` はアプリ層から import できない。

### Decision
(b) を選ぶ。`runIngestionJob` は既に `unitOfWorkProvider` を保持し owner も確定済み。`findTree(ownerId)` を1回呼び、`Directory[]` を parentId で辿ってパス列に整形するヘルパーを usecase 側にローカル実装する。

### Consequences
- 良い点: 新規 port/usecase の追加がなく変更面積が小さい。層分離（presentation のヘルパーを借りない）を守れる。
- トレードオフ: パス整形ロジックが presentation 層の `flattenDirectoryTree` と軽微に重複する。

---

## ADR-002: 既存ディレクトリのマッチングは usecase 側で決定的に実施し、LLM はパス提案のみ

### Status
Proposed

### Context
LLM に「既存のどこに置くべきか」を提案させる際、(a) LLM に `DirectoryId` を直接返させる、(b) LLM はパス文字列で提案し usecase 側で id 解決する、の2案がある。

### Decision
(b) を選ぶ。LLM はパス文字列を提案し、`DirectoryId` 解決は取得済みツリーとの正規化突き合わせで usecase 側が決定的に行う。一致すれば `suggestedDirectoryId`、不一致なら `suggestedDirectoryName`（新規作成）にフォールバック。

### Consequences
- 良い点: LLM が存在しない/不正な id を返すリスクを構造的に排除。決定的でテスト可能。
- トレードオフ: パス表記揺れ（スラッシュ・大小文字）の正規化を usecase 側で実装する必要がある。

---

## ADR-003: 登録時インタラクションは新規トースト基盤を導入せず既存 view ステートマシンに `committed` view を追加

### Status
Proposed

### Context
登録時のフィードバックが薄い。グローバルなトースト/通知基盤は本リポジトリに存在しない。新規導入はスコープ過剰でアーキ判断を要する。

### Decision
`UploadDialog` の既存 view ステートマシン（`multiResult`/`timedOut`/`queueGuidance` 等）に `committed` view を追加し、成功演出 +「ノートを開く」導線をモーダル内で完結させる。`role="status" aria-live` の既存 announce を流用。

### Consequences
- 良い点: 既存パターンと一貫。新規基盤の導入コスト・設計判断を回避。
- トレードオフ: 成功フィードバックがモーダル内に限定される（グローバルトーストは将来課題）。

---

## ADR-004: 新規ディレクトリ提案は「root 直下の単一名」に縮退させる（深いネスト新規作成はスコープ外）

### Status
Proposed

### Context
要件3は「該当が無い場合は適切な新規パスを提案」だが、コミット経路 `resolveDirectoryId`（`commitIngestionPreview.ts`）は `nameToCreate` を必ず owner の root 直下に1つだけ作成する。`suggestedDirectoryName` は単一名でネストパスを表現できないデータモデル。LLM が `技術/AI/論文` のような新規ネストパスを提案しても、実際には末尾セグメントが root 直下に作られるだけで「適切な新規パス」にはならない。

### Decision
新規提案は「root 直下に作る単一トップレベルディレクトリ名（スラッシュ無し1セグメント）」に縮退させる。これをプロンプト（ステップ4）で LLM に制約し、usecase 側のフォールバックも末尾セグメントを単一名として採用する。既存ツリーへのマッチ（任意の深さの既存ディレクトリへの id 解決）は完全に満たす。深い新規ネスト階層の自動作成は commit DTO / `IngestionPreview` VO / DirectoryPicker への波及が大きいため別 Issue 候補とする。

### Consequences
- 良い点: コミット経路の制約と構造的に整合し、階層落ちの混乱を防ぐ。既存配置の精度向上という主目的は満たす。
- トレードオフ: 新規ディレクトリの自動ネスト作成は実現しない（要件の一部を縮退）。Phase 4 で別 Issue として申し送る。

---

## ADR-005: ディレクトリパスの正準形を1関数で生成し、LLM 提示と突き合わせの双方に使う

### Status
Proposed

### Context
LLM に見せる既存パス（`existingDirectories`）と、`directorySuggestion` 突き合わせ時の左辺パスが別ロジックで生成されると、スラッシュ/root 有無の表記揺れで全件不一致になりうる。presentation の `flattenDirectoryTree` は先頭スラッシュ付き・root 空 name で、そのまま流用すると整合が取りにくい。

### Decision
usecase 側に「root（空 name）を除外し、`親名/子名` の先頭スラッシュ無し形式」を生成する単一ローカル関数を置き、(a) `existingDirectories` として LLM へ渡す文字列、(b) 突き合わせ時の左辺、を同一関数から生成する。比較は `DirectoryName.equals` と同様に大小無視＋前後/連続スラッシュ正規化で行う。

### Consequences
- 良い点: 提示と照合の正準形が一致し、表記揺れによる全件不一致を防ぐ。
- トレードオフ: presentation の `flattenDirectoryTree` とパス整形ロジックが軽微に重複する（ADR-001 のトレードオフと同質）。

---

## ADR-006: `findTree` は promote と pipeline の間で独立した `unitOfWorkProvider.run` として実行する（実装時判断）

### Status
Accepted（実装時）

### Context
ステップ5の `findTree(ownerId)` を `runIngestionJob` のどこで呼ぶか。promote（pending→processing）の `run` 内に同居させると UoW の責務が膨らみ、失敗時の空配列フォールバックが promote トランザクションを巻き込む。

### Decision
promote 直後・`runPipeline` 直前に**独立した `unitOfWorkProvider.run`** として `findTree` を1回呼ぶ。失敗は try/catch で握って `logger.warn('ingestion.directoryTree.fetch_failed')` を出しつつ空配列にフォールバックする。これにより取り込み本体（promote / pipeline / attachPreview）と疎結合になり、ツリー取得の一時障害が取り込みを落とさない。

### Consequences
- 良い点: 取り込みパイプラインの純粋性（`runPipeline` は DB アクセスを持たない）を保ちつつ、ツリー取得の失敗を局所化できる。
- トレードオフ: `unitOfWorkProvider.run` の呼び出し順が promote→findTree→(rollback) に変わり、`run` 呼び出し回数に依存していた既存テスト（rate-limit rollback の save 失敗ケース）の spy インデックスを #2→#3 に更新した。順番に依存する mock は脆いが、本 Issue ではテスト側のインデックス調整で対応した。

---

## ADR-007: JSON-envelope LLM アダプターのプロンプトビルダーを共有モジュールに抽出する（レビュー時判断）

### Status
Accepted（レビュー時）

### Context
Issue 本文は anthropic アダプターのプロンプト改善のみを対象としていたが、`llmProviderFactory` は admin 設定で anthropic / openai / gemini を選択可能。anthropic だけ改善すると、provider 切替時に要件2〜4（タイトル/ディレクトリ/タグ提案）の改善が片肺になる（レビュー W-B-002）。3アダプターは元々プロンプトビルダーが完全に同一だった。

### Decision
プロンプトビルダー（`buildStructure*` / `buildMetadata*`）を `app/core/adapters/llm/prompts.ts`（既存共有 `jsonEnvelope.ts` と同じ場所）に純粋関数として抽出し、anthropic / openai / gemini の3アダプターすべてが参照する。各アダプターの private メソッドは削除。

### Consequences
- 良い点: 提案品質の改善が provider 非依存になり、三重複も解消。将来のドリフトを防ぐ。テストは public な `structureToHtml`/`suggestMetadata` 経由で検証しているため破壊なし。
- トレードオフ: Issue が名指しした anthropic 以外のファイルにも変更が及ぶ（スコープを最小限に超える）が、要件の本質（provider に依らず提案品質を上げる）に沿う判断。
