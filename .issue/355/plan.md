# 実装計画 — Issue #355: P13 アップロードモーダル: LLM 提案精度の向上と登録 UX 改善

**Issue:** #355
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

P13 アップロード（取り込み）モーダル（`IngestionPreviewForm` / `UploadDialog`）の LLM 提案品質と登録体験を改善する。本文プレビュー削除・タイトル/タグ提案のプロンプト改善・既存ディレクトリツリーを文脈にしたディレクトリ提案・登録時インタラクション追加の5点を一括対応する。

## スコープ

### 含まれるもの
1. モーダル内の読み取り専用本文 HTML プレビュー削除（`contentHtml` 自体はドメイン/wire に残す）
2. タイトル提案プロンプト改善（ファイル名そのままを解消、本文内容ベースのタイトル）
3. ディレクトリ提案: 既存ツリーを LLM へ文脈注入し、既存マッチ→`suggestedDirectoryId` 解決 / 不一致→新規パス提案フォールバック
4. タグ提案プロンプト改善（件数上限・抽象度の指示で意味的集合に）
5. 登録時インタラクション（pending 強化 / 成功演出 + 該当ノートへの導線 / 失敗フィードバック）
6. ポート契約変更に伴う spec 同期・テスト更新

### 含まれないもの
- グローバルなトースト/通知基盤の導入（モーダル内 view ステートマシンで完結させる）
- #235（tool-use ベース構造化出力）の導入 — 現行 JSON envelope + retry/prefill 機構を維持
- #252（本文 HTML 編集）— 本文編集は登録後エディタ側の前提（本 Issue ではモーダル内プレビュー削除のみ）

## 実装ステップ

### 1. 本文プレビュー削除（要件1）

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:** 284-293行の本文プレビュー `<div>`（`dangerouslySetInnerHTML`）ブロックを削除。未使用になる `READONLY_CONTENT` 定数（65-66行）を削除。`preview.contentHtml` 参照が他に無いことを確認。
- **理由:** 要件で本文プレビュー不要。確認/編集はタイトル/ディレクトリ/タグ/FrontMatter に集中。`contentHtml` は wire/ドメインに残す（登録後エディタで編集）。

### 2. タイトル提案プロンプト改善（要件2）

- **対象ファイル:** `app/core/adapters/anthropic/llmProvider.ts`（`buildStructureSystemPrompt` 138-149行）
- **変更内容:** `titleSuggestion` について「ファイル名をそのまま使わず、本文内容から意味のある簡潔なタイトルを生成する」旨をシステムプロンプトに明記（locale を踏まえたタイトル言語の指示）。
- **理由:** 非構造化分岐（plain/office/pdf/image/audio）では LLM の `titleSuggestion` が使われる（runIngestionJob.ts 274行）ため、プロンプトの指示不足が主因。`fallbackTitle` は空応答時のフォールバックとして維持。

### 3. ディレクトリ提案: ポート拡張（要件3の基盤）

- **対象ファイル:** `app/core/domain/ingestion/ports/llmProvider.ts`
- **変更内容:** `LLMStructureInput` に任意フィールド `existingDirectories?: readonly string[]`（既存ディレクトリのパス列）を追加。JSDoc に「LLM が既存配置先を提案するための文脈。マッチしなければ新規パス提案にフォールバック」と明記。`LLMStructureResult.directorySuggestion` の意味（既存パス or 新規パス）を JSDoc 補強。
- **理由:** 既存ツリーを LLM に渡す経路をポート契約として表現。任意フィールドで html/markdown 分岐と後方互換。

### 4. ディレクトリ提案: adapter プロンプト反映（要件3）

- **対象ファイル:** `app/core/adapters/anthropic/llmProvider.ts`（`buildStructureSystemPrompt` / `buildStructureUserMessage`）
- **変更内容:** `input.existingDirectories` が非空なら、システムプロンプトに以下を指示し、ユーザーメッセージに既存パス一覧を含める:
  - 「既存ディレクトリ一覧から最適な配置先パスを**そのままの表記で**選ぶ」
  - 「該当なしの場合のみ新規ディレクトリを提案。**新規は単一のトップレベルディレクトリ名（スラッシュを含まない1セグメント）**で返す」（後述のコミット経路の制約に整合）
- **理由:** 「既存のどこに置くべきか／なければ適切な新規ディレクトリ」という要件を LLM に伝える。新規をネストパスにしないことで、コミット経路（root 直下に単一作成）との不整合（階層落ち）を構造的に防ぐ。

### 5. ディレクトリ提案: ツリー取得とマッチング（要件3）

