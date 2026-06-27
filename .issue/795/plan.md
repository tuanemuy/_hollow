# 実装計画 — Issue #795: refactor(note): polish the editor's media-upload UI (dropzone / preview / validation)

**Issue:** #795
**作成日:** 2026-06-27
**複雑度:** 中〜大規模

---

## 目的

note editor の in-body メディアアップロード UI（`MediaUploader.tsx`）を、ingestion の洗練済みパターンに揃えて、ドラッグ&ドロップ・ファイルプレビュー・クライアント側バリデーション・成功フィードバックを備えた設計済みコンポーネントに作り直す。フロントエンドのみの変更で、既存の presign → put → finalize → editor 挿入フローは温存する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | editor のメディアアップロードが click-to-select に加えてドラッグ&ドロップ（dropzone 全体がクリック可能な label、ファイルドロップで選択）をサポートする | Issue「Acceptance Criteria」1 / ingestion `DROPZONE` パターン | 1, 3, 5 |
| AC-2 | 選択/ドロップ直後にファイル preview（filename + size、画像はサムネイル、動画/その他はアイコン）を表示し、アップロード中はその preview を progress と併記する（独立した確認待ち状態は設けず、選択即アップロード開始） | Issue AC 2 | 1, 5 |
| AC-3 | クライアント側の format（image/video のみ）/ size バリデーションが upload 前にフィードバックし、ingestion と一貫した ALERT バナーで提示される | Issue AC 3 | 1, 4, 5 |
| AC-4 | progress（`ProgressBar` 再利用）/ error・retry（`RetryableError` 再利用）/ success の各状態が明確かつ一貫して提示される | Issue AC 4 | 1, 5 |
| AC-5 | 既存の presign/put/finalize フローと editor 挿入（WYSIWYG `setImage` / HTML / inline append）が動き続ける（`MediaUploader` の props `{contentHtml, onInsert, disabled}` と `onInsert` 契約を変えない） | Issue AC 5 | 5, 6 |
| AC-6 | アクセシビリティが保たれる/改善される（live-region progress、labelled controls、`TOUCH_TARGET` 準拠のタップターゲット、dropzone の hidden input + label 関連付け） | Issue AC 6 | 1, 5 |
| AC-7 | 実装が新しいモック（`spec/design/pages/P12-editor.html` + `mobile/P12-editor.html`）に一致する | Issue AC 7 / 「Scope (mock first)」 | 1, 5 |
| AC-8 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue AC 8 | 7 |

## スコープ

### 含まれないもの
- **multi-file 同時アップロード** — 現状の単一ファイル挙動（`files?.[0]` / `insertMediaIntoHtml` は 1 枚追記、WYSIWYG `setImage` はカーソル位置に 1 枚挿入）を維持する。複数挿入は挿入順序・カーソル制御の追加設計が必要で AC が要求していない（plan.md スコープ判断、ADR 対象外）。dropzone に複数ドロップされた場合は先頭ファイルのみ処理する（現挙動踏襲）。
- **WYSIWYG toolbar「画像」ボタン（mock 1072-1074）の配線** — toolbar ボタンから uploader をトリガーする連携は別コンポーネント間 ref が必要で、本 Issue の AC に含まれない。現行どおり in-body uploader を正とし、toolbar ボタンは未配線のまま据え置く（plan.md スコープ判断、ADR 対象外）。
- **server function / domain / usecase / adapter の変更** — フロントエンドのみ。`presignMediaUploadFn` / `finalizeMediaUploadFn` / `putWithProgress` のシグネチャ・挙動は変えない。唯一の例外は `app/components/media/schema.ts` の `BYTE_SIZE_MAX` をクライアント検証の SSOT として export する点（ロジック変更なし、ADR-002）。
- **ingestion 側の機能変更** — ingestion の 2 consumer（`UploadForm.tsx:30` / `UploadDialog.tsx:58`、同一インライン定義）から `DROPZONE` 文字列定数を共有プリミティブへ移設するのみ。挙動・見た目は不変。

