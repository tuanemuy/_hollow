# 実装計画 — Issue #538: ingestion: アップロード導線を「投げっぱなし＋キューで編集・保存」に再設計する

**Issue:** #538
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

アップロードモーダルを「ファイルを送信したらキューに積んですぐ解放する」投げっぱなしモデルに再設計し、`previewing` ジョブの編集（タイトル・ディレクトリ・タグ・Front Matter）をキュー側の導線で行えるようにする。あわせてアップロード後にキューへ自然に誘導される導線（成功確認ビュー・ヘッダーのキュー件数バッジ）を整備する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | モーダルでファイルを送信すると（単一・複数とも）、アップロード API 完了時点で `queued` 結果ビュー（「N 件をキューに追加しました」＋キューへのリンク）が表示される。`UploadDialog` の View 型に `waiting` / `editing` が存在せず、`getIngestionJobFn` ポーリング（`POLL_*` 定数）と `IngestionPreviewForm` の使用がモーダルから削除されている | Issue 本文 1 | 6, 7 |
| AC-2 | `queued` ビュー表示中に「続けてアップロード」「閉じる」がいつでも押せ、押下を妨げる待機 UI（スピナー・disabled 状態・ジョブ完了待ち要素）が存在しない。「続けてアップロード」で `select` に戻り別ファイルを即座に投げられ、「閉じる」でモーダルが閉じて他の作業に移れる | Issue 本文 1 | 7 |
| AC-3 | `/upload` のキューで `previewing` 状態のジョブ行に「編集」アクションがあり、開いた編集ビューでタイトル・ディレクトリ・タグ・Front Matter を変更して保存（commit）できる | Issue 本文 2 | 8, 9 |
| AC-4 | 編集ビューから破棄・再生成も実行でき、再生成後はキューのポーリング表示（pending/processing の進捗表示）が状態を追跡する | Issue 本文 2（IngestionPreviewForm 相当の UI をキュー導線で再利用） | 8, 9 |
| AC-5 | モーダルの結果ビューに `/upload` への導線があり、ヘッダーのアップロードボタンに未処理（pending / processing / previewing）ジョブ件数のバッジが表示される。バッジはアップロード（モーダル・`/upload` ページの `UploadForm` の両経路）・保存・破棄の操作後に更新される | Issue 本文 3 | 1–7, 9 |
| AC-6 | `spec/pages/index.md` の P13（モーダル完結フロー前提の記述）と `UploadPage` の説明文が新モデルに合わせて更新され、`.issue/319/adr.md` 等モーダル前提 ADR の supersede が記録される | Issue 補足 | 10 |

## スコープ

### 含まれないもの

- グローバルなトースト通知基盤の新設 — 本リポジトリにトーストコンポーネントは存在せず、Issue の「成功トースト/リンク**等**」は例示。投げっぱなし後の確認はモーダル内の結果ビュー（成功メッセージ＋キューへのリンク）で満たす。トースト基盤はこの Issue の本質（導線再設計）に対して過大なインフラ追加になる（adr.md ADR-002）。
- 編集ビューでの本文 HTML 編集 — 既存 spec（P13）どおりフォローアップ扱いのまま。
- `IngestionQueue` のポーリング戦略自体の変更 — 既存の 4s/16s ポーリングはそのまま使う。
- モーダルからの一括アップロード進捗 UI の刷新 — 既存の `uploading`（件数進捗）ビューは維持する。

## 調査結果

