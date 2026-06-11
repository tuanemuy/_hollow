# 実装計画 — Issue #637: feat(ui): 高度なローディングUX — アップロード進捗・失敗リトライ導線・useFormStatus（#634 Phase 3）

**Issue:** #637
**作成日:** 2026-06-11
**複雑度:** 中〜大規模

---

## 目的

#634（UI を全面的に楽観的更新 / Suspense 対応にする）の Phase 3（高度化・仕上げ）。Phase 1（#635 共通ローディング資産＋pending 可視化）と Phase 2（#636 主要画面の Suspense 分割描画）が完了済みの前提で、以下 3 点を仕上げる。

1. アップロード（取り込み）の進捗を可視化する。
2. ミューテーション失敗時のエラー表示・リトライ導線を全体で一貫させる（DoD#4）。
3. フォームのフィードバックを `useFormStatus` で整理する。

## スコープ

### 含まれるもの

- 取り込みジョブ「処理中（processing）」「待機（pending）」状態の進捗可視化（インデターミネート進捗インジケータ）。`UploadDialog` の `uploading` / `waiting` スケルトン、`IngestionJobRow` / `IngestionQueue` の処理中カード。
- ミューテーション失敗時のインライン・エラー提示にリトライ導線を一貫付与する共通の小コンポーネント整備と、それを使った既存ミューテーション失敗箇所の置換。
- `_app` 配下のルート `errorComponent` を、リトライ導線を持つ共通フォールバックに統一する。
- `useFormStatus` が自然に効く箇所（`<form>` の子に切り出された送信ボタン／送信フィードバック）への導入。
- 規約ドキュメント（`docs/frontend_implementation_example.md`）への追記（進捗表現方針・リトライ規約・`useFormStatus` の使い所）。

### 含まれないもの

- 個別ミューテーションへの楽観的更新の初回導入（→ Phase 1 / #635 完了済み）。
- 各画面への `<Suspense>` 境界の初回導入（→ Phase 2 / #636 完了済み）。
- 取り込みパイプラインへの**実数値進捗（progress %）の付与**（ドメイン／ワーカーに進捗イベントが存在しない。後述「設計判断」参照 — 実数バーは作らずインデターミネート表現に倒す）。
- バックエンド（domain / application / adapter / worker）の変更。本 Issue は presentation 層（`app/components/`・`app/routes/`）のみ。
- 公開側（P30〜P34）の `ErrorPage` 改修。既にリトライ導線（`ReloadButton`）を持ち P34 言語に準拠済みのため対象外。

## 調査結果

### 関連ファイル