## 調査結果

- **関連ファイル:**
  - `app/components/note/editor/MediaUploader.tsx` — 本 Issue の主対象。現状は `field` + `<label>` + `<input type="file">`、`UploadState = idle | uploading | error`、3 ステップフロー（presign → `putWithProgress` → finalize → `onInsert`）。**mode 非依存**（props は `{contentHtml, onInsert, disabled}`）で、WYSIWYG/HTML/inline の出し分けは呼び出し側 `NoteEditor.onMediaInsert` が担う。
  - `app/components/note/editor/NoteEditor.tsx` (195-223, 509-560) — `onMediaInsert` が WYSIWYG=`setImage` / HTML=`setHtmlDraft` / inline=`setContent` を出し分け。3 モードとも `MediaUploader` を同じ props で描画。**この契約を変えなければ NoteEditor 側は無変更。**
  - `app/components/note/editor/mediaInsert.ts` — `insertMediaIntoHtml`（HTML/inline 用、純粋関数）。変更不要。
  - `app/components/ingestion/UploadForm.tsx` — 揃える先の洗練パターン。`DROPZONE` 定数（30-31 にインライン）、`onDragOver/onDragLeave/onDrop`、`data-dragover` 属性、`validateUploadFiles()` + `UploadValidationBanners`。
  - `app/components/ingestion/UploadDialog.tsx` — ingestion のもう 1 つの dropzone consumer。`DROPZONE` 定数を 58-59 に**完全一致のインライン定義**で重複保持（grep で確認）。共有化スコープに含める（共有定数へ差し替え）。
  - `app/components/common/styles.ts` — `ALERT` / `ALERT_ERROR` / `ALERT_WARNING` / `ALERT_SUCCESS` / `ALERT_ICON` / `ALERT_CONTENT` / `ALERT_TITLE` / `ALERT_BODY` / `ALERT_BODY_CODE`、`TOUCH_TARGET`、`field` / `fieldLabel`。バナー・タップターゲットの SSOT。**`ingestion/styles.ts` は存在せず**、`DROPZONE` は ingestion の 2 consumer（`UploadForm.tsx` / `UploadDialog.tsx`）にそれぞれ同一インライン定義で重複している。
  - `app/components/common/ProgressBar.tsx` — determinate/indeterminate 両対応。`decorative` で `aria-hidden`（隣接テキストが live-region を担う）。再利用。
  - `app/components/common/RetryableError.tsx` — `role="alert"` + `displayError` + 再試行 pill（`error.retryable !== false` ガード）。再利用。
  - `app/components/media/actions.ts` — `presignMediaUploadFn`（kind/mimeType/byteSize）/ `finalizeMediaUploadFn`（mediaId → `/media/<id>`）。変更不要。
  - `app/components/media/schema.ts` — `presignMediaUploadSchema`（kind `image|video|avatar`、`byteSize ≤ 5 GiB = BYTE_SIZE_MAX`）。`BYTE_SIZE_MAX` をクライアント検証用に export 予定。
  - `spec/design/pages/P12-editor.html`（+ `spec/design/pages/mobile/P12-editor.html`） — toolbar「画像」ボタン（1072-1074）はあるが **in-body media-upload UI のモックが無い**。P13 系（`P13-upload.html` `.dropzone` 479-519 / 1117-1120）が dropzone のビジュアル参照。
  - `app/styles/tokens.css` / `spec/design/tokens.md` — `--color-accent-surface` / `--color-success(-surface)` / `--color-warning(-surface)` / `--color-error(-surface)` / `--color-hairline-strong` / `--color-surface-elevated` / `--radius-xl` 等は既存。dropzone・preview・banner は既存トークンで賄える見込み。