- 関連ファイル:
  - `app/components/ingestion/UploadDialog.tsx` — モーダル本体。`select / uploading / waiting / editing / failed / multiResult / timedOut / committed / queueGuidance` の 9 ビューのステートマシン＋180 秒ポーリング（`POLL_TIMEOUT_MS`）＋ディレクトリツリー lazy load を内包。
  - `app/components/ingestion/IngestionPreviewForm.tsx` — 編集フォーム。props 駆動（`job / tree / onCommitted / onDiscarded / onRegenerated / onCancel`）で `UploadDialog` 非依存。レイアウトは Dialog の padding（`-mx-6` 等）を前提にしている。
  - `app/components/ingestion/IngestionQueue.tsx` / `IngestionJobRow.tsx` — `/upload` のキュー一覧（client polling）と行アクション（保存=LLM 提案値のまま commit／再生成／破棄／再試行／ノートを開く）。編集はできない。
  - `app/components/ingestion/UploadPage.tsx` / `UploadForm.tsx` / `UploadDialogMount.tsx` / `UploadButton.tsx` / `uploadSearch.ts` — `/upload` ページとモーダルのマウント（URL hash `#upload`）、ヘッダー CTA。
  - `app/components/ingestion/actions.ts` / `loaders.ts` / `wire.ts` / `schema.ts` — server-fn 群（`uploadFileFn` / `getIngestionJob(s)Fn` / `commit` / `discard` / `regenerate` / `ownerRetry` / `getEffectiveIngestionPromptsFn`）と RSC ローダー。
  - usecases: `app/core/application/ingestion/{uploadFile,getIngestionJob,getIngestionJobs,commitIngestionPreview,discardIngestionPreview,regenerateIngestionPreview,ownerRetryIngestionJob}.ts`、`view.ts`。
  - port: `app/core/domain/ingestion/ports/ingestionJobRepository.ts`（`findByOwner` / `findRecent` / `findStuck` 等。owner スコープの **count は未提供**）。adapter: `app/core/adapters/d1/repositories/ingestionJobRepository.ts`。
  - `app/components/layout/Header.tsx` / `AppShell.tsx` — ヘッダー CTA（`UploadButton`）。`_app` ルートの AppShell ローダーは `staleTime: Infinity` で leaf ナビゲーションでは再実行されない（バッジをサーバーレンダリングすると更新されない、という制約の根拠）。
  - 過去 ADR: `.issue/319/adr.md`（waiting ポーリング fatal 時の `queueGuidance` ビュー）、`.issue/253`（再生成→waiting 再突入）、spec: `spec/pages/index.md` P13（「モーダルで完結」が主動線と明記）。
- あるべきアーキテクチャ: ヘキサゴナル＋DDD。依存方向は presentation → application → domain、ポートは内側で定義し adapter が実装。入力検証は transport 境界（server-fn の `inputValidator`）と VO 構築の 2 点。RSC でのデータ取得は async server component＋`serverData` ローダー、ミューテーションは server-fn。スタイルは utility-first、状態は `data-*`。
- 既存実装の状態: レイヤー構造・server-fn・ローダー・ポーリングのパターンはあるべき姿と一致しており、踏襲する。乖離は実装ではなく **UX 方針**（spec P13 の「モーダル完結」）にあり、本 Issue はその方針転換。spec の更新を実装ステップに含める（AC-6）。
- 依存関係: ヘッダー（`Header.tsx`）、`/upload` ページ、`#upload` ハッシュ駆動のモーダルマウント。`UploadDialog.test.tsx` / `IngestionJobRow.test.tsx` / `IngestionPreviewForm.test.tsx` / `IngestionQueue.test.tsx`。バックエンドの commit / regenerate / discard / upload usecase 自体は変更不要（既にジョブ単位の API として完成している）。

## 設計

### ドメインモデルへの影響

エンティティ・VO・不変条件の変更は **なし**。ジョブのライフサイクル（pending → processing → previewing → saved/failed/discarded）は既にキュー前提で設計されており、本 Issue は UI 導線の再配置。

唯一の追加は読み取りポートの拡張: `IngestionJobRepository` に owner スコープの件数取得 `countByOwner(ownerId, opts: { statuses })` を追加する（ヘッダーバッジ用。`findByOwner` で 50 件取得して数えるのは転送・デシリアライズの無駄で、count は既存 `NoteRepository.countByOwner` と同型の確立パターン。adr.md ADR-003）。

### ユースケース / アプリケーションロジック

- 新規: `countActiveIngestionJobs`（`app/core/application/ingestion/`）— actor の `pending / processing / previewing` ジョブ件数を返す read-only usecase。バッジが意味する「未処理（ユーザーの対応待ち or 進行中）」の status 集合はこの usecase に定数として閉じ込める。
- 既存 usecase の変更はなし。`commitIngestionPreview` は既に `modifications`（title / directoryId / directoryNameToCreate / tagNames / frontMatter）を受けるので、キュー側編集はそのまま使える。

### アダプター / 永続化 / 外部連携