- `app/components/ingestion/UploadForm.tsx` — フォールバックページ（`/upload`）のドロップゾーン。`useTransition` の `isPending` でドロップゾーン文言を「アップロード中...」に切替。進捗バーは無い。
- `app/components/ingestion/UploadDialog.tsx` — ヘッダー主動線のモーダル。状態機械（select / uploading / waiting / editing / failed / multiResult / timedOut / committed / queueGuidance）。`uploading` / `waiting` は既に共通 `Skeleton`（`UploadingView` / `WaitingView`）でスケルトン表示済み（Phase 2 で配線）。
- `app/components/ingestion/IngestionJobRow.tsx` — 取り込みキューのカード。`processing` 状態に進捗表現が無い（`statusLabel` チップのみ）。失敗時 `displayJobErrorCode` + `再試行`/`破棄` ボタンあり。インライン mutation エラーは `FORM_ERROR`（text のみ、リトライ無し）。
- `app/components/ingestion/IngestionQueue.tsx` — クライアントポーリング（active 4s / idle 16s / backoff 12s）。ポーリング失敗時は `FORM_ERROR` テキスト表示（リトライ無し）。
- `app/components/ingestion/wire.ts` / `app/core/domain/ingestion/entity.ts` — `IngestionJobWire` は `status` の離散値のみ。**進捗 % フィールドは存在しない**。OCR/音声/LLM はワーカーで非同期処理され、クライアントは status をポーリングするだけ。
- `app/components/common/Skeleton.tsx` / `Spinner.tsx` — Phase 1 で整備済みの共通ローディング資産。`Skeleton`（`role="status"` + pulse、`motion-safe:`）、`Spinner`（小領域専用、`motion-safe:`）。**進捗バー（progress bar）プリミティブは未整備**。
- `app/components/common/styles.ts` / `layout/styles.ts` — `FORM_ERROR = "text-error text-sm mt-2"`（インライン mutation エラーの共通スタイル）。`ALERT` 系（`role="alert"` の構造化アラート）。
- `app/routes/_app/route.tsx` の `AppErrorFallback` — `再読み込み` ボタン付きのリトライ可能なルートフォールバック（`appShellInvalidate`）。これだけがリトライ導線を持つ。
- `app/routes/_app/**` の他の `errorComponent` — 15 ファイル中ほとんどが `<div role="alert"><h1>エラーが発生しました</h1><pre>{sanitizeRouteError(error)}</pre></div>` の**ベア実装でリトライ導線なし**。形・余白もバラバラ（`p-6` ありなし、`<pre>` の class ありなし）。
- `app/components/public/ErrorPage.tsx` + `ErrorNavActions.tsx`（`ReloadButton` / `BackLink`）— 公開側の P34 準拠エラーページ。既にリトライ（reload）導線あり。**本 Issue の対象外**（参照の手本）。
- `useFormStatus` 候補: auth フォーム（`LoginForm` 等）は `useActionState` の `isPending` を送信ボタンと同一コンポーネントで参照しており、`useFormStatus` の出番がない（子コンポーネントへの prop drilling が無い）。`CreateTagForm` は `onSubmit`（`event.preventDefault`）方式で `<form action>` を使っていないため `useFormStatus` は効かない（後述「設計判断 ADR-003」）。
- `app/core/presentation/errorDisplay.ts` — `displayError` / `displayJobErrorCode` / `sanitizeRouteError`。文言マッピングの単一の真実。`SerializedError.retryable` フラグが届く。

### あるべきアーキテクチャ

- `docs/frontend_implementation_example.md`「Pending UX / 楽観的更新 / Suspense フォールバック規約」:
  - 規約4「失敗はエラー境界 + リトライ導線」— ローディング/ミューテーション失敗はエラー境界で受け、**リトライ導線を出す**。mutation の `catch` では `extractSerializedError(e)` で `kind` 分岐。
  - 規約5「汎用ラッパー（`useServerAction` 風フック）は作らず、React 19 プリミティブ（`useActionState` / `useTransition` / `useOptimistic` / `useFormStatus`）を直接使う」。
  - ローディング共通資産は `app/components/common/Skeleton.tsx` / `Spinner.tsx`。スケルトン優先、スピナーは小領域専用。
- `spec/design/index.md`:
  - L92「スピナーよりスケルトン優先」。L93 アニメーションは `prefers-reduced-motion: reduce` で 0ms。
  - 「フィードバック・エラー表示原則（#221）」: **バックグラウンド進捗は client polling で可視化**（取り込み・エクスポート）。`aria-live` で状態遷移を読み上げ。エラー文言は `errorDisplay.ts` 経由のみ。`role="alert"`（即時エラー）/ `role="status"`（進行）。
  - 「インラインアラート（`.alert`）」= 文脈に残すべきエラー、「トースト」= 一時的（実装基盤は別 Issue で未整備）。本 Issue はインラインに閉じる。
- `spec/design/pages/P13-upload.html`: 処理中カードに `.progress`（`role="progressbar"`）+ `.progress-bar`（width %）。ただし 68% / 34% は**静的モック値**で、バックエンドに対応する進捗ソースは無い。
- `spec/design/pages/P13a-upload-modal.html`: `uploading` / `waiting` は `.skeleton`（`aria-live="polite"`）。**進捗 % ではなくスケルトン**。
- `spec/design/pages/P34-error.html`: エラーページの言語（コード見出し + タイトル + 説明 + アクション + 戻るリンク）。`ErrorPage.tsx` が実装済み。

### 既存実装の状態