- **あるべきアーキテクチャ（CLAUDE.md / spec/design）:**
  - フロントエンドのみ。**utility-first**（`className` 直書き）、新規 CSS ファイル/`@apply` 禁止。
  - **デザイントークンは `tokens.css` が SSOT**（`tokens.md` にミラー、`@theme inline` で Tailwind ユーティリティへ橋渡し）。新トークンは両方に追加。
  - **state スタイルは `data-*` 属性 + `data-[name]:` バリアント**。`data-x={cond || undefined}`（動的）/ `data-x=""`（静的 ON）。
  - **繰り返すユーティリティ文字列は module-scoped 定数へ hoist**（`common/styles.ts` / `note/editor/styles.ts` 等）。
  - **mock first**（Issue 明記）— モックを先に更新し、それに合わせて実装。
  - タップターゲットは `TOUCH_TARGET` 系定数を SSOT に。`backdrop-filter` ADR-005 は本 Issue では未使用。

- **既存実装の状態:**
  - `MediaUploader` の **3 ステップフロー・props 契約・mode 非依存設計は「あるべき姿」と一致**しており尊重する（書き直すのは UI 層のみ）。
  - 一方、UI は ingestion の確立パターン（dropzone / banner）から **乖離**（primitive な `<input>`）。本 Issue で ingestion パターンに収斂させる。
  - `DROPZONE` 文字列が ingestion の 2 consumer（`UploadForm.tsx` / `UploadDialog.tsx`）に**同一インラインで既に重複している**ため、**「繰り返すユーティリティは共有定数へ」の規約からすると共有プリミティブ化が望ましい**。editor という 3 つ目の consumer が生まれる本 Issue を契機に、3 箇所すべてを共有定数へ収斂させる（ADR-001）。
  - ingestion の `validateUploadFiles` は `IngestionService.detectKind` / `DEFAULT_MAX_INGESTION_BYTES` に**ドメイン結合**しており media（image/video、別サイズ上限）には直接再利用不可。検証**ロジックは別**にし、**ビジュアル（dropzone 文字列 + ALERT バナー）を共有**するのが正しい抽象境界（ADR-001）。

- **依存関係:** `NoteEditor`（呼び出し側 — props 契約維持で無変更）、`UploadForm` / `UploadDialog`（`DROPZONE` 移設に伴う import 変更のみ、挙動不変）、`media/schema.ts`（`BYTE_SIZE_MAX` export 追加）。

## 設計

### ドメインモデルへの影響
なし。フロントエンドのみの変更で、メディアの不変条件・ポートは不変。

### ユースケース / アプリケーションロジック
なし。`presignMediaUploadFn` / `finalizeMediaUploadFn` の usecase は不変。

### アダプター / 永続化 / 外部連携
なし。R2 への presigned PUT（`putWithProgress`）の挙動は不変。

### UI / プレゼンテーション
本 Issue の中心。レイヤー内側（純粋ロジック）→ 外側（コンポーネント）の順で：

1. **クライアント検証（純粋関数）** — `validateMediaFile(file)`: image/video 以外を `unsupported`、`BYTE_SIZE_MAX` 超過を `oversized` として弾く単一ファイル判定。ingestion の `validateUploadFiles`（multi-file）に対し、editor は **single-file スコープなので単一ファイル版**にして責務を最小化する。
2. **共有スタイルプリミティブ** — `DROPZONE` を `common/styles.ts` へ移設し editor / ingestion で共有。preview/state 用の繰り返しユーティリティは必要に応じて `note/editor/styles.ts`（editor 固有）へ hoist。
3. **`MediaUploader` の状態機械拡張** — `UploadState` を `idle | uploading | error | done` に拡張する（`selected` という独立した確認待ち状態は設けない）。**選択/ドロップ → `validateMediaFile` 検証 → 即アップロード開始**を既定とし、preview（filename/size/サムネイル）は `uploading` 状態の中で progress と併記する。検証 NG（unsupported/oversized）はバナーを出して `idle` のまま留まる。`done` は成功フィードバック。遷移は `idle →(選択+検証OK)→ uploading →(成功)→ done` / `uploading →(失敗)→ error`。dropzone・preview・banner・progress・error・success を mock どおりに描画。props 契約（`{contentHtml, onInsert, disabled}` と `onInsert(nextHtml, {id,url})`）は不変。
4. **モック** — `P12-editor.html` + `mobile/P12-editor.html` に in-body media-upload UI を追加（既存トークン使用）。

