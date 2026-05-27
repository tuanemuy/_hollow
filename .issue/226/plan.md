# 実装計画 — Issue #226: アップロード時にメタデータ提案ポップアップで確認・修正してから登録

**Issue:** #226
**作成日:** 2026-05-27
**複雑度:** 中〜大規模

---

## 目的

ファイルアップロードの操作と登録確認を「ひとつのモーダル／ドロワー」内で完結させる。具体的には:

- ファイル選択直後にモーダルを開き、LLM 推論の完了まで待機 UI を表示
- 推論完了後、同じモーダル内でタイトル／ディレクトリ／タグ／Front Matter を編集できるようにする
- モーダル内で「登録」「破棄」のアクションを完結させる（再生成・再試行は別 Issue 化、後述）
- 取り込みキュー（`/upload`）は「裏で進行中／失敗／プレビュー保留」のジョブを後から確認する画面として位置付け直す
- spec/design 配下のページ設計（B1/B2/B4 含む）に新フローを反映する

## スコープ

### 含まれるもの

- `UploadDialog` のステートマシン化（select → uploading → waiting → editing → submitting → failed）
- LLM 推論完了をクライアント側でポーリング監視する仕組み（最大 180 秒、超過時はキュー画面に誘導）
- プレビュー編集フォーム（タイトル／ディレクトリ／タグ／Front Matter）
- 本文 HTML は「読み取り専用プレビュー」として表示（編集はフォローアップ Issue で対応 — ADR-002）
- `commitIngestionPreviewFn` のスキーマ拡張（`frontMatterJson` を受け取れるように — note 側 ADR-008 規約に従う）
- 単体ジョブ取得用の `getIngestionJobFn` 追加（ポーリングで使用）
- ディレクトリツリー取得用の client 経路（`getDirectoryTreeFn` を `note/actions.ts` に追加 — モーダルの editing view 突入時に lazy load）
- `/upload` ページの説明文・位置付け更新
- `spec/pages/index.md` P13 節、`spec/scenario/ingest.md` B1/B2/B4 節の更新
- `spec/design/pages/P13a-upload-modal.html` の新規追加（モーダルの 3 ステート）

### 含まれないもの

- 本文 HTML 編集機能（usecase の `CommitIngestionPreviewModifications` に `contentHtml` 経路がないため。ドメイン拡張を伴うので別 Issue として起票 — ADR-002）
- **モーダル内**の「再生成」アクション（usecase `regenerateIngestionPreview` は現状 LLM の再駆動を行わない — `dispatchDomainEvent` で `ingestion.regenerated` が意図的に除外されている（Issue #57 ADR-004）。本 Issue で修正すると独立した usecase / worker 改修が必要なため別 Issue 化 — ADR-006）。`/upload` 上の既存 `IngestionJobRow` の再生成ボタンは「現状維持」とし、フォローアップ Issue（ADR-006）で `regenerateIngestionPreview` の修正と一緒に挙動が正される
- failed 時の「再試行」アクション（既存 `retryIngestionJob` usecase は admin 専用 — オーナー経路の新設は別 Issue。本 Issue では failed 表示は「破棄」と「キュー画面で詳細を見る」のみ — ADR-007）
- `internalLinkRefs` の編集 UI（Issue #226 の要件項目ではない。preview 由来の値は usecase 側で継承される — リスク欄に動作確認手順を記載）
- SSE / WebSocket によるリアルタイム化（#221 と一緒に検討する余地はあるが本 Issue ではポーリングで充分 — ADR-001）
- `UploadForm.tsx` のリファクタリング（`/upload` ページのフォールバック用途で残す）
- アップロードフィードバック改善全般（#221 の領域）

## 前提