- **対象ファイル:** `app/core/application/ingestion/runIngestionJob.ts`
- **パス正準形の定義（P-002 対応）:** LLM に見せるパス文字列と、`directorySuggestion` 突き合わせ時の左辺は、**同一のローカル関数から生成する**。正準形は「root（空 name）を除外し、`親名/子名` の**先頭スラッシュ無し**形式」。突き合わせ時は両辺をこの正準形に整形した上で、`DirectoryName.equals` と同様の大小無視＋前後/連続スラッシュ正規化で比較する。これにより presentation の `flattenDirectoryTree`（先頭スラッシュ付き・root 空 name）の表記揺れに左右されない。
- **変更内容:**
  - `runPipeline` 直前で `unitOfWorkProvider.run(({directoryRepository}) => directoryRepository.findTree(ownerId))` を1回呼び、`Directory[]` を parentId で辿って `{ id, path }`（path は上記正準形）の列に整形するローカルヘルパーを追加（presentation 層の `flattenDirectoryTree` は import 不可のため usecase 側にローカル実装）。
  - **`findTree` 失敗時は空配列にフォールバック**して取り込みを継続する（ツリー無し＝従来挙動。DB 一時障害で取り込み全体を落とさない）。
  - 非構造化分岐の `structureToHtml` 呼び出し（264-268行）に `existingDirectories`（正準形パス列）を渡す。
  - LLM の `directorySuggestion`（パス）を取得済みツリーの正準形パスと突き合わせ、一致したら `suggestedDirectoryId` に解決し `suggestedDirectoryName=null`、不一致なら従来どおり `suggestedDirectoryName`（**末尾セグメントを単一名として採用**）にフォールバック（300-318行付近）。
  - `PipelineDeps` に既存ツリー情報を追加し、DB アクセスは usecase 側で実施（純粋関数性を保つ）。
- **理由:** 「既存ディレクトリへの配置」を実現。LLM はパス提案のみで `DirectoryId` 解決は決定的に usecase 側で行い、不正 id 混入を構造的に排除。