## 実装ステップ

依存方向（内側＝ロジック/モックが先）に並べる。

### 1. モックに洗練された media-upload UI を追加（mock first）

- **対象ファイル:** `spec/design/pages/P12-editor.html`、`spec/design/pages/mobile/P12-editor.html`
- **変更内容:** editor-body-panel（`#editor-body-panel`）の本文編集領域の下に in-body media-upload UI を追加する。**選択即アップロード（独立した確認待ち state なし）を前提に描く**。以下の状態を mock として並記（実装は排他表示）：
  - **dropzone**（`P13-upload.html` の `.dropzone` を参照：`border-2 border-dashed border-hairline-strong` / `bg-surface-elevated` / `rounded-xl`、コピー「画像・動画をドラッグ&ドロップ またはクリックして選択」、ドラッグ時 `.dragging`/`data-dragover` のホバー強調）。
  - **uploading + preview 併記**（AC-2 の粒度を明示: filename + size、**画像はサムネイル枠 / 動画・その他は lucide アイコン**）を `ProgressBar` 相当の determinate バー + 「アップロード中… (NN%)」テキストと同一ブロックに描く（preview は uploading 中に表示。アップロード前の独立プレビュー画面は作らない）。
  - **validation banner**（AC-3 の出し分けを明示: 対応外形式 = `alert-error` / サイズ超過 = `alert-warning`、ingestion と同じ `.alert` 構造）。
  - **error/retry**（`.alert` + 再試行ボタン相当）。
  - **success affordance**（`alert-success` 「ノートに挿入しました」+ filename）。
  - mobile variant は狭幅でのパディング・タップターゲット（min 44px）を反映。
- **理由:** Issue が mock first を明記（AC-7）。in-body uploader のモックが現状無いため、実装の正となるデザインを先に確定する。AC-2（preview の filename+size+画像サムネ/非画像アイコン）と AC-3（error/warning バナーの出し分け）は Issue 本文より具体化した基準なので、**mock がその粒度を必ず描く**ことで AC-7（実装が mock に一致）との齟齬を防ぐ。デザイントークンは既存のものを再利用し、新規追加は最小化。

### 2. 必要なトークン/共有スタイル定数の追加（あれば）

- **対象ファイル:** `app/styles/tokens.css` / `spec/design/tokens.md`（新トークンが必要な場合のみ、両方を更新）、`app/components/common/styles.ts`
- **変更内容:** モック確定後、既存トークンで賄えない値があれば `tokens.css` + `tokens.md` に追加（dropzone/preview は既存の color/space/radius で足りる見込みなので、原則 **新トークンなし**）。`DROPZONE` 文字列定数を `common/styles.ts` へ新設（次ステップで移設）。
- **理由:** トークン SSOT 規約（`tokens.css` → `tokens.md` ミラー、`@theme inline` 橋渡し）。不要な作文トークンは追加しない。

### 3. `DROPZONE` を共有プリミティブへ移設

- **対象ファイル:** `app/components/common/styles.ts`（新規 `DROPZONE` export）、`app/components/ingestion/UploadForm.tsx`（ローカル定数を削除し共有 import に差し替え）、`app/components/ingestion/UploadDialog.tsx`（同一インライン定数を削除し共有 import に差し替え）
- **変更内容:** ingestion の 2 consumer（`UploadForm.tsx:30` / `UploadDialog.tsx:58`、同一インライン）のローカル `DROPZONE` を `common/styles.ts` の domain-agnostic 共有定数（`scrollbarHidden` 等と同列のシェルプリミティブ）として移し、JSDoc に「editor / ingestion 各 consumer の dropzone ビジュアル SSOT」と明記。両 ingestion ファイルと editor の計 3 箇所すべてを共有 import に差し替える（挙動・クラス完全不変）。**移設前に `UploadForm.tsx` と `UploadDialog.tsx` の 2 つの `DROPZONE` 文字列が完全一致することを diff で確認してから共有定数へ収斂する**（万一 1 文字でも差分があれば「完全不変移設」が破れるため、単一化の前提を必ず検証する）。
- **理由:** 「繰り返すユーティリティは共有定数へ」の規約と「2 つの divergent な upload UI を重複させない」という Issue の要請を、ビジュアル文字列の単一化で満たす（ADR-001）。ingestion 側に既に存在する重複も同時に解消し、移設後に「共有定数 consumer + インライン重複」という新たな不整合を残さない。検証ロジックの結合度差ゆえコンポーネント全体抽出はしない。