- Issue #220 は main にマージ済み（commit `45c737c`）。`UploadDialog` / `UploadDialogMount` / `UploadButton` / `AppShell` への mount は既に存在する。本 Issue 実装ブランチは main を起点に切る
- `FrontMatter` は generic key-value（#237）。preview から拾った値をそのまま編集 → commit へ往復できる
- 取り込みキューは discarded ジョブを既定で除外（#229）
- FrontMatter の transport 規約（note 系 ADR-008）は `frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional()`。TanStack Start の transport-serialisation が `Record<string, unknown>` をきちんと型付けできないため JSON 文字列で渡し、handler 側で `parseFrontMatterJson` で復元 → usecase に渡す。**`commitIngestionPreviewFn` でもこの規約に従う**
- `regenerateIngestionPreview` usecase は spec 上「キューに RunIngestionJob を再 enqueue」と書かれているが実装上は `processing` 遷移のみで LLM は再駆動されない（既知の乖離）。本 Issue では触らず、UI から再生成ボタンを外す

## 実装ステップ

### 1. backend: 単体ジョブ取得の server function 追加

- **対象ファイル:** `app/components/ingestion/actions.ts`、`app/components/ingestion/schema.ts`
- **変更内容:**
  - `getIngestionJobSchema = z.object({ jobId: z.string().min(1) })` を `schema.ts` に追加
  - `actions.ts` に `getIngestionJobFn` を追加し、既存 `getIngestionJob` usecase を呼ぶ
  - ownership 検証は usecase 側で行う（actor を渡すだけで `ForbiddenError` が返る）。handler 側で追加チェックは書かない
- **理由:** モーダルが `pending / processing` 状態のジョブを `previewing` までポーリングするのに必要

### 2. backend: `commitIngestionPreviewFn` のスキーマ拡張（`frontMatterJson` 規約）

- **対象ファイル:** `app/components/ingestion/schema.ts`、`app/components/ingestion/actions.ts`、`app/components/note/schema.ts`、`app/components/note/actions.ts`
- **変更内容:**
  - `app/components/note/schema.ts` から `FRONT_MATTER_JSON_MAX_BYTES` を export する（現状 module-private）
  - `app/components/note/actions.ts` から `parseFrontMatterJson` を export する（現状 module-private）
  - `commitIngestionPreviewSchema` に `frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional()` を追加
  - `actions.ts` の `commitIngestionPreviewFn` handler 内で `parseFrontMatterJson` を呼んで `modifications.frontMatter` に渡す
- **理由:** Issue 完了条件「Front Matter を編集可能」を満たす。note 系 ADR-008 規約と完全に整合させ、`BusinessRuleError("FRONT_MATTER_JSON_INVALID")` のエラーメッセージ系統も統一する。ingestion 1 箇所からしか使わないため `app/lib/` への切り出しはせず、note 側 export 化のみで対応する（DRY と結合度のバランス）

### 3. backend: ディレクトリツリー取得の server function 追加

- **対象ファイル:** `app/components/note/actions.ts`、`app/components/note/schema.ts`
- **変更内容:**
  - 既存 `loadDirectoryTreeFlat`（loader）を、`getDirectoryTreeFn`（server function）として `actions.ts` にラップして公開する
  - **actor 取得は server 側で `requireCurrentUser()` を呼ぶ**。client から `actorUserId` を渡せる形にしない（他ユーザーのツリーを読める脆弱性を防ぐ）
  - 既存ノートエディタ系の loader からも同 server function を併用できる形にする（重複ロジックは削減）
- **理由:** `IngestionPreviewForm` がモーダル `editing` 突入時に client 側からツリーを lazy load するため。`AppShell` 全体でツリーを毎リクエスト読むのは過剰なので、必要な瞬間にだけ取りに行く