- `app/core/adapters/d1/repositories/ingestionJobRepository.ts` に `countByOwner` を実装（`SELECT count(*)` + `status IN (...)`）。スキーマ変更・マイグレーションは不要。
- application 層テストで使う in-memory フェイク（ingestion usecase テスト内のフェイクリポジトリ）にも同メソッドを追加。

### UI / プレゼンテーション

1. **モーダルの縮退**（`UploadDialog.tsx`）: ビューを `select / uploading / queued` の 3 つに縮退する。
   - `queued` は現行 `multiResult` を単一・複数で統一した結果ビュー（`total / succeeded / failedNames`、単一は `total: 1`）。「N 件をキューに追加しました」＋「キュー画面を開く」リンク（既存どおり `/upload`）＋「続けてアップロード」（`select` に戻る）＋「閉じる」。
   - 削除: `waiting / editing / failed / timedOut / committed / queueGuidance` ビュー、180 秒ポーリング一式（`POLL_*` 定数、`isPollFatalError`、`transientFailuresRef`、`origin` 判別）、ディレクトリツリー lazy load、`IngestionPreviewForm` / `FailedView` の使用、`getIngestionJobFn` / `discardIngestionPreviewFn` / `ownerRetryIngestionJobFn` / `getDirectoryTreeFn` のモーダル内使用。
   - 単一アップロード成功後も `routerInvalidate` を呼ぶ（現行は複数のみ）— `/upload` 表示中のローダーとバッジを更新するため。
   - アップロード失敗（単一）は現行どおり `select` に戻してインラインエラー表示。カスタムプロンプト accordion・クライアント検証バナーは維持。
   - SR 文言（`viewStatusText`）と `aria-live` の構造は維持し、ビュー縮退に合わせて整理。
2. **キュー側編集**（新規 `IngestionJobEditDialog.tsx` ＋ `IngestionJobRow.tsx`）:
   - `previewing` の行に「編集」ボタンを追加し、行ローカル state で `IngestionJobEditDialog` を開く（adr.md ADR-001）。
   - `IngestionJobEditDialog` は `Dialog` ＋ `IngestionPreviewForm` の薄いラッパー。ディレクトリツリーの lazy load（現行 `UploadDialog` の `isEditing` 時ロードと同パターン）と、開いた際のタイトル input への initial focus（`titleInputRef`）を持つ。
   - フォームのコールバック配線: `onCommitted` → ノートへ navigate（行の即時保存と同じ着地）。`onDiscarded` → ダイアログを閉じて invalidate。`onRegenerated` → ダイアログを閉じて invalidate（waiting 再突入はせず、キューのポーリングと行の進捗表示が pending → previewing を追跡する）。`onCancel` → 閉じる。
   - 行の既存アクション（提案値のまま保存／再生成／破棄）は維持。「編集」は保存の隣に置く。
3. **ヘッダーバッジ**（新規 `IngestionQueueBadge.tsx` ＋ `actions.ts` ＋ `Header.tsx`）:
   - 新 server-fn `getIngestionQueueCountFn`（GET、入力なし、`requireCurrentUser` → `countActiveIngestionJobs`）。
   - バッジはクライアントコンポーネント。AppShell ローダーは `staleTime: Infinity` で再実行されないため、サーバーレンダリングでは更新されない — マウント時＋`visibilitychange`（visible 復帰時）＋ingestion ミューテーション直後の通知で再取得する。通知はモジュールスコープの極小 pub-sub（`app/components/ingestion/queueBadgeBus.ts`、`notifyIngestionQueueChanged()` / `subscribe`）で行い、`UploadDialog`（アップロード完了後）、`/upload` ページの `UploadForm`（アップロード成功後 — モーダルを経由しない独立したアップロード経路のため発火点に含める）、`IngestionJobRow` / `IngestionJobEditDialog`（commit / discard / regenerate / retry 後）から発火する（adr.md ADR-002）。常時ポーリングは追加しない（pending → previewing のバックグラウンド遷移は visible 復帰・ミューテーション時に追随すれば十分で、`/upload` 滞在中はキュー自身のポーリングがあるため）。
   - 表示: `UploadButton` 上に件数チップ（0 件のとき非表示）。`aria-label` に件数を含める（例: 「アップロード（未処理 3 件）」）。Header は server component のままにし、バッジだけ client にする。