### 4. media クライアント検証ロジック + バナー

- **対象ファイル:** `app/components/media/validation.ts`（新規・純粋関数）、`app/components/media/schema.ts`（`BYTE_SIZE_MAX` を export）
- **変更内容:**
  - `schema.ts` の `BYTE_SIZE_MAX`（既存・5 GiB）を `export` し、クライアント/サーバー検証上限の SSOT にする（ADR-002）。
  - `validation.ts` に `validateMediaFile(file: File): { ok: true; kind: "image" | "video" } | { ok: false; reason: "unsupported" | "oversized"; sizeLabel?: string }` を実装。format は `file.type` が `image/` または `video/` で始まるかで判定（`<input accept>` と同じ範囲）、size は `BYTE_SIZE_MAX` 超過で `oversized`。`formatMegabytes` 相当のラベル整形も持つ。戻りの `kind`（image/video）は Step 5 で presign 呼び出しにそのまま渡し、MIME→kind 判定の単一正規化点にする。
  - 単一ファイル UX に合わせ ingestion の multi-file `FileValidationResult` ではなく単一判定の戻り値型にする（責務最小化）。
  - **import 経路は `@/components/media/schema` 直 import で統一**する（`media/index.ts` barrel は現状 schema/actions を再エクスポートするが `BYTE_SIZE_MAX`/`validateMediaFile` は足さない＝barrel は触らない）。consumer の参照点をぶれさせない。
- **理由:** ingestion の検証はドメイン結合（`detectKind` / ingestion バイト上限）で media に流用不可。検証ロジックは別・**ビジュアル（バナー）は共有**が正しい境界（ADR-001）。サーバーの schema 上限と同一値で弾くことで「クライアントで弾いた＝サーバーでも弾かれる」を保証（ADR-002）。

### 5. `MediaUploader.tsx` をモックに合わせて再実装