### 4. frontend: `UploadDialog` をステートマシン化

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`（書き換え）
- **変更内容:**
  - ローカル state を `view: "select" | "uploading" | "waiting" | "editing" | "submitting" | "failed"` で持つ
  - `selectedJobId: string | null` を保持
  - `view === "select"`: ドロップゾーン UI（既存 `UploadForm.tsx` のロジックを移植）
  - ファイル選択時:
    1. 単一ファイル: `view = "uploading"` → `uploadFileFn` を呼んで `jobId` 取得 → `view = "waiting"` で `getIngestionJobFn` をポーリング
    2. 複数ファイル: `view = "uploading"` で全件を順次 `uploadFileFn`。途中失敗時も他のファイルは継続。完了後「N 件中 K 件キューに追加、M 件失敗。詳細はキュー画面で」を表示してキュー画面誘導
  - `view === "waiting"`: 1.5〜2 秒間隔ポーリング。`status === "previewing"` → `view = "editing"`、`status === "failed"` → `view = "failed"`、180 秒で諦めて「キュー画面で続きを確認」誘導 → 閉じる
  - ポーリング失敗時の方針:
    - `ForbiddenError` / `NotFoundError` 等 application 層が返す Business 系エラー: ポーリング即停止 → `view = "failed"`（ジョブが他者所有 or 削除済み）
    - transient なネットワーク失敗 (`SystemError` 系): リトライ（最大 3 連続失敗で停止）、180 秒タイムアウトとは独立にカウント
  - `view === "editing"`: モーダル内で `getDirectoryTreeFn` を呼んでツリーを取得（並行可）、`IngestionPreviewForm` をマウント
  - `view === "failed"`: 「破棄」「キュー画面で詳細を見る」の 2 アクション
- **理由:** Issue の中核要件「ファイル選択 → 推論待ち → 提案表示 → 登録／破棄 がひとつのモーダル内で完結」を実現
- **モバイル幅対応:** モーダル本体は `max-height: 90vh; overflow-y: auto`、アクションバーは `sticky bottom-0` で常時操作可能にする

### 5. frontend: プレビュー編集フォームコンポーネントを新規追加

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`（新規）
- **変更内容:**
  - props: `{ job: IngestionJobDTO; tree: readonly FlatDirectory[]; onCommitted: (noteId: string) => void; onDiscarded: () => void }`
  - フィールド:
    - **タイトル**: `<input>`、`preview.title` を初期値
    - **保存先ディレクトリ**: 既存 `DirectoryPicker` を流用
    - **タグ**: 既存のタグ入力 UI を再利用（無ければシンプルなチップ＋入力で MVP 実装）
    - **Front Matter**: **MVP として raw JSON 編集（`<textarea>` + JSON.parse バリデーション）から開始**（既存 `FrontMatterEditor` は `editorReducer` 由来の state shape に強く依存しているため、ingestion へ流用するなら editorState のユーティリティ抽出が必要 — 規模を抑えるため raw JSON 編集に絞る。完了条件「Front Matter を編集可能」は満たせる）
    - **本文 HTML**: 読み取り専用プレビュー（`.note-detail-content` で既存スタイルを当てる）
  - アクション: 「登録」「破棄」「キャンセル」3 ボタン
    - 登録: `commitIngestionPreviewFn` に `frontMatterJson` を含めて送信 → 成功で `onCommitted(noteId)` → モーダル閉じ → ノート詳細へ遷移
    - 破棄: ConfirmDialog 経由で `discardIngestionPreviewFn` → `onDiscarded()` でモーダル閉じる
    - キャンセル: モーダルを閉じる（ジョブはそのまま残り、キュー画面で続きから操作可能）
  - **再生成ボタンは置かない**（ADR-006）
- **理由:** Issue 要件「タイトル / ディレクトリ / タグ / Front Matter を編集可能」「登録 / 破棄 をモーダル内で完結」を満たす

### 6. frontend: `FlatDirectory` の export 方針

- **対象ファイル:** `app/components/note/loaders.ts`（既存 export 維持）、または `app/components/ingestion/` 側で type-only import
- **変更内容:**
  - **`import type { FlatDirectory } from '../note/loaders'` で確定**（既に `note/loaders.ts` から export 済みで `NoteDetail.tsx` 等が利用中。`note/types.ts` 新設は不要）
- **理由:** ingestion → note の type-only import が新しい依存方向を生む可能性があるため、明示的に意思決定する。type-only なら結合度は軽微

### 7. frontend: `/upload` ページの位置付け再整理

- **対象ファイル:** `app/components/ingestion/UploadPage.tsx`
- **変更内容:**
  - ページ冒頭の説明文を「裏で進行中・失敗・プレビュー保留のアップロードを管理する画面」に書き換え
  - `UploadForm` のページ内設置は維持（直リンク経由のフォールバック）
  - `IngestionJobRow` の挙動は現状維持（previewing ジョブをカードから操作する動線として残す）