- **一致**: `UploadDialog` の `uploading`/`waiting` スケルトン（Phase 2 で P13a に整合済み）、`AppErrorFallback` のリトライボタン、`ErrorPage`（公開）のリトライ導線、`IngestionQueue` の polling・`aria-live`、`errorDisplay` 経由の文言統制。
- **乖離（本 Issue で扱う）**:
  - `IngestionJobRow` の `processing` 状態に進捗インジケータが無い（P13 の進捗バー領域が未実装）。
  - `_app` 配下のルート `errorComponent` がベアでリトライ導線なし・形バラバラ（DoD#4 の「全体で一貫」に未到達）。
  - インライン mutation エラー（`FORM_ERROR` テキスト）にリトライ導線が無い箇所が散在（`IngestionQueue` のポーリング失敗、`IngestionJobRow` の commit/discard/regenerate 失敗など）。
  - `useFormStatus` が 0 件。`<form action>` を使う子コンポーネント分割が無いため、自然に効く箇所は限定的。
- **設計上の制約**: 取り込みは「実数進捗」を提供できない（ドメインに進捗フィールドなし）。P13 の % バーは静的モックであり、実装はインデターミネート進捗（アニメーション付きの不定進捗バー or スケルトン）に倒す。

### 依存関係

- 影響範囲は presentation 層に閉じる（`app/components/`・`app/routes/`・`docs/`）。domain / application / adapter / worker は不変。
- 共通の進捗インジケータ／リトライ付きエラー表示を新設すると、`IngestionJobRow` / `IngestionQueue` / 各 `_app` route が依存する。既存の `Skeleton` / `Spinner` / `errorDisplay` / `pillBtn` 系を再利用する（新規 motion トークンは追加しない — #635 ADR-001 を踏襲）。

## 実装ステップ

### 1. 共通: インデターミネート進捗インジケータ `ProgressBar` の新設

- **対象ファイル:** `app/components/common/ProgressBar.tsx`（新規）、`app/components/common/__tests__/ProgressBar.test.tsx`（新規）
- **変更内容:** P13 の `.progress` / `.progress-bar` をユーティリティ first で表現する presentational コンポーネント。**実数 % が無い前提で `indeterminate` モードを既定**とし、`--color-surface` のトラック + `--color-accent` のバーが左右にスライドするアニメーション（`motion-safe:` でガード、`motion-reduce:` では静的バー）。a11y は `role="progressbar"` + `aria-busy`（indeterminate のため `aria-valuenow` は付けない）+ `aria-label`。将来実数進捗が来た場合に備え `value?: number`（0–100）も受けられる任意 prop を用意するが、本 Issue では indeterminate のみ使用。
- **理由:** P13 の進捗バー言語に視覚的に揃えつつ、バックエンドに進捗ソースが無い現実（設計判断 ADR-001）に整合させる。スケルトンとは別に「処理中カード内の細い進捗ライン」を表現するため Skeleton では代替しづらい。

### 2. 取り込みキューの「処理中」カードに進捗を可視化

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** `job.status === "pending" | "processing"` のとき、ステータスチップに加えてカード本文に `ProgressBar`（indeterminate）+ 状態行（`processing`=「タイトルとメタデータを解析中...」、`pending`=「処理を待っています...」）を表示する。`aria-live` は親 `IngestionQueue` の `aria-live="polite"` 領域に内包されるため、進捗ラベルは視覚 + SR 双方で状態遷移を伝える（重複読み上げにならないよう `ProgressBar` 自体の `role="progressbar"` ラベルとテキストラベルの分担を整理）。
- **理由:** P13「処理中カードの進捗バー」要件。実数が無いので indeterminate + 文言で「進行中であること」を可視化する。

### 3. `UploadDialog` の `uploading` / `waiting` スケルトンの確認と微整合

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `UploadingView` / `WaitingView` は既に共通 `Skeleton` で P13a に整合済み。**進捗が「複数ファイルのうち何件目か」を可視化できる箇所のみ**、`uploading` ビューに「`n / total` 件目をアップロード中」の件数進捗を加える（`submitFiles` のループに index を持たせ、`uploading` view の `total` に加えて `done` を持たせる）。`ProgressBar` を determinate（件数ベースの実数）で使えるならここが唯一の実数進捗箇所。`waiting`（LLM 推論待ち）は実数不能なのでスケルトンのまま据え置き。
- **理由:** アップロード「確定までの進捗」の可視化要件。ファイル送信はクライアントが逐次 `await upload()` するため、**件数ベースの進捗だけは実数で取れる**（設計判断 ADR-001）。LLM 推論はスケルトンに留める。

### 4. 共通: リトライ導線付きインラインエラー `RetryableError` の新設