- **対象ファイル:** `app/components/note/editor/MediaUploader.tsx`、（必要時）`app/components/note/editor/styles.ts`
- **変更内容:**
  - **props 契約は不変**（`{contentHtml, onInsert, disabled}`、`onInsert(nextHtml, {id,url})`）。3 ステップフロー（`presignMediaUpload` → `putWithProgress` → `finalizeMediaUpload` → `insertMediaIntoHtml` → `onInsert`）も温存。
  - `UploadState` を `idle | uploading | error | done` に拡張する（`selected` という独立した確認待ち状態は**設けない** — 選択即アップロードのため dead state になる）：
    - `idle`: dropzone 表示。検証 NG のバナーはこの状態のまま併記する。
    - `uploading`: **preview（filename/size、画像は `URL.createObjectURL` サムネイル、動画/その他は lucide アイコン）を progress と併記**。`ProgressBar`（determinate/indeterminate）+ aria-live テキスト（既存）。
    - `error`: `RetryableError` 再利用（`lastFile` で再試行）。
    - `done`: `ALERT` + `ALERT_SUCCESS` の成功バナー（「ノートに挿入しました」+ filename）。次の選択で `idle` に戻す。
  - **選択即アップロード:** 選択/ドロップ → `validateMediaFile` 検証 → OK なら即 `uploading` へ遷移してアップロード開始。検証 NG はバナーを出して `idle` のまま。アップロード前の独立した確認ステップは作らない（AC-2 は preview を uploading 中に併記して満たす）。
  - **検証バナーの state 配置:** 検証失敗（`unsupported`/`oversized`）は `uploading` に遷移させず、別の rejection state で保持する（`idle` に optional な rejection を畳む例 `{ kind:"idle"; rejection?: {reason:"unsupported"|"oversized"; sizeLabel?} }`、または専用の軽量 `useState`）。次の選択/ドロップでクリアする。`uploading` は file/thumbnailUrl/progress、`done` は filename をペイロードに載せ、検証結果を別の散らばった useState に逃がさず state.kind と一致させる（バナーと state の食い違いを防ぐ）。
  - **presign の kind:** `validateMediaFile` が返した `kind`（image/video）を選択ファイルと一緒に保持し、`runUpload` の presign 呼び出しにそのまま渡す。既存の `kindForMime(file.type)`（MIME→kind の重複判定）は削除し、MIME→kind 正規化を `validateMediaFile` の一点に集約する（S-002）。
  - dropzone: `DROPZONE`（共有定数）を使った `<label>` + 非表示 `<input type="file" accept="image/*,video/*">`、`onDragOver/onDragLeave/onDrop` + `data-dragover={isDragOver || undefined}`。複数ドロップ時は先頭のみ（単一スコープ）。
  - **二重起動ガード:** label ベースの dropzone への drop は native input を経由しないため `disabled`（input 属性）だけでは uploading 中の二度目の選択/ドロップを塞げない。`onDrop` / `onChange`（および `onDragOver`）ハンドラの冒頭で **`state.kind !== "uploading"` のときのみ受け付ける early-return ガード**を入れる。label には `data-disabled={state.kind === "uploading" || disabled || undefined}` を付与し `pointer-events-none` 相当でクリックも抑止する。検証バナー表示中（`idle`）の新規 drop は通常受理（新ファイルで上書き）。
  - 検証: 選択/ドロップ時に `validateMediaFile` を実行。`unsupported`/`oversized` は `ALERT_ERROR`/`ALERT_WARNING` バナー（`UploadValidationBanners` と同じ ALERT プリミティブで自前描画 — ingestion のは ingestion 専用文言/multi-file ゆえ流用せず構造のみ揃える）。
  - サムネイル: サムネイル URL を state に保持し、`URL.createObjectURL` の生成と `revokeObjectURL` の解放を **`useEffect(() => () => revoke(url), [url])` の単一クリーンアップに一本化**する（状態遷移ごとの手動 revoke はしない — 二重 revoke / 取りこぼし回避、S-005）。画像 kind のみ生成し、動画/その他は lucide アイコン（URL を生成しない）。
  - a11y: dropzone label と input の関連付け（`htmlFor`/`useId`）、progress の `aria-live`（既存維持）、`TOUCH_TARGET` 準拠、success/error は `role="status"`/`role="alert"`。
- **理由:** AC-1〜AC-6 を満たし、確立済みの内部フロー・props 契約・mode 非依存設計（あるべき姿）を尊重したまま UI のみ刷新する。

### 6. `NoteEditor` 連携の確認（原則無変更）

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** `MediaUploader` の props 契約を維持するため**コード変更なし**。HTML/inline/WYSIWYG 3 経路で `onMediaInsert` が従来どおり呼ばれ、挿入が機能することを確認する（変更が漏れ出ていないかの検証ステップ）。
- **理由:** AC-5（既存挿入フローの非破壊）。

### 7. 検証

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。`pnpm test:unit`（既存 `mediaInsert.test.ts` / `UploadForm.test.tsx` が緑のまま、追加した `validateMediaFile` のユニットテストがあれば緑）。
- **理由:** AC-8。

## 設計判断

- **ADR-001**: ingestion dropzone の「ビジュアル（`DROPZONE` 文字列）」のみを共有プリミティブ化し、検証ロジックは media 固有の単一ファイル版を新設（コンポーネント全体抽出はしない）。
- **ADR-002**: クライアント検証の size 上限は `media/schema.ts` の `BYTE_SIZE_MAX` を export して SSOT 化。
- single-file 維持 / toolbar「画像」ボタン未配線はスコープ判断（plan.md スコープ参照、ADR では扱わない）。
- 詳細は `.issue/795/adr.md` 参照。