- **理由:** Issue 完了条件②「取り込みキュー画面は『裏で進行中／失敗／プレビュー保留』を見るためのリスト位置付けに整理」

### 8. spec 反映: シナリオとページ設計の更新

- **対象ファイル:**
  - `spec/pages/index.md` の P13 節
  - `spec/scenario/ingest.md` の B1 / B2 / B4 節
  - `spec/usecases/ingestion.md`（必要に応じて）
- **変更内容:**
  - P13: 主動線が「モーダル内で完結（選択 → 待機 → 編集 → 登録）」であることを明記。`/upload` ページの役割を「キュー閲覧・後追い操作・フォールバック」に書き換え
  - B1: モーダル内でステップ 4〜7 が起こることを前置きで明示。本文編集は別 Issue 化（ADR-002）を明記
  - B2: 「複数ファイル一括時は全件キューに積み、キュー画面で順次プレビュー操作」を明示
  - B4: 「タイトル・ディレクトリ・FrontMatter の編集はモーダル内、本文編集は別 Issue」を明示
- **理由:** Issue 完了条件③「spec/design 配下のページ設計に新フロー反映」と整合性確保

### 9. spec 反映: デザインモック（HTML）

- **対象ファイル:** `spec/design/pages/P13a-upload-modal.html`（新規）
- **変更内容:**
  - 新フローの 3 ステート UI モック（ドロップゾーン / 推論待ちスケルトン / プレビュー編集フォーム）を 1 ファイルに並べて作成
  - モバイル幅サンプルを 1 枚追加
  - 既存 `P13-upload.html` は `/upload`（キュー閲覧）として残す
- **理由:** Issue 完了条件③。Apple Calm トーンに沿った UI 基準を提示

### 10. テスト

- **対象ファイル:**
  - `app/components/ingestion/__tests__/UploadDialog.test.tsx`（新規）
  - `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx`（新規）
  - `app/core/application/ingestion/__tests__/` 内の commit integration test（既存にケース追加）
- **変更内容:**
  - `UploadDialog`: ステート遷移（select → uploading → waiting → editing、waiting でポーリングが previewing を観測したら editing、180 秒タイムアウトで「キュー画面誘導」、failed 表示で「破棄／キュー画面」アクションが出る、ポーリング中の Business エラー時の挙動）
  - `IngestionPreviewForm`: 各フィールドが preview 初期値で埋まる、commit ボタンが `frontMatterJson` を含む正しい payload を送る、JSON 不正時のエラー表示
  - **`frontMatterJson` 不正値（malformed JSON / 配列 / プリミティブ）で `BusinessRuleError("FRONT_MATTER_JSON_INVALID")` が UI エラー表示にマッピングされる**ことを単体テストでカバー（note 系の同経路と差分が出ないようにする）
  - `commitIngestionPreviewFn` 経由で `frontMatterJson` が note に反映される integration ケース
- **理由:** UI ロジックが複雑なのでリグレッション防止

### 11. フォローアップ Issue 起票（Phase 4: Ready for review 切替後、マージ前）

**起票タイミング:** Phase 3 レビューが APPROVED に到達して PR を Draft → Ready for review に切り替えた後、マージ前に起票する。これで本 Issue PR のレビュアーが「分割された残作業」を確認できる。

- 「取り込みプレビューモーダルで本文 HTML を編集できるようにする」（ADR-002）
- 「`regenerateIngestionPreview` の実装と spec を一致させる（LLM 再駆動を復活させる）」（ADR-006）— 完了後に `IngestionJobRow` の再生成ボタンが期待通り動作するかの再検証も含む
- 「failed ジョブを所有者が再試行できるようにする」（ADR-007）

## 設計判断