- **対象ファイル:** `app/components/common/RetryableError.tsx`（新規）、`app/components/common/__tests__/RetryableError.test.tsx`（新規）
- **変更内容:** `error: SerializedError`・`onRetry?: () => void`・`isRetrying?: boolean` を受け、`displayError(error)` の文言を `role="alert"` で表示し、`再試行` ボタン（`pillBtn`、`RefreshCw` アイコン、`disabled={isRetrying}` + `aria-busy`）を併置する presentational コンポーネント。文言・配色は `FORM_ERROR` / `ALERT` の既存言語に揃える。
  - **`onRetry` と `error.retryable` の分担:** リトライ操作の実体（何を再実行するか）は呼び出し側が持つため `onRetry` prop で渡す。加えて `RetryableError` 側で **`error.retryable === false` のときは `onRetry` があってもボタンを抑制**するガードを持たせる（`fatal`＝unauthorized/forbidden 等の非リトライエラーで誤ってボタンを出さないため）。ボタン表示条件は「`onRetry` が渡され、かつ `error.retryable !== false`」。これにより各呼び出し側（特に `IngestionQueue` の fatal 時）の判断が一箇所に集約され一貫する。
- **理由:** DoD#4「ミューテーション失敗時のエラー表示・リトライ導線が全体で一貫」。現状インライン mutation エラーは `FORM_ERROR` テキストのみでリトライ手段が UI 上に無い箇所が散在。共通化で言語と導線を統一する。汎用「フック」ではなく presentational コンポーネントなので規約5（ラッパー禁止）に抵触しない。