## リスクと注意点

- **サムネイル ObjectURL のリーク** — サムネイル URL を state に持ち、生成・解放を `useEffect(() => () => revoke(url), [url])` の**単一クリーンアップに一本化**する。状態遷移ハンドラ内で手動 revoke しない（二重 revoke / 取りこぼしの両方を避ける）。画像 kind のみ生成。
- **props 契約の非破壊** — `MediaUploader` の props と `onInsert` 契約を変えると `NoteEditor` の 3 経路すべてに波及する。契約は固定し UI 層のみ変更する。
- **single-file 挙動の維持** — dropzone は複数ファイルを受け取り得る。先頭のみ処理し、現行 `files?.[0]` 挙動と一致させる（multi 化はスコープ外）。
- **アップロード中の二重起動** — label ベース dropzone への drop は input を経由しないため `disabled` だけでは塞げない。`onDrop`/`onChange` を `state.kind === "uploading"` のとき early-return でガードし、2 本目の `runUpload` が走って進捗/プレビューが壊れるのを防ぐ。
- **`DROPZONE` 移設の回帰** — ingestion の 2 consumer（`UploadForm` / `UploadDialog`）の見た目が変わらないこと（クラス文字列完全一致での移設）。`UploadForm.test.tsx` および `UploadDialog` 関連テスト/スナップショットが緑であることを確認。
- **検証上限の整合** — クライアント `BYTE_SIZE_MAX` とサーバー schema の上限が同一値であること（export 共有で担保）。format は `accept` と検証ロジックの双方で image/video に揃える。
- **mock の二重メンテ** — desktop / mobile 両 `P12-editor.html` を更新し忘れない（AC-7）。
- **success/preview の a11y 二重読み上げ** — `ProgressBar` を `decorative` にして隣接 live-region テキストと二重アナウンスしない既存方針を踏襲する。

## テスト方針

- **ユニット（純粋ロジック）:** `validateMediaFile` — image/video 受理、非対応 MIME=`unsupported`、`BYTE_SIZE_MAX` 超過=`oversized`、境界値。ingestion の `validateUploadFiles` テスト（`UploadForm.test.tsx`）に倣う。
- **コンポーネント（happy-dom）:** `MediaUploader` — ドロップ/選択で検証バナー表示、検証通過で presign→put→finalize モックが順に呼ばれ `onInsert` が発火、失敗で `RetryableError` + 再試行、成功で success 状態。`UploadForm.test.tsx` の `serverFnMock` パターンを流用。**ただし `putWithProgress` はモジュール内で `new XMLHttpRequest()` を直接生成する private 関数のため `global.XMLHttpRequest` のフェイク（`onload`/`onprogress`/`onerror` を手動発火）が要る。サムネイル用 `URL.createObjectURL`/`revokeObjectURL` も happy-dom で未定義になりがちなのでスタブする。** PUT 経路の実ネットワーク到達が困難な場合は、状態遷移ユニットを純粋関数（`validateMediaFile`）に寄せ、put フェーズは手動/ブラウザ検証に委ねる線引きでもよい。
- **回帰:** `mediaInsert.test.ts` / `UploadForm.test.tsx` が緑のまま。
- **手動/ブラウザ:** ローカルサーバーで HTML/inline/WYSIWYG 各モードのドラッグ&ドロップ・サムネイル・進捗・エラー再試行・成功挿入を確認（`docs/test.md` の手動検証方針）。desktop/mobile 双方のレイアウト・タップターゲット。

## レビュー履歴

### 1周目

