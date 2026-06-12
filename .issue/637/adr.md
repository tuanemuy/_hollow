# ADR — Issue #637: 高度なローディングUX（アップロード進捗・失敗リトライ導線・useFormStatus）

## ADR-001: アップロード進捗は「取れる箇所のみ determinate、それ以外は indeterminate / skeleton」

### Status
Proposed

### Context
Issue は「アップロード進捗のストリーミング」を求め、`spec/design/pages/P13-upload.html` は処理中カードに `role="progressbar"` + `width: 68%` 等の**実数進捗バー**を描いている。しかし調査の結果:

- `IngestionJobWire` / `app/core/domain/ingestion/entity.ts` のジョブは `pending / processing / previewing / saved / failed / discarded` の**離散ステータスのみ**で、進捗 %（数値）フィールドが存在しない。
- OCR・音声認識・LLM の重い処理は**ワーカーで非同期実行**され、クライアントは `IngestionQueue` の polling で status を観測するだけ。進捗イベントのストリームは無い。
- サーバー関数（`createServerFn` POST）経由のアップロードは Cloudflare Workers ランタイム上で、リクエストボディ送信の途中経過（XHR の `progress` イベント相当）をクライアントに返す仕組みを持たない。`fetch` ベースの `useServerFn` 呼び出しはアップロード進捗イベントを露出しない。
- P13 の 68% / 34% は静的モック値であり、対応するバックエンド進捗ソースは無い。

選択肢:
- (A) 実数進捗バーを実装する → バックエンド（domain/worker に進捗イベント）の新設が必要。本 Issue のスコープ（presentation のみ・Phase 3 仕上げ）を大きく超える。
- (B) すべてスケルトンに留める → P13 の「進捗バー」言語と乖離。
- (C) **実数が取れる箇所のみ determinate、取れない箇所は indeterminate 進捗バー or スケルトン**。

補足（別経路の調査）: `note/editor/MediaUploader.tsx` は presign（`presignMediaUploadFn`）→ クライアントから presigned URL へ**直接 `fetch` PUT** する経路を持つ。`fetch` はアップロード進捗イベントを露出しないが、`XMLHttpRequest`（`xhr.upload.onprogress`）に置き換えれば**バイト単位の実 progress が取得可能**な唯一の箇所。ただし MediaUploader は Issue #637 の主スコープ（`ingestion/UploadForm` / `UploadDialog`）に明記されておらず、ingestion アップロード（`uploadFileFn` サーバー関数経由）には進捗経路が無い。

### Decision
(C) を採る。

- **クライアント逐次アップロード（`UploadDialog` の複数ファイル送信ループ）の件数進捗**は実数で取れる（`n / total` 件目）。ここだけ determinate な件数進捗を出せる。
- **ワーカー側処理（processing / waiting＝LLM 推論待ち）**は実数不能。`IngestionJobRow` の processing カードには **indeterminate な `ProgressBar`（スライドアニメーション）+ 状態文言**を出し、`UploadDialog` の `waiting` は既存の `Skeleton` を維持する。
- `ProgressBar` は `value?: number` を任意で受けられる構造にし、将来バックエンドが進捗イベントを持ったときに determinate へ拡張できる余地を残す（ただし本 Issue では indeterminate と件数のみ使用）。

`MediaUploader` の XHR 化（実バイト進捗）は **任意拡張**とし、本 Issue の必須スコープには含めない（Issue が ingestion を主対象に挙げているため）。実施する場合は別途オプションステップとして `fetch` → `XMLHttpRequest` + `ProgressBar`（determinate）に置換する。

### Consequences
- 良い点: スコープを presentation に閉じたまま、P13 の進捗バー言語に視覚的に揃い、「進捗が可視化されている」DoD を満たせる。将来拡張の口も残す。
- トレードオフ: 「ストリーミング（実数）進捗」という文言の厳密な実現ではない（ingestion 経路では）。Issue の意図（進行中であることの可視化）を満たす現実解であることをレビューで合意する必要がある。MediaUploader の XHR 進捗は実現可能だがスコープ外（任意）。

---

## ADR-002: ルート失敗の共通フォールバックはリトライ = `router.invalidate()` を既定とする

### Status
Proposed

### Context
DoD#4「ミューテーション失敗時のエラー表示・リトライ導線が全体で一貫している」を満たすには、ルートレベルの失敗（`errorComponent`）も統一が必要。現状:

- `app/routes/_app/route.tsx` の `AppErrorFallback` だけがリトライボタン（`再読み込み` = `appShellInvalidate(router)`）を持つ。
- 他の `_app` 配下 ~14 ルートはベアな `<div role="alert"><h1>エラーが発生しました</h1><pre>{sanitizeRouteError(error)}</pre></div>` で**リトライ導線なし・形バラバラ**。

