# 実装計画 — Issue #12: /exports/$jobId 詳細ルート + 一括エクスポート完了通知

**Issue:** #12
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

`BulkExportDialog` で `enqueueExportJob` 起動後にユーザを着地させる詳細ページを新設し、進行状況・完了通知・ダウンロード導線を 1 画面で提供する。Issue #1 (PR #7) の Phase 4 follow-up。

## スコープ

### 含まれるもの
- `app/routes/exports/$jobId.tsx` 新規追加（GET RSC ルート）
- ジョブ詳細ビュー (`ExportJobDetail`) の追加（状態 / 進捗 / エラー / ダウンロード / キャンセル）
- 進行中ジョブのクライアントポーリング (`router.invalidate()` 駆動、3 秒間隔、ターミナル状態で停止)
- `BulkExportDialog` の起動後ナビゲート先を `/exports` → `/exports/$jobId` に切替
- 一覧 (`ExportJobsListView`) 内の各行から詳細ページへのリンク導線（着地後の戻り経路と対になる導線として、最小一行追加）

### 含まれないもの
- 新規 usecase の追加（既存 `getExportJob` / `cancelExportJob` / `downloadExportArtifact` で完結）
- push 配信（SSE / WebSocket / Durable Object）の導入 — Cloudflare Workers ランタイムで未整備。詳細は ADR-001 参照
- 単発エクスポート (`startExportFn`) や `ExportForm` 経由の bulk submit の動線変更
- 既存 `ExportJobsList` の大規模リファクタ（`STATUS_LABEL` の export 化のみ最小変更）
- ユニットテストの新規追加（presentation 層に既存テスト基盤がない領域。手動検証で担保）

## 実装ステップ

### 1. `ExportJobDetail` ローダーを追加

- **対象ファイル:** `app/components/export/ExportJobDetail/loader.ts`（新規）
- **変更内容:**
  既存 `ExportJobsList/loader.ts` と同じ `serverData` + `cache` パターンで `loadExportJob` を export。入力は `{ actorUserId: UserId; jobId: ExportJobId }`、出力は `{ job: ExportJobDTO }`。`@/core/application/export/getExportJob` を動的 import。
- **理由:** RSC データフェッチ規約（`serverData` + `cache`）を一覧側と統一。

### 2. クライアント詳細ビューを追加

- **対象ファイル:** `app/components/export/ExportJobDetail/index.tsx`（新規、`"use client"`）
- **変更内容:**
  - `ExportJobDetailView({ job }: { job: ExportJobDTO })` を export。
  - 表示項目: ステータスラベル（`STATUS_LABEL` を `ExportJobsList` から import）、`format` / `scope`、`progress.processed/total`、`createdAt` / `completedAt` / `expiresAt`、`errorReason`、`failedNoteIds`（`failedNoteIds.length > 0` のとき。`failed` 状態の部分失敗一覧として明示）、`artifactSize`（バイト → KB / MB 整形）。
  - **進捗バー:** `processing` かつ `progress.total > 0` のとき `role="progressbar"` + `aria-valuemin={0}` + `aria-valuemax={job.progress.total}` + `aria-valuenow={job.progress.processed}` を全て付与。`total === 0`（処理開始前など）の場合は progressbar を出さず「処理待ち」相当のテキストにフォールバック。
  - アクション: `canDownload = job.status === "completed" && (job.expiresAt === null || Date.parse(job.expiresAt) > Date.now())` のとき「ダウンロード」(`useServerFn(downloadExportFn)` → `window.location.href = url`)。`pending` / `processing` なら「キャンセル」(`useServerFn(cancelExportFn)` → `router.invalidate()`)。`completed` でも `expiresAt <= now` の場合はダウンロードボタンを出さず「有効期限切れのため再エクスポートが必要です」相当のメッセージを表示（ADR-003）。
  - **ポーリング (active 状態のみ):** `useEffect` で自己呼出しの `setTimeout` 再帰（`setInterval` ではなく）を仕込み、3 秒ごとに `await router.invalidate()` → 再度 schedule。ターミナル状態 (`completed | failed | cancelled | expired`) で停止。`document.visibilityState === "hidden"` のあいだは invalidate をスキップしつつ次の schedule は維持。アンマウント時に必ず `clearTimeout`。`useRef` で「in-flight な invalidate」を追跡し、cleanup と並行に走るレースを抑止する（ADR-002 参照）。
  - `/exports` 一覧への戻りリンクを `<Link to="/exports" search={{ offset: 0 }}>` で配置。