4. **コピー・spec 更新**: `UploadPage` の説明文（「モーダルで完結します」）を新モデルの説明に変更。`spec/pages/index.md` P13 の主動線記述を「モーダルは投げっぱなし＋編集はキュー画面」に書き換える。

## 実装ステップ

### 1. ポート拡張: `IngestionJobRepository.countByOwner`

- **対象ファイル:** `app/core/domain/ingestion/ports/ingestionJobRepository.ts`
- **変更内容:** `countByOwner(ownerId: UserId, opts: { statuses: readonly IngestionStatus[] }): Promise<number>` を追加（JSDoc に read-only / write-intent なしの契約を明記）。JSDoc には、`findByOwner` の opts（`status?` 単数包含＋ `excludeStatuses` 複数除外）と語彙が異なる理由 — count は「対象 status 集合の IN フィルタ 1 クエリ」が用途で複数包含 `statuses` が素直 — も一言記す（`NoteRepository` の sibling-family 整合コメント文化に倣う）。
- **理由:** ヘッダーバッジの件数取得。リスト取得の流用を避ける（ADR-003）。

### 2. d1 アダプター実装＋統合テスト

- **対象ファイル:** `app/core/adapters/d1/repositories/ingestionJobRepository.ts`、`app/core/adapters/d1/__tests__/ingestionJobRepository.integration.test.ts`
- **変更内容:** `count(*)` + `status IN (...)` の実装。statuses 空配列は 0 を返す（DB に行かない）。owner 越境が数えられないことのテストを含める。
- **理由:** ポート実装。`NoteRepository.countByOwner` と同パターン。

### 3. usecase `countActiveIngestionJobs` ＋ユニットテスト

- **対象ファイル:** `app/core/application/ingestion/countActiveIngestionJobs.ts`（新規）、`app/core/application/ingestion/__tests__/countActiveIngestionJobs.test.ts`（新規）、テスト用 in-memory フェイクへの `countByOwner` 追加
- **変更内容:** actor の `["pending","processing","previewing"]` 件数を返す。status 集合は usecase 内の定数とし、JSDoc に `failed` を除外する理由（バッジは「進行中の作業」を示すもので、`failed` を含めると未対処の失敗ジョブがバッジを恒久点灯させるノイズになる — adr.md ADR-003）を一文記す。repository へのアクセスは `getIngestionJobs` 等の既存 read usecase と同様 `unitOfWorkProvider.run` 経由で行う（ステップ 1 のポート追加が UoW コンテキストの repository 型に波及する点も含めて踏襲）。
- **理由:** バッジのアプリケーションロジックを usecase に置く（presentation に status 集合を漏らさない）。

### 4. server-fn `getIngestionQueueCountFn`

- **対象ファイル:** `app/components/ingestion/actions.ts`
- **変更内容:** GET・入力なし（`getEffectiveIngestionPromptsFn` と同じ input-less GET パターン）。`requireCurrentUser` → usecase 呼び出し、`{ count }` を返す。
- **理由:** クライアントバッジの取得経路。

### 5. `queueBadgeBus` ＋ `IngestionQueueBadge` ＋ Header 組み込み

- **対象ファイル:** `app/components/ingestion/queueBadgeBus.ts`（新規）、`app/components/ingestion/IngestionQueueBadge.tsx`（新規）、`app/components/layout/Header.tsx`、必要なら `app/components/ingestion/UploadButton.tsx`
- **変更内容:** モジュールスコープ pub-sub（subscribe / notify）。`subscribe` は unsubscribe 関数を返し、バッジは unmount 時に必ず購読解除する。モジュールキャッシュで購読者がテスト間に残留しないよう、テストは afterEach で unsubscribe を徹底するか、テスト専用の `resetForTest()`（購読者全クリア）を bus に用意する — どちらにするかは実装時に決めるが、テスト境界の手当てをステップ内の必須項目とする。バッジはマウント時・visible 復帰時・notify 時に `getIngestionQueueCountFn` を再取得。取得失敗は黙って非表示（ツリー lazy load と同じ「導線を塞がない」方針）。`UploadButton` の子としてチップを重ね、`aria-label` に件数を反映。
- **理由:** AC-5。AppShell ローダー非再実行の制約下で更新可能な最小構成（ADR-002）。