`appShellInvalidate` はアプリシェル（ヘッダー/サイドバー）専用の invalidate であり、子ルート（タグ一覧・ノート詳細等）の再取得には標準の `router.invalidate()` が適切。

選択肢:
- (A) 全ルートで `AppErrorFallback`（`appShellInvalidate`）を流用 → シェル専用 invalidate を子ルートに使うのは意味的にずれる。
- (B) リトライ関数を差し替え可能にした共通 `RouteErrorFallback` を新設し、各ルートが `router.invalidate()` リトライで参照。`_app/route.tsx` の `AppErrorFallback` はシェル境界（`appShellInvalidate`）専用として残す。

### Decision
(B) を採る。共通の `RouteErrorFallback`（`再読み込み` リトライ、`sanitizeRouteError` で文言化、`role="alert"`）を `app/components/layout/`（または `common/`）に新設し、ベアな `_app` ルート群の `errorComponent` を差し替える。リトライは**既存ラッパー規約 `routerInvalidate(router)`（`_app` を除外）**を使う — 生の `router.invalidate()` は `_app` シェルまで再評価して `staleTime: Infinity` の意図と衝突するため避ける（`app/components/common/routerInvalidate.ts` の規約に従う）。`_app/route.tsx` のシェル境界は `appShellInvalidate` を保つ。

`settings/route.tsx`（専用スタイル `SETTINGS_ERROR_BOX/TITLE/BODY` を持つ）は一括置換から除外し個別判断する。ネストした親子双方が `errorComponent` を持つ箇所は、TanStack の「最も近い子で止まる」挙動で二重表示にならないことを確認する。

### Consequences
- 良い点: `_app` 全体でルート失敗の見た目・リトライ導線が統一。シェル invalidate と子ルート invalidate の意味的分離も保て、`routerInvalidate` ラッパー規約とも整合。
- トレードオフ: 既存の `AppErrorFallback`（export & テスト `AppErrorFallback.test.tsx` あり）との二重構造になる。テストの整合を取る必要がある（シェル境界用と子ルート用で別物として扱う）。settings 等の専用スタイルルートは置換対象から外れる。

---

## ADR-003: `useFormStatus` は既存 `<form action>` フォームの送信ボタンを子に切り出して導入する（実在ターゲットを名指しで確定）

### Status
Proposed（レビュー反映で実在ターゲットを確定 — 2026-06-12）

### Context
DoD「フォームのフィードバックが `useFormStatus` を用いて整理されている」。`useFormStatus` は **`<form>` の子コンポーネント**が「最も近い親フォーム」の送信 pending を取得するための API。レビュー（2視点）で、当初計画が候補に挙げた `directory/*Dialog` / `note/list/SaveViewDialog` は**すべて `<form onSubmit>` + `event.preventDefault()` 方式**で `<form action>` を使っておらず `useFormStatus` が効かないこと、また `<form action>` を使う既存フォーム（auth / identity / publication / admin / ShareLinkGate）は**すべて送信ボタンが同一コンポーネント内で `useActionState` の pending を参照**しており、「子に切り出すだけで自然に効く既存箇所」が**1件も存在しない**ことが判明した。

つまり「自然に効く箇所への限定導入」という当初の前提は接続先が無く宙に浮く。コードベースの実態（調査で確認済み）:

- `<form action>` を使うフォーム: `identity/ProfileForm`（`profileAction` / `usernameAction`）、`identity/SecurityForm`（`pwAction` / `emailAction`）、`publication/PublishSettings`（`visibilityAction` / `issueAction`）、`admin/DesignTokensForm`（`formAction`）、`admin/LLMSettingsForm`、`public/ShareLinkGate`（`formAction`、しかも `ShareLinkGateView` へ `isPending` を **prop drilling** している）、`layout/Header`。
- これらの送信ボタンはいずれも `useActionState` の戻り値 pending（`profilePending` / `pwPending` / `emailPending` 等）を**同居参照**して `disabled` / `aria-busy` / pending ラベルを出している。
- `CreateTagForm` は `onSubmit` 方式で `<form action>` 不使用。楽観的更新は親 `TagList` 所有（#635 ADR-002）。action 化は楽観反映経路の作り替えを伴い副作用が大きい。

`useFormStatus` 本来の用途は、まさにこの「`<form action>` の送信ボタンを子コンポーネントへ切り出し、`useActionState` の pending を明示参照せずに pending を得る」整理である。これは DoD の「整理されている」に正面から合致する。