- **理由:** 既存 `ExportJobRow` のロジックは一覧用に汎用化されている。詳細用の `useEffect`/poll を一覧側に持ち込まないため、薄い専用コンポーネントを切る。

### 3. RSC ページコンポーネントを追加

- **対象ファイル:** `app/components/export/ExportJobDetail/Page.tsx`（新規）
- **変更内容:**
  `async function ExportJobDetailPage({ jobId }: { jobId: ExportJobId })`。`requireCurrentUser()` → `loadExportJob({ actorUserId: user.id, jobId })` → `<main><h1>エクスポートジョブ詳細</h1><ExportJobDetailView job={job} /></main>` を返す。`ExportJobsList/Page.tsx` と同じ構造。
- **理由:** Page と View の分離。`requireCurrentUser` を含む boundary は RSC 側に閉じる。Prop 型は brand 付きで受け取り、`unknown as ExportJobId` キャストは route の handler 側 1 箇所に閉じる（`notes/$noteId/index.tsx` と同じ流儀）。`loadExportJob` の入力型は `{ actorUserId: UserId; jobId: ExportJobId }` で揃える。

### 4. ルートファイルを追加

- **対象ファイル:** `app/routes/exports/$jobId.tsx`（新規）
- **変更内容:**
  `app/routes/exports/index.tsx` をベースに `createServerFn({ method: "GET" }) + errorResponseMiddleware + validateInput(z.object({ jobId: z.string().min(1) }))` で動的 import → `renderServerComponent(<ExportJobDetailPage jobId={data.jobId as unknown as ExportJobId} />)`。`createFileRoute("/exports/$jobId")({ staleTime: 0, loader: ({ params }) => renderExportJobDetail({ data: { jobId: params.jobId } }), component, errorComponent, notFoundComponent })`。
  - **`errorComponent` の実装方針（重要）:** `sanitizeRouteError(error)` を素のまま `<pre>` に流すと、`assertOwnedBy` が投げる `BusinessRuleError(ExportErrorCode.Unauthorized, "ExportJob {id} is not owned by {userId}")` の生メッセージ（jobId / userId 含む）が画面に露出する情報リークが起きる。代わりに `extractSerializedError(error)` で `SerializedError` を取り出し、`kind === "notFound"` または `kind === "business" && code === ExportErrorCode.Unauthorized` の場合は中立メッセージ「ジョブが見つからないか、アクセス権限がありません。」を出す。それ以外の `kind` は既存パターン同様 `sanitizeRouteError(error)` を使う。
  - `notFoundComponent` は `NotFoundError("EXPORT_JOB_NOT_FOUND")` が `notFound` kind にマップされた場合のフォールバック表示として残す（実際には `errorComponent` が先に拾うが、TanStack Router の `notFound()` 経由を考慮して両方用意）。
  - 副作用 import の保険として `import "@/components/export/ExportForm/action";` を本ファイル冒頭にも追記する（親 `route.tsx` で既に登録されているが、暗黙依存にしないため）。
- **理由:** TanStack Router のファイルベースルート規約 + 既存パターンに完全準拠。`/exports/route.tsx` の `Outlet` 配下に自動配置される。`staleTime: 0` がないと `router.invalidate()` 後でも loader が再走しない（poll が機能しない）ので必須。情報リーク対策は ADR-004 を参照。

### 5. `STATUS_LABEL` を共有

- **対象ファイル:** `app/components/export/ExportJobsList/index.tsx`
- **変更内容:** `const STATUS_LABEL` → `export const STATUS_LABEL` に変更（一行のみ）。詳細ビューが import して再利用。
- **理由:** ラベル定義の重複を防ぎ、状態文言の食い違いを永続的に回避。Issue スコープを膨らませない最小変更。