### 6. 登録時インタラクション（要件5）

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`, `app/components/ingestion/IngestionPreviewForm.tsx`
- **変更内容:**
  - `View` union に `{ kind: "committed"; noteId: string; title: string }` を追加。`viewStatusText` に成功 announce を追加。
  - `onCommitted`（410-419行）を即 navigate ではなく `committed` view へ遷移させ、成功メッセージ +「ノートを開く」導線（`Link to="/notes/$noteId"`）+「閉じる」を表示する `CommittedView` を追加。motion-safe な軽い成功演出（既存 Tailwind/トークンの範囲内）。
  - `commitIngestionPreviewFn` の戻り値は `{ noteId }` のみ（title を返さない）。`committed` view の表示タイトルは **`IngestionPreviewForm` の編集後 `title` state を `onCommitted(noteId, title)` で渡す**。
  - `IngestionPreviewForm` の登録ボタン（399-406行）に pending 表示（`isPending` 時のラベル/スピナー）を追加。
  - Dialog の `closable`/`isPending` 条件に `committed` view を織り込む（成功 view では閉じられる）。
  - `viewStatusText` の `switch` に `committed` の `case` を必ず追加する（`default: throw` のため case 漏れは実行時例外になる）。
  - **失敗フィードバックは既存 inline `role="alert"` を踏襲し据え置く**（要件5の主眼は pending/成功の演出追加。失敗系は現状の inline エラー表示で要件充足とする）。
- **理由:** pending/成功/失敗の各フィードバックを既存 view ステートマシン上で完結させ、新規トースト基盤を導入せず要件を満たす。失敗は既存の inline `role="alert"` を踏襲。

### 7. タグ提案プロンプト改善（要件4）

- **対象ファイル:** `app/core/adapters/anthropic/llmProvider.ts`（`buildMetadataSystemPrompt` 155-165行）
- **変更内容:** 「文章中の単語を機械的に抽出せず、内容を考慮して意味のある集合としてのタグを 3〜5 件程度・抽象度を揃えて提案」する指示を追加（件数上限・抽象度を明記）。`aliases` の指示は維持。
- **理由:** タグが細かすぎる問題を件数上限・抽象度指示で解消。最終バリデーションは `TagName.create`（runIngestionJob.ts 291-298行）が担保。

### 8. spec 同期

- **対象ファイル:** `spec/domains/ingestion.md`（114行）, `spec/usecases/ingestion.md`（RunIngestionJob フロー）
- **変更内容:** `structureToHtml` の入力に `existingDirectories` を追加した契約と、ディレクトリ提案が既存マッチ→新規フォールバックである旨を反映。
- **理由:** ポート契約変更に設計ドキュメントを追従（CLAUDE.md の「設計が正」原則）。

### 9. テスト更新

- **対象ファイル:** `app/core/adapters/anthropic/__tests__/llmProvider.test.ts`, `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts`
- **変更内容:** `existingDirectories` を渡したときのプロンプト整形、既存パス一致時の `suggestedDirectoryId` 解決、不一致時の `suggestedDirectoryName` フォールバック、ツリー空ケースのテストを追加/更新。既存入力が任意フィールド未指定でも通ることを確認。タグ/タイトル指示文の存在検証も追加。
- **理由:** ポート/パイプラインのロジック追加に対する回帰防止。

## 設計判断

詳細は `adr.md` を参照。

- ディレクトリツリーは新規 port を作らず既存 UoW `directoryRepository.findTree` を使う（整形ヘルパーは usecase 側にローカル実装）。
- 既存マッチングは usecase 側で決定的に実施し、LLM はパス提案のみ（不正 id 混入を排除）。
- `LLMStructureInput.existingDirectories` は任意フィールド（後方互換）。
- 登録インタラクションは新規トースト基盤を導入せず既存 view ステートマシンに `committed` view を追加。
- 成功後の遷移を即 navigate から `committed` view 経由に変更（該当ノートへの導線を明示）。

## リスクと注意点

- **新規ディレクトリ提案の達成範囲（重要・要申し送り）:** コミット経路 `resolveDirectoryId`（`commitIngestionPreview.ts`）は `nameToCreate` を**必ず owner の root 直下**に作る。`suggestedDirectoryName` は単一名でネストパスを表現できないデータモデル。よって本 Issue の「新規パス提案」は**「root 直下に作る単一ディレクトリ名の提案」に縮退する**。既存ツリーへのマッチ（任意の深さの既存ディレクトリに id 解決）は完全に満たすが、深い新規ネスト階層の自動作成はスコープ外（commit DTO / `IngestionPreview` VO / DirectoryPicker への波及が大きいため別 Issue 候補）。プロンプトで新規は単一トップレベル名に制約してこの縮退を構造化する。
- ディレクトリパスのマッチングは表記揺れに弱い。正準形（ステップ5）で大小無視＋前後/連続スラッシュ正規化を実装し、不一致時は安全に新規提案へフォールバック（誤って無関係な既存ディレクトリに入れない）。LLM が既存パスを微妙に綴り間違えると新規作成へ落ちて重複ディレクトリが生まれうるトレードオフは残る（過剰一致も禁物なので正規化は控えめに）。
- `findTree` の追加 DB アクセスが1クエリ増えるが LLM 呼び出しに比べ無視できる。ツリー巨大時はパス列のトークン量に注意。失敗時は空配列フォールバックで取り込みを継続。
- `onCommitted` のタイミング変更で、コミット後に親が即 `onClose` していた既存挙動が変わる。`committed` view を閉じられる状態（`isPending` に含めない）として整理する。
- LLM プロンプト改善は出力品質の改善であり決定的でない。テストはプロンプト整形を検証し、出力内容そのものは手動/ブラウザ検証で確認する。
- 既存パス解決時は `suggestedDirectoryName=null` にすること（`IngestionPreview.create` の長さ検証は新規名のみに効く）。

## テスト方針

- ユニット: `llmProvider.test.ts` で `existingDirectories` 有無それぞれのプロンプト整形、タグ/タイトル指示文の存在を検証。
- 統合: `runIngestionJob.integration.test.ts` で、既存パス一致（`suggestedDirectoryId` 解決）/ 新規パス（`suggestedDirectoryName`）/ ツリー空の各ケースを検証。
- 手動/ブラウザ: (1) 本文プレビューが消えている、(2) タイトルがファイル名でなく内容ベース、(3) 既存ディレクトリ提案が選択済みで現れる、(4) タグが粗い意味的集合、(5) 登録後に成功演出と「ノートを開く」導線、を確認。
- 変更後は `pnpm typecheck && pnpm lint:fix && pnpm format`（biome は `./node_modules/.bin/biome` で format:check 確認）。

## レビュー履歴

### 1周目
**修正した点**:
- [P-001/S-001（要件視点とアーキ視点で重複）] 新規ディレクトリ提案がコミット経路の制約（root 直下に単一作成）で末尾1セグメントに縮退する点を、ステップ4のプロンプト制約（新規は単一トップレベル名）・リスク欄・ADR-004 に明記。達成範囲を「既存マッチは完全、新規は単一名」と申し送り化。
- [P-002] LLM 提示パスと突き合わせパスの正準形が未定義だった点を、ステップ5に「正準形を1関数で生成」と明記し ADR-005 を追加。
- [S-004] `findTree` 失敗時の空配列フォールバックをステップ5に追加。
- [S-001（アーキ視点）] `committed` view の表示タイトルはフォームの編集後 `title` state を `onCommitted(noteId, title)` で渡す旨をステップ6に明記。
- [S-002（アーキ視点）] `viewStatusText` に `committed` の case を必ず追加する注意をステップ6に明記。
- [S-002（要件視点）] 失敗フィードバックは既存 inline `role="alert"` 据え置きで要件充足とする判断をステップ6に明記。

**取り込んだ改善提案**:
- 上記の通り、提示された S 提案はいずれもスコープ内で妥当なため取り込み済み。

**見送った提案とその理由**:
- 深い新規ネスト階層の自動作成（P-001 の根治）: commit DTO / VO / DirectoryPicker への波及が大きくスコープ過剰。別 Issue 候補として Phase 4 で申し送る（ADR-004）。

### 2周目
両視点とも問題点ゼロで終了。1周目の反映（P-001/P-002/S系）がコード実体（コミット経路制約・`flattenDirectoryTree`・`viewStatusText` の default throw・`findTree` の戻り型）と矛盾しないことを確認。実装フェーズへ。