### 6. `UploadDialog` のビュー縮退（投げっぱなし化）

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`、`app/components/ingestion/UploadForm.tsx`
- **変更内容:** View 型を `select / uploading / queued` に縮退。単一・複数とも完了後 `routerInvalidate` ＋ `notifyIngestionQueueChanged()` → `queued` へ。ポーリング・ツリーロード・`IngestionPreviewForm` / `FailedView` ほか不要ビューと関連 import（`getIngestionJobFn` / `discardIngestionPreviewFn` / `ownerRetryIngestionJobFn` / `getDirectoryTreeFn`）を削除。`viewStatusText` / `aria-live` を整理。`/upload` ページの `UploadForm` のアップロード成功パスにも `notifyIngestionQueueChanged()` を追加する（モーダルを経由しない独立経路のため、ここで漏れるとバッジが古い件数のまま残る）。
- **理由:** AC-1, AC-5。Issue の中核。

### 7. `queued` 結果ビューの実装

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** 現行 `MultiResultView` をベースに単一件も扱う `QueuedView` へ統一。「N 件をキューに追加しました（M 件失敗）」＋失敗ファイル名リスト＋「キュー画面を開く」(`/upload` への Link、`data-primary`)＋「続けてアップロード」（`select` リセット: validation / error / view を初期化、プロンプト入力は保持）＋「閉じる」。文言で「キューで編集・保存できる」ことを明示。
- **理由:** AC-1, AC-2, AC-5（キュー誘導）。

### 8. `IngestionJobEditDialog` の新設

- **対象ファイル:** `app/components/ingestion/IngestionJobEditDialog.tsx`（新規）
- **変更内容:** `Dialog`（`ariaLabelledBy` にジョブファイル名を含む見出し）＋ `IngestionPreviewForm`。open 時にディレクトリツリーを lazy load（`getDirectoryTreeFn`、失敗時はサイレント）し、タイトル input に focus。コールバック: `onCommitted` → `notifyIngestionQueueChanged()` ＋ `/notes/$noteId` へ navigate、`onDiscarded` / `onRegenerated` → notify ＋ `routerInvalidate` ＋ close、`onCancel` → close。編集中（form の transition pending）は backdrop クリックで閉じない（`closeOnBackdropClick` 制御は現行モーダルの `isPending` 連動と同様）。
- **理由:** AC-3, AC-4。`IngestionPreviewForm` は props 駆動で Dialog レイアウト前提のため、そのまま再利用できる（ADR-001）。

### 9. `IngestionJobRow` に「編集」導線を追加

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** `previewing` かつ非 discarded の行に「編集」ボタン（primary は既存「ノートとして保存」のまま、または編集を primary に — 実装時に既存スタイル定数で判断）。行ローカル state で `IngestionJobEditDialog` を開閉。既存の即時保存・再生成・破棄・再試行アクションの成功パスに `notifyIngestionQueueChanged()` を追加。
- **理由:** AC-3, AC-4, AC-5。

### 10. コピー・spec・ADR 整合

- **対象ファイル:** `app/components/ingestion/UploadPage.tsx`、`spec/pages/index.md`（P13 と冒頭 32 行目の方針記述）
- **変更内容:** `UploadPage` の説明文を「アップロードは投げっぱなし、編集・保存はこの画面で行う」に更新。spec の書き換え本体は P13 セクション内 170–176 行目のフロー記述「主動線（単一ファイル）…モーダルで完結する」周辺で、ここを新モデルに揃える。あわせて 18 行目（ヘッダー CTA の説明）にバッジ追加が波及しないか整合確認し、必要なら更新する。spec P13 の主動線（モーダル内で推論待ち→プレビュー編集→登録、180 秒タイムアウト誘導、復元可能 hash の記述のうちフロー部分）を新モデルに書き換え（hash 駆動・複数ファイル・フィードバックポリシーの aria-live / errorDisplay 部分は存続）。`.issue/319/adr.md` は歴史的記録としてそのまま残し、supersede は `.issue/538/adr.md` ADR-004 に記録（waiting ポーリング自体の削除により ADR-001/002 の前提が消滅）。
- **理由:** AC-6。spec が正であり続けるため、方針転換を spec に反映する。

### 11. テスト更新

- **対象ファイル:** `app/components/ingestion/__tests__/UploadDialog.test.tsx`、`__tests__/UploadForm.test.tsx`、`__tests__/IngestionJobRow.test.tsx`、`__tests__/IngestionJobEditDialog.test.tsx`（新規）、`__tests__/IngestionQueue.test.tsx`（必要なら）、ほかステップ 2・3 のテスト
- **変更内容:** UploadDialog テストから waiting / editing / failed / committed / timedOut / queueGuidance / ポーリング系ケースを削除し、queued ビュー（単一・複数・部分失敗・続けてアップロード・invalidate / notify 呼び出し）を追加。JobRow に編集ボタン表示条件と EditDialog 開閉。EditDialog はツリーロード・コールバック配線・focus を検証。`IngestionPreviewForm.test.tsx` は基本そのまま。
- **理由:** ビュー構造が大きく変わるため、テストを新しい契約に揃える。

### 12. 仕上げ

- **対象ファイル:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit`、d1 統合テスト。
- **理由:** プロジェクト規約。