### 6. `BulkExportDialog` のナビゲート先を切替

- **対象ファイル:** `app/components/note/list/BulkExportDialog.tsx`
- **変更内容:** 70-73 行目を以下に変更:
  ```tsx
  const result = await enqueue({ ... });
  dispatch({ type: "clear" });
  onClose();
  await router.navigate({
    to: "/exports/$jobId",
    params: { jobId: result.jobId },
  });
  ```
  `void result;` 行を削除し、戻り値 `{ jobId }` を直接利用。
- **理由:** Issue 直接要件「起動直後にこの詳細ページへナビゲート」。`bulkExportNotesFn` は既に `{ jobId }` を返しているため、サーバー側変更は不要。

### 7. 一覧から詳細への導線

- **対象ファイル:** `app/components/export/ExportJobsList/index.tsx`
- **変更内容:** `ExportJobRow` 内に `<Link to="/exports/$jobId" params={{ jobId: job.id }}>詳細</Link>` を 1 行追加。
- **理由:** 詳細ページから一覧へ戻る導線（ステップ 2）と対をなす。Bookmarked 詳細 URL 以外でも一覧経由で詳細に到達できるようにする。

## 設計判断

設計判断の詳細は `adr.md` を参照。要点:

- **ADR-001:** ジョブ進行通知は client-side polling を採用、push (SSE / WebSocket) は不採用
- **ADR-002:** Poll は `setTimeout` 自己呼出し再帰で実装（`setInterval` ではない）
- **ADR-003:** `expiresAt` のクライアント判定でダウンロードボタンを抑止
- **ADR-004:** `errorComponent` で `BusinessRuleError(Unauthorized)` の生メッセージ露出を防ぐ

## リスクと注意点

- **ポーリングのライフサイクル漏れ:** `useEffect` cleanup で確実に `clearTimeout`。React Strict Mode の二重 mount に耐えるよう、ローカル `cancelled` フラグ + clear の両方で守る。
- **`getExportJob` の認可:** `ExportJob.assertOwnedBy` が他人のジョブに対し例外を投げる。`errorResponseMiddleware` 経由でシリアライズされ、ルートの `errorComponent` で「アクセス権限なし」相当のメッセージが表示される（情報リーク防止のため「見つかりません」表示で統一）。
- **TanStack Router の `staleTime`:** `staleTime: 0` を必ず設定。これがないと `invalidate()` 後にキャッシュが返り poll が機能しなくなる。
- **`expired` 状態:** `downloadExportArtifact` は `expiresAt <= now` で `BusinessRuleError("export_expired")` を投げる。クライアント側で `canDownload = job.status === "completed" && (job.expiresAt === null || Date.parse(job.expiresAt) > Date.now())` を判定してボタン非表示にし、ユーザに無駄なクリックさせない。
- **enqueue → ナビゲートの race:** `bulkExportNotesFn` は同一トランザクションでジョブ行を永続化してから戻り値を返す（enqueueExportJob は UoW 内で `exportJobRepository.save`）。詳細ページ初回 loader 時点で `pending` 行は確実に見える。

## テスト方針

- **静的検査:** `pnpm typecheck && pnpm lint:fix && pnpm format`
- **手動 E2E:**
  1. ノート 2 件以上を選択 → `BulkExportDialog` → 実行 → `/exports/{jobId}` に遷移
  2. 状態が `pending → processing → completed` と自動更新（3 秒 poll で loader 再実行）
  3. `completed` 時にダウンロードボタンが表示され、押下で R2 presigned URL に遷移
  4. `processing` 中にキャンセルボタンで `cancelled` に遷移し poll が停止
  5. 他人の jobId を URL 直叩きで「ジョブが見つからないか、アクセス権限がありません」と表示され、`assertOwnedBy` の生メッセージ（ユーザID / ジョブID）が露出しない
  6. 存在しない jobId を URL 直叩きで同じ中立メッセージが表示される
  7. ジョブが `failed` 状態のとき `errorReason` と `failedNoteIds` （あれば）が表示される
  8. ジョブが `completed` かつ `expiresAt < now` のときダウンロードボタンが表示されず期限切れメッセージが出る
  9. 詳細ページから一覧への戻りリンクが機能する
  10. 一覧の各行からも詳細へ遷移できる
  11. バックグラウンドタブで poll の `router.invalidate` がスキップされる（DevTools Network）