- **D1 推論待ち手段**: クライアントポーリング（1.5〜2 秒、最大 180 秒）。Workers + Queues 構成では SSE/WebSocket のインフラコストが高い
- **D2 推論待ち UI**: スケルトン + テキスト「LLM がタイトルとメタデータを提案中…」
- **D3 「破棄」挙動**: `discardIngestionPreview` を呼んで `discarded` 化（ConfirmDialog で誤操作防止）
- **D4 「再生成」は本 Issue から外す**: 実装と spec が乖離しており、修正には独立した usecase / worker 改修が必要 — 別 Issue 化
- **D5 本文 HTML 編集は本 Issue から外す**: usecase 拡張が必要 — 別 Issue 化
- **D6 複数ファイル選択時**: 全件キューに積む。Issue 完了条件①「モーダル内で完結」は **単一ファイル時に成立、複数ファイル時はモーダル → キュー誘導の組み合わせで完結を担保**と解釈
- **D7 URL hash**: `editing` 中も `#upload` のまま保持
- **D8 `UploadForm.tsx` 残す**: `/upload` ページのフォールバック用途で維持
- **D9 ディレクトリツリー**: `AppShell` 同期ロードではなく、モーダルの editing 突入時に server function 経由でクライアント lazy load
- **D10 FrontMatter 編集 UI**: MVP として raw JSON 編集に絞る（`FrontMatterEditor` の reducer 依存抽出はスコープ外）
- **D11 failed 時の retry は本 Issue から外す**: 既存 retry は admin 専用 — オーナー経路は別 Issue

詳細は [`adr.md`](./adr.md) を参照。

## リスクと注意点

- **`regenerateIngestionPreview` の既知の乖離**: spec は「LLM 再駆動」を期待しているが実装は `processing` 遷移のみ。本 Issue では UI から再生成ボタンを外すことで顕在化を防ぐ。フォローアップ Issue で修正
- **`internalLinkRefs` の継承**: `modifications` に `internalLinkRefs` を渡さない場合、usecase が preview の `internalLinkRefs` を継承する（既存挙動）。本 Issue ではこれを変えない。manual test で「preview 由来の internal link が commit 後に保たれる」ことを確認
- **ポーリングの動作タイミング**: 1 度に編集中のジョブは 1 件のみ（UX 設計判断）。Cloudflare サブリクエスト上限とは独立した話なのでリスク文言は注意
- **タイムアウト時のジョブ取り扱い**: 180 秒で諦めても `pending / processing` のジョブは残るので、ユーザーはキュー画面で続きから操作可能。モーダル内に明示誘導を出す
- **failed 時のリカバリ**: 「破棄」と「キュー画面で詳細を見る」の 2 オプションのみ（再試行は別 Issue）
- **複数ファイル投入時の途中失敗**: シリアル投入の途中で 1 件失敗しても残りは継続。完了後に集計表示
- **payload サイズ**: `frontMatterJson` は `FRONT_MATTER_JSON_MAX_BYTES`（64 KiB）で上限。inputValidator が validation
- **モバイル幅**: `max-height: 90vh + overflow-y: auto`、`sticky` action bar
- **デザインモック保守**: 主要 3 state（select / waiting / editing）+ モバイル幅 1 枚に絞る

## テスト方針

### 単体

- `UploadDialog` のステートマシン遷移テスト（fake server function でモック）
- `IngestionPreviewForm` の初期値・送信ペイロード・JSON エラーハンドリング
- `commitIngestionPreviewSchema` の zod テスト（`frontMatterJson` 含む payload の validate）

### Integration

- `frontMatterJson` を経由した commit が note に正しく反映されることを確認
- `internalLinkRefs` が `modifications` 未指定でも preview から継承されることを確認

### Manual

- `pnpm dev` で起動し、新フローを `spec/manual-tests/` の手順に従って確認
  - ヘッダーから「アップロード」モーダル開く
  - 1 ファイル投入 → スケルトン → プレビュー → タイトル／ディレクトリ／タグ／FrontMatter 編集 → 登録 → ノート詳細
  - 別ファイルで破棄 → 確認ダイアログ → discarded
  - 複数選択 → 「N 件をキューに追加」、`/upload` でキュー確認
  - 180 秒タイムアウトのシミュレート（モック）→ キュー誘導表示
  - failed ジョブ → 「破棄／キュー画面」アクションのみ
  - `/upload` 直接アクセス → 説明文更新確認、キュー上のジョブで commit / discard が動作