選択肢:
- (A) 全フォームを `<form action>` + `useFormStatus` に統一 → `onSubmit` 方式（CreateTagForm / 各ダイアログ）の作り替えが必要でスコープ膨張、規約5（無理な抽象化を避ける）と摩擦。
- (B) **既存の `<form action>` フォームの送信ボタンを共通 `SubmitButton`（`useFormStatus`）に切り出す**ことで、`useActionState` pending の同居参照を解消する。新規の `onSubmit` → `action` 化は行わない。

### Decision
(B) を採る。`useFormStatus()` の `pending` で `disabled` + `aria-busy` + pending ラベルを出す共通 presentational `SubmitButton`（`pillBtn` 系・`label` / `pendingLabel` prop）を新設し、既存 `<form action>` フォームの送信ボタンをこれに置換する。

**確定する実在ターゲット（送信ボタンが自フォームの pending のみを消費する=最もクリーンな箇所から）:**
1. `identity/SecurityForm` — `<form action={pwAction}>` の「パスワードを変更」ボタン（`pwPending` のみ消費）、`<form action={emailAction}>` の送信ボタン（`emailPending` のみ消費）。**最有力・確実**。
2. `identity/ProfileForm` — `<form action={usernameAction}>` の送信ボタン（`usernamePending` のみ消費）。`<form action={profileAction}>` の保存ボタンは `profilePending || avatarUpload.kind === "uploading"` の複合条件のため、`useFormStatus` で form-pending 分を取り、avatar アップロード状態のみ prop で残す（実装時に整理の利が見合うか判断）。
3. `public/ShareLinkGate` — `ShareLinkGateView` へ `isPending` を prop drilling しているため、ボタンを `SubmitButton` 子に切り出せば prop drilling を**解消できる典型ケース**（ただしボタンは `isPending || isLocked` の複合条件なので `isLocked` は別 prop で残す）。

`PublishSettings`（親が `anyPending` を集約して `closable` / 行 dim を制御）と `DesignTokensForm`（`busy = isPending || isResetting || isRowResetting` の複合）は、pending を親や複数状態が消費するため切り出しの利が小さく、**対象外**（現状維持）。`CreateTagForm` の action 化・auth フォーム（`LoginForm` 等、`<form action>` 不使用）の作り替えも行わない。

### Consequences
- 良い点: `useFormStatus` を**実在する `<form action>` フォーム**に in-place で導入でき、`useActionState` pending の同居参照や prop drilling（`ShareLinkGate`）を解消。規約5・既存パターンと整合し、DoD「整理されている」を実体のある形で満たす。
- トレードオフ: 複合 pending 条件を持つボタン（ProfileForm の保存・ShareLinkGate）は form-pending 以外の状態が prop に残り、完全な prop 削減にはならない。導入箇所は数フォームに留まるが、「自然に効く既存箇所」に正しく当てた最小導入であることを本 ADR で明示しレビュー合意を取る。

---

## ADR-004: indeterminate `ProgressBar` のアニメーションは「スライド」ではなく Tailwind 標準 `animate-pulse`（実装時決定）

### Status
Accepted（実装時 — 2026-06-12）

### Context
plan.md ステップ1 / ADR-001 は indeterminate 進捗バーを「アクセントバーが左右にスライドするアニメーション」と記述していた。スライドを実現するには `@keyframes` が必要で、選択肢は次の 2 つ:

- (A) `tokens.css` / `index.css` に `@keyframes` を追加する → #635 ADR-001（新規 motion トークンを追加しない）に違反。
- (B) コンポーネント内に scoped `<style dangerouslySetInnerHTML>` でキーフレームを定義する → Biome の `lint/security/noDangerouslySetInnerHtml` がエラーになり、`biome-ignore` も整形で位置がずれて機能しなかった。

### Decision
スライドを諦め、indeterminate 表現を **Tailwind 標準の `animate-pulse`（opacity パルス）を部分幅のアクセントバーに当てる**形に変更する。`motion-safe:animate-pulse` でガードし、`prefers-reduced-motion: reduce` では同じ部分バーが静的に表示される。`role="progressbar"` / `aria-busy` / determinate 拡張余地（`value`）は維持。新規キーフレーム・新規トークン・`dangerouslySetInnerHTML` をいずれも導入しない。

### Consequences
- 良い点: #635 ADR-001（motion トークン非追加）と Biome 規約の双方を満たしつつ「進行中であること」を視覚的に伝えられる。`Skeleton` の pulse と同じ motion 言語に揃う。
- トレードオフ: P13 モックの「スライド」見た目とは厳密一致しない（実数進捗ソースが無くスライド距離が意味を持たないため、パルスで十分と判断）。将来スライドが必要になれば Tailwind の `@theme` でキーフレームを足す別 Issue に切り出す。