## 設計判断

詳細は `.issue/538/adr.md` を参照。

- **ADR-001:** キュー側編集は行内インライン展開ではなく、行から開く Dialog（`IngestionJobEditDialog`）にする — `IngestionPreviewForm` の再利用性とレイアウト前提のため。
- **ADR-002:** キュー誘導はトースト基盤の新設ではなく「モーダル内結果ビュー＋ヘッダーバッジ（client、イベント通知＋visible 復帰時再取得、常時ポーリングなし）」で実現する。
- **ADR-003:** バッジ件数のために `IngestionJobRepository.countByOwner` ポートと `countActiveIngestionJobs` usecase を追加する（リスト取得の流用はしない）。
- **ADR-004:** `.issue/319/adr.md`（queueGuidance ビュー）と `.issue/253` の waiting 再突入方針は、waiting ポーリングの削除に伴い supersede される。

## リスクと注意点

- **UploadDialog の大規模削除**: ポーリング・origin 判別・focus 制御などコメントで他 Issue（#253, #256, #258, #319 等）を参照する箇所が多い。削除時に参照コメントごと消すこと（残骸コメントを残さない）。`IngestionPreviewForm` の `titleInputRef` / `onRegenerated` の JSDoc も新しい親（EditDialog）前提に書き換える。
- **再生成 UX の変化**: 旧フローは再生成後モーダル内で待機して自動的に編集へ戻ったが、新フローでは編集ダイアログが閉じてキュー行の進捗表示に戻る。previewing になったら再度「編集」を押す必要がある — これは「投げっぱなし」モデルの意図どおりだが、testing 時に旧挙動とのギャップとして混同しないこと。
- **バッジの鮮度**: 常時ポーリングしないため、タブを開いたまま放置すると pending → previewing の遷移がバッジに即時反映されない（visible 復帰・次のミューテーションで追随）。許容するトレードオフとして ADR-002 に明記。
- **`#upload` ハッシュとの整合**: モーダルの開閉契約（`UploadDialogMount` / `UploadButton`）は変更しない。`queued` ビューの「キュー画面を開く」Link は既存どおり hash を落として遷移し、モーダルが自然に閉じる。
- **複数タブ / 並行操作**: 編集ダイアログを開いている間にジョブが他タブで commit / discard されると、commit が conflict / business エラーになる。`IngestionPreviewForm` の既存エラー表示（`displayError`）で吸収される想定だが、EditDialog テストで notFound / conflict 系の表示を 1 ケース確認する。
- **編集中の行アンマウントによるダイアログ強制クローズ**: EditDialog は行ローカル state で開閉するため、`IngestionQueue` の 4s/16s ポーリングが対象ジョブをリスト結果から外す（他タブでの commit / discard 等）と、行ごとアンマウントされ未保存編集が無言で消える。発生は実質クロスタブ操作時のみで、許容するトレードオフとする（ダイアログ open 中のポーリング一時停止等の回避策はスコープ外の「ポーリング戦略変更」に踏み込むため実装しない — adr.md ADR-001 に記録）。testing 時に「ダイアログが勝手に閉じた」と混同しないこと。
- **`getIngestionJobFn` の存続**: モーダルから使わなくなるが、server-fn 自体は他用途（直リンク等の将来）に無害なので削除しない。ただし未使用になるならエクスポート整理の判断は実装時に lint と相談（unused にはならない見込み — wire 型の輸出元）。