### 5. インライン mutation 失敗箇所を `RetryableError` で統一

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`、`app/components/ingestion/IngestionQueue.tsx`、`app/components/ingestion/UploadForm.tsx`、（必要に応じ）`app/components/note/editor/MediaUploader.tsx`
- **変更内容:** これらの `FORM_ERROR` テキスト表示を `RetryableError` に置換し、直前に失敗したミューテーションを再実行する `onRetry` を渡す。
  - `IngestionJobRow`: commit / regenerate / retry / discard の各失敗で、最後に試みた操作を `onRetry` として渡す（`ConfirmDialog` 内の discard エラーは既存の `error` prop 経路を尊重し、リトライは `runDiscard` 再実行に紐づける）。
  - `IngestionQueue`: ポーリング失敗（`pollErrorMessage`）に「今すぐ再取得」リトライ（手動 tick 起動）を付与。
  - `UploadForm`: アップロード失敗時にドロップ済みファイルの再送信導線（同じ accepted ファイルを再 submit）。
  - `MediaUploader` は既に `再試行` ボタンを持つため、言語統一の観点で `RetryableError` に寄せられるか確認の上、独自挙動（個別ファイルの再試行）が崩れない範囲でのみ置換（崩れるなら現状維持）。
- **理由:** DoD#4 の一貫化。失敗 → リトライの導線を同一の見た目・操作で提供する。

### 6. `_app` ルート `errorComponent` を共通フォールバックに統一

- **対象ファイル:** `app/routes/_app/route.tsx`（`AppErrorFallback` を共通化・export 維持）、`app/routes/_app/index.tsx`・`tags/index.tsx`・`trash/index.tsx`・`notes/$noteId/index.tsx`・`notes/new.tsx`・`exports/$jobId.tsx`・`views/route.tsx`・`upload/index.tsx` 他、ベア `errorComponent` を持つルート群（計 ~14 ファイル）
- **変更内容:** リトライ導線付きの共通 `RouteErrorFallback` を `app/components/layout/`（または `common/`）に新設し、ベア `errorComponent` を持つ `_app` 子ルート群を差し替える。リトライ実装は既存ラッパー規約（`app/components/common/routerInvalidate.ts`）に接続し、**`_app` を除外する `routerInvalidate(router)` を使う**（生の `router.invalidate()` は `_app` シェルまで再評価して `staleTime: Infinity` の意図と衝突するため避ける）。`_app/route.tsx` の `AppErrorFallback` はシェル境界専用（`appShellInvalidate`）として残し、子ルート用とは意味的に分離する（ADR-002）。
  - **置換対象の確定:** ベア実装（`<div role="alert"><h1>...</h1><pre>{sanitizeRouteError(error)}</pre></div>` でリトライ無し）のルートに限定する。`settings/route.tsx` は専用スタイル（`SETTINGS_ERROR_BOX/TITLE/BODY`）でレイアウト済みのため、共通化で見た目が変わらないか個別判断（崩れるなら現状維持）。ネストした親子両方が `errorComponent` を持つ箇所（例: `notes/$noteId/history/` 系）は、TanStack の「最も近い子で止まる」挙動により二重表示にならないことを統一作業時に1度確認する。
- **理由:** DoD#4。ルートレベル失敗のリトライ導線・見た目を `_app` 全体で揃える。現状は `AppErrorFallback` だけがリトライを持ち、他はベア。

### 7. `useFormStatus` を既存 `<form action>` フォームの送信ボタンへ導入

- **対象ファイル:** `app/components/common/SubmitButton.tsx`（新規・presentational）、`app/components/identity/SecurityForm/index.tsx`、`app/components/identity/ProfileForm/index.tsx`、`app/components/public/ShareLinkGate/index.tsx`
- **変更内容:** `useFormStatus()` の `pending` で `disabled` + `aria-busy` + pending ラベルを出す共通 presentational `SubmitButton`（`pillBtn` 系スタイル、`label` / `pendingLabel` prop）を新設し、**既存の `<form action>` フォームの送信ボタンをこれに置換**して `useActionState` pending の同居参照を解消する。レビューで実コードを確認した結果、当初候補（`directory/*Dialog` / `SaveViewDialog`）は全て `<form onSubmit>` 方式で `useFormStatus` が効かず、`<form action>` を使う既存フォームはすべて送信ボタンが `useActionState` pending を同居参照していた。`useFormStatus` 本来の用途（送信ボタンを子に切り出して親フォームの pending を得る整理）に正しく当てる。
  - `SecurityForm`: `<form action={pwAction}>` の「パスワードを変更」ボタン（`pwPending` のみ消費）、`<form action={emailAction}>` の送信ボタン（`emailPending` のみ消費）を `SubmitButton` 子に置換。**最有力・確実**。
  - `ProfileForm`: `<form action={usernameAction}>` の送信ボタン（`usernamePending` のみ消費）を置換。`<form action={profileAction}>` の保存ボタンは `profilePending || avatarUpload.kind === "uploading"` の複合条件のため、`useFormStatus` で form-pending を取り avatar 状態のみ prop で残す（整理の利が見合うか実装時に判断）。
  - `ShareLinkGate`: 現状 `ShareLinkGateView` へ `isPending` を **prop drilling** しているため、送信ボタンを `SubmitButton` 子に切り出せば prop drilling を解消できる典型ケース。ボタンは `isPending || isLocked` の複合条件なので `isLocked` のみ prop で残す。
  - **対象外**: `PublishSettings`（親が `anyPending` を集約して `closable`／行 dim を制御）、`DesignTokensForm`（`busy = isPending || isResetting || isRowResetting` の複合）、`CreateTagForm`（`onSubmit` 方式・action 化は楽観反映の作り替えを伴い副作用大）、auth フォーム群（`<form action>` 不使用）。
- **理由:** DoD「フォームのフィードバックが `useFormStatus` を用いて整理されている」。`useFormStatus` は `<form>` の子で親フォームの送信 pending を取得する API なので、`<form action>` を既に使う実在フォームの送信ボタンを子に切り出す形でのみ導入する。無理に全フォームを action 化しない（規約5・既存 `useActionState` パターンと整合 / ADR-003）。

### 7b.（任意）`MediaUploader` の実バイト進捗（スコープ外・実施判断はレビューで）

- **対象ファイル:** `app/components/note/editor/MediaUploader.tsx`
- **変更内容:** presign 後の `fetch` PUT（`runUpload` 内）を `XMLHttpRequest` + `xhr.upload.onprogress` に置換し、`ProgressBar`（determinate）でバイト進捗を表示する。`onRetry` の既存挙動（`lastFile` 再送）は維持。
- **理由:** ここは presigned URL への直接アップロードで**実バイト進捗が技術的に取得可能な唯一の箇所**。ただし Issue #637 の主スコープは ingestion であり MediaUploader は明記されていないため、**必須ではなく任意**（ADR-001 補足）。やるなら本ステップ、やらないなら現状の「アップロード中…」テキスト + 既存リトライを `RetryableError` 言語に寄せるのみ。

### 8. 規約ドキュメントの追記

- **対象ファイル:** `docs/frontend_implementation_example.md`
- **変更内容:** 「Pending UX / 楽観的更新 / Suspense フォールバック規約」セクションに以下を追記:
  - 進捗表現方針: 実数進捗が取れる箇所（クライアント逐次アップロードの件数）は determinate、取れない箇所（OCR/LLM のワーカー処理）は indeterminate `ProgressBar` または `Skeleton`。`ProgressBar` の a11y 契約。
  - 規約4 の具体化: インライン mutation 失敗は `RetryableError`、ルート失敗は共通フォールバック（リトライ = `router.invalidate()`）で統一。
  - `useFormStatus` の使い所: `<form action>` の子送信ボタン（`SubmitButton`）に限定。`useActionState` で同一コンポーネント内に pending がある箇所には導入しない。
- **理由:** #634 全体 DoD「規約が `docs/frontend_implementation_example.md` に追記される」の Phase 3 分担。

### 9. 型チェック・lint・テスト・整形

- **対象ファイル:** 全変更ファイル
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。新規コンポーネントの単体テスト（`ProgressBar` の a11y 属性 / `motion-safe`、`RetryableError` の `onRetry` 表示・非表示、`SubmitButton` の `useFormStatus` pending 反映）を追加し、既存テスト（`IngestionJobRow.test.tsx`・`UploadDialog.test.tsx` 等）の回帰を確認。
- **理由:** CLAUDE.md「After changes: typecheck && lint:fix && format」。

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001: アップロード進捗は「実数進捗が取れる箇所のみ determinate、それ以外は indeterminate/skeleton」**。取り込みパイプライン（OCR/音声/LLM）はワーカー非同期処理で、ドメイン・wire に進捗 % フィールドが無く、サーバー関数経由のアップロードでも streaming 進捗は取得不能。P13 の % バーは静的モック。よって「ストリーミング進捗」はクライアント逐次アップロードの**件数進捗**に限り実数化し、サーバー側処理は indeterminate 進捗バー or スケルトンで「進行中」を可視化する。
- **ADR-002: ルート失敗の共通フォールバックはリトライ = `router.invalidate()` を既定**。シェル専用の `appShellInvalidate` は `_app/route.tsx` 境界に限定し、子ルートには汎用の `router.invalidate()` リトライを持つ `RouteErrorFallback` を用意する（または `AppErrorFallback` を引数でリトライ関数を差し替え可能にする）。
- **ADR-003: `useFormStatus` は `<form action>` の子送信ボタンに限定し、`CreateTagForm` の action 化は行わない**。`useActionState` で同一コンポーネントに pending がある auth フォーム群は対象外（`useFormStatus` の利点が無い）。

## リスクと注意点

- **「進捗のストリーミング」要件の解釈差**: Issue 文言は「ストリーミング」だが、ingestion はバックエンドに進捗ソースが無いため**実数バーは実装不能**。indeterminate 表現 + 件数進捗で要件（「進捗が可視化されている」DoD）を満たす方針を ADR-001 に明記。レビューで「実数バー必須」と解釈されると齟齬が出るため、ADR で合意を取る。なお `MediaUploader` の presigned PUT のみ XHR で実バイト進捗が取得可能（ステップ 7b・任意）だが、Issue の主スコープ（ingestion）外。
- **ルート errorComponent の一括置換**: 14 ファイルに渡るため、`redirect()` / `notFound()` センチネルがフォールバックに飲み込まれないこと（TanStack Router が捕捉する設計なので errorComponent には届かない）を確認。`notFoundComponent` は別物なので触らない。
- **`IngestionQueue` のポーリング失敗リトライ**: 手動 tick 起動を追加する際、既存のポーリング状態機械（`inflightRef` / `fatalRef` / `cancelledRef`）と競合しないこと。`fatal`（unauthorized/forbidden）時はリトライを出さない。
- **`aria-live` の二重読み上げ**: `IngestionJobRow` の進捗ラベルと `IngestionQueue` の `aria-live="polite"` 領域、`ProgressBar` の `role="progressbar"` が重複読み上げにならないよう分担を整理（進捗バー自体は装飾的に `aria-hidden`、テキストラベルで状態を伝える等）。
- **`useFormStatus` の適用範囲が小さい**: 自然に効く箇所が少ない（多くが `useActionState` 同居 or `onSubmit` 方式）。無理に広げず「整理された」状態を満たす最小導入に留める。0 件 → 数件で DoD は満たせるが、レビューで「もっと広げるべき」と指摘されうるため ADR-003 で範囲を明示。
- **motion トークン非追加**: #635 ADR-001 を踏襲し、`ProgressBar` のスライドは Tailwind 標準 + `motion-safe:` で表現。新規 keyframe が必要な場合は `tokens.css` / `index.css` ではなくユーティリティ内で完結させる（必要なら `@theme` ではなくコンポーネント内 arbitrary animation を検討、`prefers-reduced-motion` ガード必須）。

## テスト方針

- 単体テスト: `ProgressBar`（indeterminate の a11y 属性・`motion-safe`/`motion-reduce`）、`RetryableError`（`onRetry` あり/なしのボタン表示・`isRetrying` disabled）、`SubmitButton`（`useFormStatus` pending 反映）。
- 回帰: `IngestionJobRow.test.tsx`・`UploadDialog.test.tsx`・`IngestionPreviewForm.test.tsx` などの既存テスト。
- 手動: `docs/test.md` / 後述 `testing.md` に従いローカルサーバーでアップロード進捗・失敗リトライ・フォーム pending を目視確認。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクの2視点）

**修正した点**:
- アップロード進捗の実現可能性を深掘り。`uploadFileFn`（ingestion）はサーバー関数経由で進捗取得不能、`MediaUploader` のみ presigned PUT で XHR バイト進捗が技術的に可能と判明 → ADR-001 補足・ステップ 7b（任意）・リスクに反映。
- 「ストリーミング」要件の現実解（indeterminate + 件数進捗）を ADR-001 で明示し、レビュー合意ポイントとして強調。

**確認した点（問題なし）**:
- DoD 3 点（リトライ一貫化 / 進捗可視化 / `useFormStatus` 整理）をステップ 2・5・6（進捗・リトライ）と 7（useFormStatus）でカバー。
- スコープ外（楽観的更新の初回導入・Suspense 初回導入）に踏み込んでいない。バックエンド不変で presentation に閉じる。
- `useFormStatus` の適用範囲を ADR-003 で限定（自然に効く `<form action>` 子ボタンのみ）し、規約5（無理な抽象化禁止）と整合。
- ルート errorComponent 統一でシェル invalidate（`appShellInvalidate`）と子ルート invalidate（`router.invalidate()`）を意味的に分離（ADR-002）。
- `redirect()` / `notFound()` センチネルは errorComponent に届かない（Router が捕捉）ため統一対象に影響なし。

### 2周目（要件カバレッジ / アーキ・リスクの2視点 — 2026-06-12）

**修正した点（両視点が一致して指摘した最重要点 P-001）**:
- ステップ7・ADR-003 の前提「`useFormStatus` が自然に効く既存箇所」がコードベースに**1件も存在しない**ことが判明（当初候補の `directory/*Dialog`・`SaveViewDialog` は全て `<form onSubmit>` 方式、`<form action>` を使うフォームは全て `useActionState` pending を送信ボタンと同居参照）。→ 実在ターゲットを名指しで確定: `SecurityForm`（pwAction/emailAction）、`ProfileForm`（usernameAction、保存ボタンは複合条件）、`ShareLinkGate`（prop drilling 解消の典型）。`PublishSettings`／`DesignTokensForm`／`CreateTagForm`／auth フォームは対象外と明示。ADR-003 を全面改稿。

**取り込んだ改善提案**:
- [S-001] ステップ6/ADR-002 のリトライを既存ラッパー規約に接続 — 生の `router.invalidate()` ではなく `routerInvalidate(router)`（`_app` 除外）を使う旨を明記。
- [S-002] `RetryableError` に `error.retryable === false` ガードを持たせ、ボタン表示条件を「`onRetry` あり かつ `error.retryable !== false`」に統一（ステップ4）。
- [S-001/S-002（アーキ視点）] ステップ6に置換対象の確定基準（ベア実装限定）、`settings/route.tsx` の専用スタイル除外、ネスト errorComponent の二重表示確認を追記。

**見送った提案とその理由**:
- なし（指摘はすべてスコープ内で取り込み可能だったため反映）。