- **既存 usecase テスト:** `app/core/application/export/__tests__/` 配下に手を入れない（usecase API は変更なし）。

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | ○ (ディレクトリ構成 + 詳細リスク分析) | ○ (Page/View/loader 分離 + 戻り導線) | ○ (`STATUS_LABEL` 共通化を見送る案 → 採否は最小 export 化に着地) |
| 取り込んだ点 | setTimeout 再帰 / visibilityState / expiresAt 判定 / 一覧→詳細リンク | 戻りリンク / `failedNoteIds` 表示 / `artifactSize` 整形 / Page+loader+View 分離 | poll 間隔の妥当性 / 新規 usecase 不要 / 余計なリファクタを足さない原則 |

## レビュー反映

### 修正した点
- **[P-001 / 情報リーク対策]**: `ExportJob.assertOwnedBy` が投げるのは `BusinessRuleError(ExportErrorCode.Unauthorized)` であり、`sanitizeRouteError` 経由だと「ExportJob {id} is not owned by {userId}」という生メッセージ（jobId / userId を含む）が画面に露出する。`errorComponent` で `extractSerializedError` + kind/code 判別を行い、`business` + `Unauthorized` または `notFound` のときは中立メッセージに差し替える方針を明文化（ADR-004）
- **[P-002 / brand 型キャストの位置]**: Page prop の型を `jobId: ExportJobId` に変更し、`as unknown as ExportJobId` キャストは route handler の `<ExportJobDetailPage>` 呼び出し 1 箇所に閉じる（`notes/$noteId/index.tsx` 既存パターンに合わせる）
- **[`failed` 状態の表示確定]**: `failedNoteIds.length > 0` のときは必ず一覧表示。テスト方針にも `failed` 状態の検証を追加
- **[`progress.total === 0` ハンドリング]**: progressbar の `aria-valuemin/max/now` を明示し、`total === 0` のときは progressbar を出さずテキストフォールバック
- **[poll race の防御]**: `useRef` で in-flight な invalidate を追跡するガードを追加
- **[副作用 import の保険]**: `routes/exports/$jobId.tsx` 冒頭にも `import "@/components/export/ExportForm/action";` を追加し、暗黙依存を解消

### 取り込んだ改善提案
- 期限切れ時のテストケース追加（S-002 / Reviewer1）
- `progress.total === 0` ハンドリング（S-003 / Reviewer2）
- 副作用 import の明示（S-001 / Reviewer2）
- ポーリングの race ガード強化（S-002 / Reviewer2）

### 見送った提案とその理由
- **[S-001 / Reviewer1 — 一覧→詳細リンク削除案]**: 詳細ページから一覧への戻りリンク（着地経路）と対をなす導線で、ブックマーク以外で詳細に到達できる経路として最小コストで価値がある。1 行追加のみで `ExportJobsList` テスト境界に影響しないため残す
- **[S-004 / Reviewer2 — 一覧→詳細リンクの a11y 強化]**: Issue スコープ的にはマイナー。最低限 `<Link>` テキストが「詳細」明示で意味は通るため、aria-label 強化は別 Issue に残す
- **[S-005 / Reviewer2 — `bulkExportNotesFn` 戻り値の brand 化]**: 既存 server fn の型変更は Issue スコープを超える。文字列受け取りで動作するため現状維持
- **[ユニットテスト追加 / Agent2 計画案]**: presentation 層の RTL テスト基盤がプロジェクトに整備されていないため、本 Issue では手動 E2E + typecheck で担保。基盤導入は別 Issue で検討