## テスト方針

- **ユニット（usecase）**: `countActiveIngestionJobs` — 対象 status のみ数える / 他人のジョブを数えない / 0 件。
- **統合（d1）**: `countByOwner` — status IN フィルタ、owner スコープ、空 statuses。
- **コンポーネント**:
  - `UploadDialog`: 単一アップロード → `queued`（invalidate / notify 呼び出し含む）、複数（部分失敗）→ `queued` の失敗リスト、「続けてアップロード」→ `select` リセット、アップロード失敗 → `select`＋エラー、waiting / editing が存在しないこと（旧ケースの削除）。
  - `UploadForm`（`/upload` ページ）: アップロード成功後に `notifyIngestionQueueChanged()` が呼ばれること（1 ケース）。
  - `IngestionJobRow`: `previewing` でのみ「編集」表示、押下で EditDialog が開く、既存アクション成功後の notify。
  - `IngestionJobEditDialog`: ツリー lazy load、編集して commit → navigate、discard / regenerate → close＋invalidate、エラー表示 1 ケース。
  - `IngestionQueueBadge`: count > 0 でチップ表示・0 で非表示、notify で再取得、取得失敗で非表示。
- **手動（ブラウザ）**: アップロード → 即解放 → ヘッダーバッジ増加 → `/upload` で previewing を編集して保存 → ノートに遷移 → バッジ減少、の一連を確認。

## レビュー履歴

### 1周目

**修正した点**:
- P-001（coverage / arch-risk 同一指摘）: `/upload` ページの `UploadForm` 経由アップロードが `notifyIngestionQueueChanged` の発火点から漏れていた。ステップ 6 の対象ファイルに `UploadForm.tsx` を追加し、設計（UI #3）・AC-5 文言・対応ステップ列・テスト方針（UploadForm の notify 1 ケース）・ステップ 11 のテスト対象・adr.md ADR-002 の発火点リストを更新。

**取り込んだ改善提案**:
- coverage S-001: AC-5 の対応ステップ列にステップ 6 を追加（「1–5, 7, 9」→「1–7, 9」）。
- coverage S-002: AC-1 / AC-2 の合格条件を検証可能な粒度に具体化（AC-1: View 型・ポーリング定数・`IngestionPreviewForm` 使用の削除を明示、AC-2: 待機 UI 不在と「続けてアップロード」「閉じる」の常時操作可能性を明示）。
- coverage S-003: ステップ 10 に `spec/pages/index.md` 170–176 行目（書き換え本体）と 18 行目（ヘッダー CTA、バッジ波及の整合確認）を明記。
- arch-risk S-001: EditDialog 編集中にキューのポーリングで行がアンマウントされ未保存編集が消えるエッジケースを「リスクと注意点」に追記し、許容するトレードオフとして adr.md ADR-001 の Consequences に記録。
- arch-risk S-002: `countByOwner` の opts（複数包含 `statuses`）が既存 `IngestionJobListOpts` の語彙（`status?` 単数＋ `excludeStatuses`）と異なる理由をポート JSDoc に明記する旨をステップ 1 と adr.md ADR-003 に追記。
- arch-risk S-003: `queueBadgeBus` のテスト境界（subscribe の unsubscribe 返却、テスト間の購読者残留防止 — afterEach での解除徹底またはテスト用 reset）をステップ 5 に明記。

**見送った提案とその理由**:
- なし（全指摘を取り込み）。

### 2周目

両視点とも問題点ゼロで終了（改善提案2件取り込み）。

**取り込んだ改善提案**:
- arch-risk S-001: バッジの status 集合から `failed` を除外する理由を adr.md ADR-003 の Decision に記録し、usecase 定数の JSDoc にも残す方針をステップ 3 に明記。
- arch-risk S-002: `countActiveIngestionJobs` が既存 read usecase と同様 `unitOfWorkProvider.run` 経由で repository にアクセスすること（ポート追加の UoW コンテキスト型への波及含む）をステップ 3 に明記。