**修正した点**:
- **[P-001 coverage]** スコープ欄 L29/L30 の「（ADR-001 で判断を記録）」誤参照を「（plan.md スコープ判断、ADR 対象外）」に統一し、L154 との矛盾を解消（single-file 維持 / toolbar 未配線は ADR の扱いではなくスコープ判断であることを一貫させた）。
- **[P-002 coverage]** 実コードを grep し、`DROPZONE` インライン定義が `UploadForm.tsx:30` と `UploadDialog.tsx:58` の**完全一致 2 箇所**に既存することを確認。調査結果・スコープ・依存関係・Step 3・ADR-001 の「2 つ目の consumer」「UploadForm のみ」表現を事実（ingestion 2 consumer + editor = 計 3 箇所を共有定数へ収斂）に訂正。Step 3 の対象に `UploadDialog.tsx` を追加。
- **[P-001 arch-risk]** `selected` 状態を状態機械から削除し `idle | uploading | error | done` に確定。「選択/ドロップ → 検証 → 即アップロード開始、preview は uploading 中に progress と併記」を既定と明文化。設計セクション item 3・Step 1 mock・Step 5・AC-2 を一貫させた。
- **[P-002 arch-risk]** Step 5 に二重起動ガード（`onDrop`/`onChange` を `state.kind !== "uploading"` のとき early-return、label に `data-disabled` + `pointer-events-none` 相当）を明記。リスク欄にも追記。

**取り込んだ改善提案**:
- **[S-002 arch-risk]** `validateMediaFile` が返す `kind` を presign に渡し、`kindForMime` の重複判定を削除する旨を Step 4/5 に追記。
- **[S-003 arch-risk]** テスト方針に `global.XMLHttpRequest` フェイクと `URL.createObjectURL`/`revokeObjectURL` スタブが必要な旨を明記。
- **[S-004 arch-risk]** import 経路を `@/components/media/schema` 直 import で統一（barrel は触らない）と Step 4 に明記。
- **[S-005 arch-risk]** `revokeObjectURL` を `useEffect(() => () => revoke(url), [url])` の単一クリーンアップに一本化（URL を state 保持、画像 kind のみ生成）と Step 5・リスク欄を統一。
- **[S-001 coverage / S-002 coverage]** Step 1 mock に AC-2（preview の filename+size+画像サムネ/非画像アイコン）・AC-3（error/warning バナー出し分け）の粒度を必ず描き、AC-7 との齟齬を防ぐ旨を明記。

**見送った提案とその理由**:
- **[S-001 arch-risk]** クライアント size 上限に server とは別の UX 上限（< `BYTE_SIZE_MAX`）を設ける案は見送り。別 UX 上限は「どの値が妥当か」という product 判断で Issue の AC に含まれない（AC-3 は一貫した検証機構を求めるだけで具体的しきい値は指定しない）。`BYTE_SIZE_MAX`（server cap）と同一値で弾けば ADR-002 の核心（クライアントで通った＝サーバーでも通る）が保たれる。ADR-002 の Consequences に「UX 上限は別途設けず server cap を SSOT とする」旨を追記して記録。

### 2周目

両視点（要件カバレッジ・アーキテクチャ/リスク）とも**問題点ゼロ**。1周目の P-001 / P-002 はいずれも実コード照合の上で正しく修正され、状態機械変更（`selected` 削除）に伴う新たな矛盾・ブロッカーも検出されなかった。

**修正した点**:
- なし（要修正の指摘なし）。

**取り込んだ改善提案**:
- **[S-001 coverage]** Step 3 に「移設前に `UploadForm.tsx` と `UploadDialog.tsx` の 2 つの `DROPZONE` 文字列が完全一致することを diff で確認してから共有定数へ収斂する」前提検証の一文を追記。完全不変移設の安全性を担保。
- **[S-001 arch-risk]** Step 5 に検証バナーの state 配置方針を明記。検証失敗（unsupported/oversized）は `uploading` に遷移させず別の rejection state（`idle` に optional な rejection を畳むか専用の軽量 useState）で保持し次の選択でクリアする旨、および `uploading`/`done` のペイロードを state.kind と一致させ別 useState 散在による状態不整合を防ぐ方針を追記。