### CI

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit && pnpm test:integration`

---

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:

- [P-001] 完了条件①「モーダル内完結」と複数ファイル時挙動の解釈を ADR-003 / D6 に明記し、spec/scenario/ingest.md B2 への反映をステップ 8 に追加
- [P-002] ADR-002（本文 HTML スコープ外）にフォローアップ Issue 起票を明記、ステップ 11 として Phase 4 で起票する手順を追加
- [P-003] `internalLinkRefs` の継承動作を「含まれないもの」とリスク欄に明記、integration テストで確認

**修正した点（アーキテクチャ・リスク視点）**:

- [P-001] `regenerateIngestionPreview` が現状 LLM を再駆動しないことを確認（`dispatchDomainEvent` で意図的に除外、Issue #57 ADR-004）。本 Issue で再生成 UI を外し、フォローアップ Issue 化（ADR-006）
- [P-002] `frontMatterJson` 規約（note 系 ADR-008）に従い、`z.record` ではなく `z.string().max(FRONT_MATTER_JSON_MAX_BYTES)` で受けて `parseFrontMatterJson` を再利用する形に修正
- [P-003] failed 時の retry は `retryIngestionJob` が admin 専用のため本 Issue から外し、UI は「破棄／キュー画面で詳細」の 2 オプションに絞る（ADR-007）

**取り込んだ改善提案**:

- [S-001 要件] `/upload` 位置付け再整理の具体化（説明文書き換え + 既存 IngestionJobRow の操作経路維持を明示）
- [S-004 要件] ポーリングタイムアウト 60 秒 → 180 秒に変更
- [S-001 アーキ] ディレクトリツリーは AppShell 同期ロードではなく `getDirectoryTreeFn` で client lazy load（ステップ 3 / D9）
- [S-002 アーキ] サブリクエスト上限関連の文言を修正（UX 設計判断としての記述に変更）
- [S-003 アーキ] `FrontMatterEditor` 再利用は重いので MVP は raw JSON 編集に絞る（D10）
- [S-004 アーキ] `getIngestionJobFn` の ownership 検証は usecase に任せる（ステップ 1）
- [S-005 アーキ] `FlatDirectory` の type-only import 方針をステップ 6 に追加
- [S-006 アーキ] モバイル幅対応（max-height + sticky action bar）をステップ 4 に追加
- [S-007 アーキ] 複数ファイル投入時のシリアル失敗挙動をステップ 4 に明示

**見送った提案とその理由**:

- なし（再掲のため重複）

### 2周目

**要件カバレッジ視点:** 問題点ゼロで終了（APPROVE）

**アーキテクチャ・リスク視点で修正した点**:

- [P-001] ADR-006 / ADR-007 の射程を「モーダル限定」と明示。`/upload` の `IngestionJobRow` 既存ボタンは現状維持（フォローアップ Issue で挙動を一緒に検証）
- [P-002] `FRONT_MATTER_JSON_MAX_BYTES` と `parseFrontMatterJson` の共有方針を「note 側 export + ingestion から import」に確定。ステップ 2 に対象ファイルとして note 側 schema/actions を追加

**取り込んだ改善提案**:

- [S-001] `getDirectoryTreeFn` で `requireCurrentUser()` を呼ぶ脆弱性対策をステップ 3 / ADR-008 に追加
- [S-002] `FrontMatterEditor` の raw JSON タブと UI 体験を揃える方針を ADR-009 に追加（spec/design モックにも反映）
- [S-003] ポーリング失敗時のエラー切り分け（Business 系 → 即停止、transient → 最大 3 連続失敗で停止）をステップ 4 に追加
- [S-004] `frontMatterJson` 不正値の UI エラーマッピングテストをステップ 10 に追加
- [S-005] `FlatDirectory` の import を `import type { FlatDirectory } from '../note/loaders'` で確定（ステップ 6）
- [S-006] フォローアップ Issue 起票タイミングを「Phase 3 APPROVED 後・Ready for review 切替後・マージ前」と明示（ステップ 11 / ADR-006 / ADR-007）

**見送った提案とその理由**:

- なし

### 3周目

両視点とも問題点ゼロで終了（APPROVE）。実装フェーズに進める準備が整っている。
