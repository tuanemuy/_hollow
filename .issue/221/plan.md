# 実装計画 — Issue #221: アップロードのフィードバック改善（進捗表示・楽観的更新・エラー整形）

**Issue:** #221
**作成日:** 2026-05-28
**複雑度:** 中規模（Issue #220 のモーダル基盤の上に乗る追加実装）

---

## 概要

Issue #220 で導入された `UploadDialog`（モーダル+ポーリング）と既存の `SerializedError`/`errorDisplay` 基盤を土台に、(a) 取り込みキュー画面 (`/upload`) を自動更新（ポーリング）に切り替え、(b) `IngestionErrorCode` を `errorDisplay.ts` の business マッピングに集約してユーザー向け文言に整形し、(c) アップロードフィードバックで内部 errorCode を直接表示している箇所を全てラップし、(d) spec/design 配下に「フィードバック仕様」セクションを追記する。スコープを「Issue 完了条件 5 点を満たす最小集合」に絞り、未存在のグローバルトースト基盤導入は推奨案として ADR に残しつつ実装は次 Issue に分離する。

---

## 調査結果

### 関連ファイル

**アップロード UI（既に #220 で実装済み・本 Issue で改修）**
- `app/components/ingestion/UploadDialog.tsx` — モーダル本体。`select / uploading / waiting / editing / failed / multiResult / timedOut` のステートマシン。`POLL_INTERVAL_MS=1800ms`, `POLL_TIMEOUT_MS=180s`。`FailedView` で `{job.errorCode}` を生表示している（L497）。
- `app/components/ingestion/UploadDialogMount.tsx` — hash↔ダイアログのブリッジ。pathname が `/upload` のときは抑止。
- `app/components/ingestion/UploadButton.tsx` — `<Link to="." hash="upload">` で hash を切り替える。
- `app/components/ingestion/UploadForm.tsx` — `/upload` ページ用の単機能ドロップゾーン。`useTransition` でローディング、`router.invalidate()` で局所更新。エラーは `displayError(error)` で文言化済み。
- `app/components/ingestion/IngestionJobRow.tsx` — キューカード。`statusLabel` で pending/processing/previewing/saved/failed/discarded をローカライズ。**ただし `{job.errorCode}` を L138 で生表示**。
- `app/components/ingestion/UploadPage.tsx` — `/upload` ページ。`loadIngestionJobs` を await して `IngestionJobRow` をレンダー。自動更新なし（リロード必須）。
- `app/components/ingestion/loaders.ts` — `loadIngestionJobs` を `serverData` でラップして `cache()` する loader。
- `app/components/ingestion/actions.ts` — `uploadFileFn`, `getIngestionJobFn`, `commitIngestionPreviewFn`, `discardIngestionPreviewFn`, `regenerateIngestionPreviewFn` を `createServerFn` で公開。`errorResponseMiddleware` 経由。
- `app/components/ingestion/wire.ts` — `IngestionJobWire` 型と `toIngestionJobWire`。`errorReason` は意図的に wire から除外済み（`#255` ADR-001）。
- `app/components/ingestion/IngestionPreviewForm.tsx` — プレビュー編集フォーム。本 Issue ではエラー表示が `displayError` 経由か確認のみ。

**presentation 層**
- `app/core/presentation/errorDisplay.ts` — `renderErrorMessage(SerializedError)` が `kind` をユーザー向け文言にマップ。`renderBusinessMessage` で `code` をスイッチ（現在は `FRONT_MATTER_JSON_INVALID` のみ）。`displayError(unknown)` と `sanitizeRouteError(unknown)` を export。
- `app/core/presentation/errorResponse.ts` — `SerializedError` union、`redactForClient`（system/unknown の code/message をクライアントに渡さず公開メッセージに差し替え）、`extractSerializedError`、HTTP status マップ。**`redactForClient` は既に system/unknown を遮蔽している**ので、business / validation 等の `code` 値がそのまま UI に出る箇所（後述）こそが本 Issue の主戦場。
- `app/core/presentation/errorResponseMiddleware.ts` — server-fn 境界で `serializeError` → `redactForClient` を実行。

**ドメイン**
- `app/core/domain/ingestion/errorCode.ts` — `IngestionErrorCode` 列挙（`unsupported_format`, `daily_upload_quota_exceeded`, `regeneration_limit_exceeded`, `ingestion_byte_size_exceeds_limit`, `invalid_status_for_commit`, `invalid_status_for_discard`, …）。これらが `BusinessRuleError(code)` として throw され、`SerializedBusinessError.code` に乗ってクライアントへ届く。
- `app/core/domain/note/errorCode.ts` 等 — 他ドメインの business エラーコード（影響範囲外、参照のみ）。

**ヘッダー／レイアウト**
- `app/components/layout/AppShell.tsx` — `Header` + `Sidebar` + `UploadDialogMount`。RSC manifest 登録もここに集約済み。
- `app/components/layout/Header.tsx` — 右上に「新規作成」「アップロード」ボタン。バッジ用スロットは未設置。
- `app/components/layout/styles.ts` — `PILL_BTN`, `CHIP_*`, `FORM_ERROR`, `EMPTY_STATE` 等のスタイル定数。
- `app/components/note/editor/AutosaveIndicator.tsx` — `kind` ベースの `aria-live` インジケータの参考実装。

**spec / design**
- `spec/pages/index.md` L168–185 — P13 アップロード画面定義（モーダル動線、推論待ち、複数ファイル、フォールバック）。
- `spec/design/index.md` L62–69 — インタラクション原則（スケルトン優先、`prefers-reduced-motion`、フォーカス）。
- `spec/design/pages/P13-upload-modal.html`, `P13a-upload-modal.html`, `P13-upload.html` — モック。本 Issue では文言調整のみ。

### あるべきアーキテクチャ

`CLAUDE.md` と `errorResponse.ts` の JSDoc から読み取れる方針:

1. **エラーは構造的にシリアライズし、`kind`-tagged union を presentation 層で「表示用文言」にマップする**。
   - presentation 層は `instanceof` を使わず、`kind` のみで分岐する。
   - 内部 `code` / `message` は server-side のログ用、UI 用文言は `errorDisplay.ts` に集約。
   - 既に `system` / `unknown` は `redactForClient` で遮蔽済み。
   - **business / conflict の `code` 値は意図的に保持される**（UI で文言化するため）。よって `errorDisplay.ts` 側で `IngestionErrorCode` を網羅的に扱う必要がある。
2. **client mutation は React 19 primitives を直接使う**（`useTransition`、`useOptimistic`）。カスタムラッパーは作らない。
3. **transport boundary の入力検証は 2 箇所のみ**（route の `validateSearch` / `inputValidator`、値オブジェクト構築）。serverData は内部限定でスキーマレス。
4. **デザインはユーティリティクラス直書き**、状態は `data-*` 属性、トークンは `tokens.css` 経由のみ。
5. **インタラクション原則**: スピナーよりスケルトン、`aria-live="polite"` で状態変化を伝える、`prefers-reduced-motion: reduce` 対応、トランジションは `--duration-fast`（120ms）。
6. **トースト / 通知の常設インフラは現状未導入**。`aria-live` 領域をコンポーネント内に局所配置するパターン（`AutosaveIndicator.tsx`、`UploadDialog` の Skeleton 等）が標準。

### 既存実装の状態（あるべき姿との照合）

| 項目 | 既存実装 | 評価 | 本 Issue での扱い |
|---|---|---|---|
| アップロードボタン → 即時 loading | `UploadForm` は `useTransition` で disabled。`UploadDialog` はビュー遷移 (`select`→`uploading`) で SkeletonBlock + `aria-live`。 | ✅ あるべき姿と一致 | 維持。`UploadButton` 側にも視覚的フィードバックを追加するか検討（後述） |
| 受付完了の通知 | `UploadDialog.MultiResultView` がモーダル内に集計表示。単一ファイルは `editing` 遷移で暗黙的に伝える。**モーダル外には通知なし**（`Header` の `UploadButton` から開いた場合、閉じた後に「進んでる」感は出ない）。 | ⚠️ 部分一致 | 推奨案: ヘッダーに「バックグラウンド処理バッジ」を常設（後述 ADR-001）。実装スコープに含めるか判断ポイント |
| 楽観的更新（フルリロード回避） | `UploadDialog`/`UploadForm`/`IngestionJobRow` 全て `router.invalidate()`。フルページリロードは発生しない。 | ✅ 一致 | 維持。ただし `/upload` ページの「進行中ジョブ」は手動 invalidate のみ（自動更新なし）→ ポーリング追加 |
| ステータス/進捗の可視化 | `IngestionJobRow.statusLabel` で文言化、`CHIP_*` で色分け。**残数・推定残り時間はなし**。 | ⚠️ 一部不足 | 件数表示（pending/processing/failed の合計バッジ）を `/upload` ヘッダーに追加。推定残り時間は LLM 推論の性質上見送り（ADR-002） |
| `SerializedError.kind` → ユーザー文言 | `errorDisplay.ts` で `kind` を網羅。`business.code` は `FRONT_MATTER_JSON_INVALID` のみマップ。**`IngestionErrorCode` 全部が未マップ → fallback の `error.message`（spec 文言の英語コード）が出る**。 | ❌ 乖離 | `errorDisplay.ts` に `IngestionErrorCode` 用のマッパーを追加し、`renderBusinessMessage` を拡張 |
| 内部 errorCode / stack の露出 | `IngestionJobRow.tsx` L138 / `UploadDialog.FailedView` L497 で `{job.errorCode}` を生表示。`errorReason` は wire から除外済み (`#255` ADR-001)。stack は `AppServerError` で削除済み (`errorResponse.ts` L126)。 | ❌ 乖離（`errorCode` 生表示） | `displayJobErrorCode(errorCode: string \| null): string` を `errorDisplay.ts` に追加し、両箇所で経由 |
| リアルタイム更新（SSE/WebSocket） | `UploadDialog` 内ポーリング（1.8s 間隔、180s タイムアウト）のみ。`/upload` ページは静的。 | ⚠️ ポーリング片側のみ | `/upload` ページにも client polling 層を追加（ADR-003） |
| spec / design への反映 | P13 節は #220 で更新済み。**フィードバック仕様（エラーマッピング表、ポーリング間隔、`aria-live` ポリシー）は未記述**。 | ❌ 乖離 | `spec/pages/index.md` P13 節に追記、`spec/design/index.md` に「11. フィードバック原則」セクションを追加 |

### 依存関係

- **`errorDisplay.ts`** を拡張するため、`IngestionErrorCode` をどう import するか方針確認（presentation → domain への import は `redirect` / `notFound` を例外として現状は型のみ参照のパターンが妥当）。
- **`/upload` ページの自動更新** には、現状の `UploadPage`（async server component）を「初期データ + クライアント側ポーリング差分マージ」構造に切り替える必要があり、`UploadQueue.tsx`（client component）を新規追加して RSC から initial data を渡す。`loadIngestionJobs` は loader 経由で初期描画に使い、その後は `getIngestionJobsFn`（既存 server-fn を新規追加）でポーリング。
- **`getIngestionJobsFn`** が現状 actions.ts に未公開なため追加が必要。
- **`UploadDialog` の `FailedView`** と **`IngestionJobRow`** で同じエラーコード→文言変換ロジックを使うため、共有ヘルパ化が必須。
- 既存テスト `UploadDialog.test.tsx` は state-machine テスト中心なので、エラー文言の差し替えはテキスト assertion 1–2 箇所の更新で済む見込み。

---

## 実装ステップ

### Step 1: presentation 層に `IngestionErrorCode` ベースのエラーマッパーを追加

**対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow2/app/core/presentation/errorDisplay.ts`

**変更内容:**

`renderBusinessMessage` の switch を拡張し、UI に届きうるコードに対するユーザー向け文言を追加。さらに「job.errorCode フィールド単独」（job ステートに固有のエラー文字列、`SerializedError.kind` を持たない）を文言化する純粋関数を export する。

**マッピング基準（明文化）:**

UI に届きうるコードを以下の 2 グループに分類してマッピングする。

- **(a) usecase が `BusinessRuleError(code)` で throw する `IngestionErrorCode` 列挙値**: `unsupported_format` / `daily_upload_quota_exceeded` / `regeneration_limit_exceeded` / `ingestion_byte_size_exceeds_limit` / `invalid_status_for_commit` / `invalid_status_for_discard` / `invalid_status_for_regeneration` / `ingestion_invalid_state_for_retry` / `ingestion_invalid_state_for_attach_preview` / `ingestion_invalid_state_for_start` / `ingestion_no_temp_storage_for_retry` / `ingestion_invalid_mime_type` / `ingestion_invalid_file_name` / `ingestion_invalid_byte_size` / `ingestion_missing_saved_note_id` 等。これらは **必ず日本語マッピングを持つ**。
- **(b) `runIngestionJob.ts` の `classifyPipelineError` が `job.errorCode` に書き込む pipeline 識別子**（`IngestionErrorCode` 列挙には含まれない別系統のコード値）: `llm_failure` / `ocr_failure` / `speech_failure` / `pdf_parse_failure` / `office_parse_failure` / `ingestion.invalid_state` / `ingestion.temp_storage` / `ingestion.unknown`。実運用で `failed` 状態のジョブが持つ errorCode の大半を占めるため、**必ず日本語マッピングを持つ**。
- **(c) value-object 構築時エラー**（`InvalidId` 等、本来 UI に届かない構築失敗系）: `redactForClient` / バリデーション境界で遮断される前提で、マッピング無しの fallback 許容（`displayJobErrorCode` の汎用文言に落ちる）。

```ts
// 既存の他ドメインコードと衝突しないよう、ingestion 系コードは文字列定数で網羅する。
// IngestionErrorCode の `lower_snake_case` 値 + pipeline 識別子（`ingestion.*` / `*_failure`）の 2 グループ。

function renderIngestionBusinessMessage(code: string, fallback: string): string | null {
  switch (code) {
    // ---- (a) IngestionErrorCode 列挙値（usecase が BusinessRuleError(code) で throw） ----
    case "unsupported_format":
      return "このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください";
    case "ingestion_byte_size_exceeds_limit":
      return "ファイルサイズが上限を超えています。サイズを下げて再度お試しください";
    case "daily_upload_quota_exceeded":
      return "本日のアップロード上限に達しました。明日以降に再度お試しください";
    case "regeneration_limit_exceeded":
      return "再生成の回数上限に達しました。一度破棄して再アップロードしてください";
    case "invalid_status_for_commit":
    case "invalid_status_for_discard":
    case "invalid_status_for_regeneration":
    case "ingestion_invalid_state_for_retry":
    case "ingestion_invalid_state_for_attach_preview":
    case "ingestion_invalid_state_for_start":
      return "ジョブの状態が変わっています。画面を更新してから操作してください";
    case "ingestion_no_temp_storage_for_retry":
      return "再試行に必要なデータが見つかりません。再度アップロードしてください";
    case "ingestion_invalid_mime_type":
    case "ingestion_invalid_file_name":
    case "ingestion_invalid_byte_size":
      return "ファイルが正しく読み取れませんでした。別のファイルでお試しください";
    case "ingestion_missing_saved_note_id":
      return "保存処理が完了していません。しばらくしてから再度お試しください";
    // ---- (b) pipeline 識別子（runIngestionJob.ts の classifyPipelineError 由来） ----
    case "llm_failure":
      return "AIによる要約・構造化に失敗しました。しばらくしてから再生成をお試しください";
    case "ocr_failure":
      return "画像からの文字認識に失敗しました。別のファイルでお試しください";
    case "speech_failure":
      return "音声の文字起こしに失敗しました。別のファイルでお試しください";
    case "pdf_parse_failure":
      return "PDFを解析できませんでした。ファイルが破損していないかご確認ください";
    case "office_parse_failure":
      return "Officeファイルを解析できませんでした。ファイルが破損していないかご確認ください";
    case "ingestion.invalid_state":
      return "ジョブの状態が変わっています。画面を更新してからお試しください";
    case "ingestion.temp_storage":
      return "ファイルの一時保管に失敗しました。再アップロードをお試しください";
    case "ingestion.unknown":
      return "取り込み処理で予期しないエラーが発生しました。時間をおいて再度お試しください";
    default:
      return null;
  }
}

function renderBusinessMessage(code: string | null, fallback: string): string {
  if (code === null) return fallback;
  switch (code) {
    case "FRONT_MATTER_JSON_INVALID":
      return "FrontMatter の JSON が不正です。形式を確認してください";
  }
  const ingestionMessage = renderIngestionBusinessMessage(code, fallback);
  if (ingestionMessage !== null) return ingestionMessage;
  return fallback;
}

/**
 * Maps an `IngestionJobWire.errorCode` (raw business code or pipeline
 * identifier stored on a failed job row) to a user-facing message.
 * Returns `null` for `null` input so callers can suppress the UI
 * affordance when no error is attached. Falls back to a neutral retry
 * message when the code is unknown — internal codes never leak to the
 * user.
 */
export function displayJobErrorCode(code: string | null): string | null {
  if (code === null) return null;
  const mapped = renderIngestionBusinessMessage(code, "");
  if (mapped !== null && mapped.length > 0) return mapped;
  return "取り込みに失敗しました。時間をおいて再度お試しください";
}
```

**理由:**
- Issue 完了条件「エラー表示が `SerializedError.kind` に応じたユーザー向け文言になる」「内部のスタック／原文 message がユーザー画面に露出しない」を満たすため、business `code` と pipeline 識別子のマッピングテーブルを集約。
- `IngestionErrorCode` を直接 import する案も検討したが、presentation 層は **構造的に kind ベースで分岐** する原則（CLAUDE.md / `errorResponse.ts` JSDoc）なので、ドメイン定数への型依存はあえて持たず文字列リテラルで分岐する。コード値は `lower_snake_case` で固定（`*ErrorCode` 命名規約による）。代わりに同じ文字列をテストで網羅する（Step 9）。
- pipeline 識別子（`llm_failure` 等）は `IngestionErrorCode` 列挙には含まれないが、`classifyPipelineError`（`runIngestionJob.ts` L319-329）が `job.errorCode` に書き込む値であり、実運用で `failed` 状態のジョブの errorCode の大半を占める。これを fallback に落とさず、専用マッピングで「何が失敗したか」をユーザーに伝える。
- `displayJobErrorCode` は `SerializedError` を経由しないジョブ固有のエラー文字列（永続化された `job.errorCode`）用のヘルパ。`renderBusinessMessage` と内部マッパーを共有することで二重メンテを防ぐ。
- fallback 文言は「取り込みに失敗しました。時間をおいて再度お試しください」とし、既存 `errorDisplay.ts` の他文言（「システムエラーが発生しました」「他の操作と競合しました」）と質感を揃える。「管理者にお問い合わせください」は本プロジェクトの運用実態に合わないため不採用。

### Step 2: `IngestionJobRow` の生 errorCode 表示を `displayJobErrorCode` 経由に差し替え

**対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/IngestionJobRow.tsx`

**変更内容:**

```tsx
// import { displayError } from "@/core/presentation/errorDisplay";
import { displayError, displayJobErrorCode } from "@/core/presentation/errorDisplay";

// L136-140 を以下に差し替え:
{(() => {
  const msg = displayJobErrorCode(job.errorCode);
  return msg !== null ? (
    <p className={FORM_ERROR} role="alert">{msg}</p>
  ) : null;
})()}
```

**理由:** Issue 完了条件「内部のスタック／原文 message がユーザー画面に露出しない」。`unsupported_format` 等の生コードが UI に直接出るのを止める。

### Step 3: `UploadDialog.FailedView` の生 errorCode 表示を `displayJobErrorCode` 経由に差し替え

**対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/UploadDialog.tsx`

**変更内容:** L497 の `{job.errorCode}` 生表示を `displayJobErrorCode(job.errorCode)` 経由に変更（Step 2 と同様、`null` 時はブロックを描画しない）。`import` 文に `displayJobErrorCode` を追加。さらに `<p>` に `role="alert"` を付与し、`IngestionJobRow` 側の表示と一貫させる（S-1）。

```tsx
{(() => {
  const msg = displayJobErrorCode(job.errorCode);
  return msg !== null ? (
    <p className="text-sm text-ink-secondary mb-4" role="alert">{msg}</p>
  ) : null;
})()}
```

**理由:** 同上。モーダル `FailedView` でも生コード露出を防ぐ。アクセシビリティについては、失敗状態の文言は支援技術にも明示する必要があるため `role="alert"` で `IngestionJobRow` と質感を揃える。

### Step 4: `/upload` キュー画面に client polling を導入

**対象ファイル:**
- `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/actions.ts`（既存に追記）
- `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/IngestionQueue.tsx`（新規）
- `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/UploadPage.tsx`（差し替え）

**変更内容:**

#### 4-1. `actions.ts` に `getIngestionJobsFn` を追加

**前提確認（判断ポイント）**: `getIngestionJobs` usecase（`app/core/application/ingestion/getIngestionJobs.ts`）が既存であることを確認済み（`GetIngestionJobsInput` / `GetIngestionJobsOutput` を export、`actorUserId` / `limit` / `offset` / `status` / `includeDiscarded` を受ける）。本 Issue では既存 usecase をそのまま再利用して serverFn を新規追加する方針で進める。仮に未存在だったとしても (a) 既存 `loadIngestionJobs`（loader 経由）の serverFn 化で代替、(b) usecase 新規追加、のいずれかを判断する必要がある旨を明記しておく（今回は (a)/(b) どちらも不要、既存 usecase を `createServerFn` でラップするのみ）。

```ts
import { z } from "zod";
import { uuidString } from "@/core/domain/identity/valueObject";

export const getIngestionJobsFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        limit: z.number().int().positive().max(200).optional(),
      }),
    ),
  )
  .handler(async ({ data }): Promise<{ jobs: readonly IngestionJobWire[] }> => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/getIngestionJobs"),
    );
    const result = await module.getIngestionJobs({
      container,
      input: {
        actorUserId: toDtoUserId(user.id),
        limit: data.limit ?? 50,
      },
    });
    return { jobs: result.jobs.map(toIngestionJobWire) };
  });
```

#### 4-2. `IngestionQueue.tsx`（新規・client component）

**設計ポイント:**

- **依存配列に `activeCount` を入れない**（依存配列バグ回避）。`jobs` 状態変化のたびに effect が cleanup → 再実行される無限ループを避けるため、`jobsRef.current = jobs` を毎レンダーで更新し、`tick` 内で `jobsRef.current` から activeCount を算出する。`useEffect` の依存は `[fetchJobs]` のみ。
- **fatal 検出後のポーリング停止保証**: `unauthorized` / `forbidden` / `notFound` を踏んだら `fatalRef.current = true` を立て、effect 冒頭で fatal なら return。timerRef を必ず clear する。これにより effect の再実行で polling が復活しない。
- **`visibilitychange` 対応**（S-2、後付け忘れ防止のため本 Issue で同時導入）: `document.visibilityState === "hidden"` のときは tick をスキップして再スケジュール、`visibilitychange` イベントで `visible` に戻った瞬間に即時 tick する。
- **`extractSerializedError` 利用意図**: `fatal kind` を判定するためだけに使う。エラー表示自体は `displayError(e)` で行う（S-4）。
- **変数名**: 取得結果と次回間隔を別名にする（`{ jobs: nextJobs }` と `nextInterval`）。

```tsx
"use client";

import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import { EMPTY_STATE, FORM_ERROR } from "../layout/styles";
import { getIngestionJobsFn, type IngestionJobWire } from "./actions";
import { IngestionJobRow } from "./IngestionJobRow";

const POLL_INTERVAL_MS = 4000; // /upload 画面用は dialog より緩め
const POLL_BACKOFF_MS = 12000; // 連続失敗時はバックオフ
const POLL_IDLE_MS = 16000; // active job がない時の長間隔
const ACTIVE_STATUSES: ReadonlySet<IngestionJobWire["status"]> = new Set([
  "pending",
  "processing",
]);

type Props = {
  initialJobs: readonly IngestionJobWire[];
};

export function IngestionQueue({ initialJobs }: Props) {
  const fetchJobs = useServerFn(getIngestionJobsFn);
  const [jobs, setJobs] = useState<readonly IngestionJobWire[]>(initialJobs);
  const [pollErrorMessage, setPollErrorMessage] = useState<string | null>(null);

  // 最新の jobs を ref に保持（依存配列に activeCount を入れず、tick 内で参照する）
  const jobsRef = useRef<readonly IngestionJobWire[]>(initialJobs);
  jobsRef.current = jobs;

  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const fatalRef = useRef(false);

  useEffect(() => {
    if (fatalRef.current) return; // fatal を踏んだ後は再実行されてもポーリングしない
    cancelledRef.current = false;

    const computeInterval = () => {
      const activeCount = jobsRef.current.filter((j) =>
        ACTIVE_STATUSES.has(j.status),
      ).length;
      if (activeCount > 0) {
        return failuresRef.current > 0 ? POLL_BACKOFF_MS : POLL_INTERVAL_MS;
      }
      return POLL_IDLE_MS;
    };

    const schedule = (delayMs: number) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, delayMs);
    };

    const tick = async () => {
      if (cancelledRef.current || fatalRef.current) return;
      // タブ非表示なら次回まで遅延（負荷軽減）
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(POLL_IDLE_MS);
        return;
      }
      try {
        const { jobs: nextJobs } = await fetchJobs({ data: { limit: 50 } });
        if (cancelledRef.current || fatalRef.current) return;
        setJobs(nextJobs);
        setPollErrorMessage(null);
        failuresRef.current = 0;
      } catch (e) {
        if (cancelledRef.current || fatalRef.current) return;
        // extractSerializedError は fatal kind 判定のためにのみ使う。
        // 表示用文言は displayError(e) を使う。
        const err = extractSerializedError(e);
        if (
          err.kind === "unauthorized" ||
          err.kind === "forbidden" ||
          err.kind === "notFound"
        ) {
          fatalRef.current = true;
          setPollErrorMessage(displayError(e));
          if (timerRef.current !== null) clearTimeout(timerRef.current);
          return;
        }
        failuresRef.current += 1;
        if (failuresRef.current >= 3) setPollErrorMessage(displayError(e));
      }
      if (cancelledRef.current || fatalRef.current) return;
      schedule(computeInterval());
    };

    const onVisibility = () => {
      if (cancelledRef.current || fatalRef.current) return;
      if (document.visibilityState === "visible") {
        // 即時 tick（直前のタイマーは clear して再スケジュール）
        schedule(0);
      }
    };

    schedule(POLL_INTERVAL_MS);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelledRef.current = true;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [fetchJobs]);

  // pollErrorMessage は jobs の有無に関わらず常に表示する位置（一覧の上）に出す。
  // jobs.length === 0 の early return ブランチでも pollErrorMessage が見えるよう
  // 単一の return 構造に統一し、empty state と一覧を切り替える形にする。
  return (
    <>
      {pollErrorMessage !== null ? (
        <p className={FORM_ERROR} role="status" aria-live="polite">
          進捗の自動更新に失敗しました: {pollErrorMessage}
        </p>
      ) : null}
      {jobs.length === 0 ? (
        <div className={EMPTY_STATE}>
          <h2 className="text-xl font-medium text-ink mb-2">まだジョブがありません</h2>
          <p className="text-sm">ファイルをアップロードすると、ここに進行状況が表示されます。</p>
        </div>
      ) : (
        <div aria-live="polite">
          {jobs.map((job) => (
            <IngestionJobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </>
  );
}
```

**表示構造の方針**: `pollErrorMessage` は jobs の有無に関わらず常に表示する位置（一覧の上）に出す。空状態の表示中もポーリング失敗が発生する以上、ユーザーには伝える必要がある。

#### 4-3. `UploadPage.tsx` を初期データ受け渡し型に変更

```tsx
import type { UserDTO } from "@/core/application/dto/identity";
import { EMPTY_STATE, PAGE_SUBTITLE, PAGE_TITLE } from "../layout/styles";
import { IngestionQueue } from "./IngestionQueue";
import { loadIngestionJobs } from "./loaders";
import { UploadForm } from "./UploadForm";

type Props = { user: UserDTO };

export async function UploadPage({ user }: Props) {
  const { jobs } = await loadIngestionJobs(user.id);
  return (
    <>
      <h1 className={PAGE_TITLE}>アップロード</h1>
      <p className={PAGE_SUBTITLE}>
        裏で進行中・失敗・プレビュー保留のアップロードを管理する画面です。
        新規取り込みはヘッダーの「アップロード」ボタンから開くモーダルで完結します。
      </p>
      <UploadForm />
      <section className="mt-12">
        <h2 className="text-xl font-semibold mb-4">取り込みキュー</h2>
        <IngestionQueue initialJobs={jobs} />
      </section>
    </>
  );
}
```

**理由:**
- Issue 完了条件「取り込みキューの各アイテムのステータス・進捗が見える」「アップロード完了後にフルリロードが発生しない（局所更新）」をキュー画面側でも満たす。
- 既存 `UploadDialog` のポーリング設計と整合（fatal kind 判定、cancelled ref、useEffect 内 timer ref パターン）。本実装ではより緩い間隔（4s）でサーバー負荷を抑え、active job がない時はさらに伸ばす。
- バックオフと連続失敗カウンタで一時的なネットワーク不調を吸収。3 回連続失敗で UI に通知。

### Step 5: `UploadForm.tsx` のエラー文言が `displayError` 経由であることを確認（コード変更なし）

**対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/UploadForm.tsx`

**変更内容:** 既に `displayError(error)` 経由なので **動作確認のみ・コード変更なし**（コメント追加もしない。CLAUDE.md の no-comments 原則と衝突するため）。Step 1 のマッパー拡張により、業務エラーの code が `errorDisplay.ts` の新マッピングで自動的に文言化される。動作検証は Step 9 のテストで `unsupported_format` を `UploadForm` の error path に流すケースを追加して assert する。

**理由:** 既存実装があるべき姿と一致しているため触らない。Step 1 のマッパー拡張により、自動的に「対応外形式」「上限超過」等の文言が出るようになる。

### Step 6: ヘッダー／グローバルなバックグラウンド処理インジケータの扱い

**対象ファイル:** （実装しない／後続 Issue 推奨）

**変更内容:** 本 Issue のスコープでは **実装しない**。理由は ADR-001 参照（既存ヘッダーレイアウト改修は #217 の領域、また active job 件数を取るための SSR 経路が現状の `Header.tsx`（同期 props ベース）には収まりにくい）。代わりに `/upload` ページの「取り込みキュー」セクション内に active 件数の小さなインジケータを置く（IngestionQueue 内で完結）。

**理由:** Issue 要件の「フィードバックが途切れない」は (a) モーダル内の即時 feedback、(b) `/upload` ページの自動更新、(c) アップロード完了時の `multiResult` メッセージ、で達成可能。グローバルバッジは UX 向上策として有用だが Header の状態管理基盤（async server component とクライアント polling のブリッジ）を新設するコストが高く、本 Issue スコープを越える。

### Step 7: spec/pages/index.md の P13 節にフィードバック仕様を追記

**対象ファイル:** `/Users/hikaru/github.com/tuanemuy/hollow2/spec/pages/index.md`

**変更内容:** P13 節（L168 周辺）の「機能」リストに以下を追記:

```md
- フィードバックポリシー（#221）:
  - アップロード操作直後にモーダル内でローディング状態（skeleton + `aria-live="polite"`）を提示し、推論完了までフィードバックを途切れさせない
  - `/upload` 取り込みキュー画面は client polling（active job がある間は 4 秒間隔、無い間は 16 秒間隔）で自動更新し、フルリロードを要求しない
  - すべての完了・失敗・対応外通知は `aria-live="polite"` 領域でスクリーンリーダーに伝える
  - サーバーから返る `BusinessRuleError.code`（`unsupported_format` / `daily_upload_quota_exceeded` / `regeneration_limit_exceeded` 等）は `app/core/presentation/errorDisplay.ts` のマッピングテーブルを経由してユーザー向け文言に変換する
  - 内部の stack / 原文 message / 内部 errorCode は UI には出さない（`redactForClient` と `displayJobErrorCode` の二重防御）
```

**理由:** Issue 完了条件「spec/design 配下のドキュメントに新しいフィードバック仕様を反映」。

### Step 8: spec/design/index.md にフィードバック原則を追加 / spec/scenario/ingest.md と spec/manual-tests/ingest.md の文言整合

**対象ファイル:**
- `/Users/hikaru/github.com/tuanemuy/hollow2/spec/design/index.md`
- `/Users/hikaru/github.com/tuanemuy/hollow2/spec/scenario/ingest.md`（L69 付近、S-3）
- `/Users/hikaru/github.com/tuanemuy/hollow2/spec/manual-tests/ingest.md`（同視点で見直し、S-3）

**追加の整合タスク（S-3）:**
- `spec/scenario/ingest.md` L69 付近の「FRONT_MATTER_JSON_INVALID をエラーメッセージに表示」記述は、ユーザー向け文言に整形する原則（presentation 層の `errorDisplay.ts` で文言化）に沿った形に書き換える（例: 「FrontMatter の JSON が不正です。形式を確認してください」のようなユーザー向け文言で表示）。内部 code を spec に直書きするのは矛盾する。
- `spec/manual-tests/ingest.md` も「生 errorCode を期待値にしている箇所」がないか確認し、ユーザー向け文言ベースに更新。

**変更内容:** L141 の「10. スコープ外」直前に「10b. フィードバック・エラー表示原則」を新設:

```md
## 10b. フィードバック・エラー表示原則（#221）

- **インタラクションの即時 feedback**: 非同期処理を伴うボタンは押下直後に disabled + ローディング状態を出す。スケルトンを優先し、スピナーは避ける。
- **バックグラウンド進捗**: 取り込み・エクスポート等のジョブは client polling で進捗を可視化する。間隔は active job がある間は 1.5〜4 秒、無い間は 16 秒以上に伸ばす（負荷とフレッシュ感のバランス）。
- **`aria-live`**: 状態遷移・完了・失敗の通知は `aria-live="polite"`（通常）／`assertive`（エラーで即時通知が必要な場合のみ）を使う。
- **エラー文言**:
  - サーバーからは `SerializedError`（`kind`-tagged union + `code`）が届く。UI 側は **`app/core/presentation/errorDisplay.ts`** のマッピングを単一の真実とし、`displayError(error)` / `displayJobErrorCode(code)` 経由でのみ文言化する。
  - 文言は「何が起きたか + 何をすればいいか」の 2 部構成。例: 「このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください」。
  - 内部 stack / 原文 message / 内部 errorCode は **絶対に UI に出さない**（presentation 層の `redactForClient` で system/unknown を遮蔽、business code はマッピングテーブル経由のみ）。
- **トースト基盤**: 現状はコンポーネント内 `aria-live` 領域で局所通知する。グローバルトーストはフォローアップ課題として保留。
```

**理由:** プロジェクト全体のフィードバック方針を spec に固定し、今後の他 Issue にも同じ原則が適用されるようにする。

### Step 9: テスト追加・更新

**対象ファイル:**
- `/Users/hikaru/github.com/tuanemuy/hollow2/app/core/presentation/__tests__/errorDisplay.test.ts`（新規 or 既存に追記）
- `/Users/hikaru/github.com/tuanemuy/hollow2/app/components/ingestion/__tests__/UploadDialog.test.tsx`（既存 assertion 更新）

**変更内容:**
- `errorDisplay.test.ts`:
  - **テスト実装方針（重要）**: `Object.values(IngestionErrorCode).forEach` で「全列挙値に対して明示マッピング必須」を assert すると、(c) value-object 構築時エラー系のコード（`InvalidId` 由来の `ingestion_invalid_id` 等）も列挙値に含まれてしまい、それらは fallback 許容のため fail する。よって **(a) / (b) / (c) を別配列で列挙して別々に assert する** 方針とする:
    - **(a) 明示マッピング必須グループ（Step 1 マッピング表に列挙された IngestionErrorCode 列挙値）**: `["unsupported_format", "ingestion_byte_size_exceeds_limit", "daily_upload_quota_exceeded", "regeneration_limit_exceeded", "invalid_status_for_commit", "invalid_status_for_discard", "invalid_status_for_regeneration", "ingestion_invalid_state_for_retry", "ingestion_invalid_state_for_attach_preview", "ingestion_invalid_state_for_start", "ingestion_no_temp_storage_for_retry", "ingestion_invalid_mime_type", "ingestion_invalid_file_name", "ingestion_invalid_byte_size", "ingestion_missing_saved_note_id"]` を配列で列挙。各値を `displayJobErrorCode` に渡し、`null` でも fallback 文言でもない明示日本語マッピングを返すかを検証。
    - **(b) pipeline 識別子グループ**: `["llm_failure", "ocr_failure", "speech_failure", "pdf_parse_failure", "office_parse_failure", "ingestion.invalid_state", "ingestion.temp_storage", "ingestion.unknown"]` を配列で列挙し、それぞれ明示マッピングが返ることを検証。
    - **(c) fallback 許容グループ（value-object 構築時エラー等、Step 1 マッピング表に列挙されない `IngestionErrorCode` 列挙値）**: `Object.values(IngestionErrorCode)` から (a) 配列に含まれないものを差分抽出して列挙、`displayJobErrorCode` が fallback 文言「取り込みに失敗しました。時間をおいて再度お試しください」を返すことを確認（UI に届かない前提だが最終防衛線）。
  - `renderErrorMessage({ kind: "business", code, message: code })` についても (a)/(b) のコードに対しては内部 code 文字列が出力に含まれないことを assert。
  - `displayJobErrorCode(null)` が `null` を返す。
  - `displayJobErrorCode("__unknown_code__")` が fallback 日本語文言を返す（内部 code を含まない）。
  - **実 throw 元の grep 確認手順を明記**: `grep -rn "BusinessRuleError(IngestionErrorCode" app/core/application/ingestion/` と `grep -n "markFailedSafely\|classifyPipelineError" app/core/application/ingestion/runIngestionJob.ts` を実行し、検出されたコードがマッピング表 (a)/(b) に含まれているかを目視確認するチェック手順をテストコメントまたは plan の手動チェック節に記載。
- `UploadDialog.test.tsx`: `failed` 遷移時の assertion で `job.errorCode` の生表示を期待している箇所があれば、`displayJobErrorCode` 経由の文言に修正。
- **`UploadForm` error path（S-5）**: `unsupported_format` を `UploadForm` のエラー表示パス（`uploadFileFn` のモックが reject、`displayError` 経由で表示）に流すケースを 1 件追加し、UI に「このファイル形式には対応していません…」のユーザー向け文言が出ること、生 code 文字列が表示されないことを assert。

**理由:** Issue 完了条件「内部のスタック／原文 message がユーザー画面に露出しないことを確認」を自動テストでガード。(a)/(b) を別グループで網羅検証することで、将来 `IngestionErrorCode` を追加した時もテストが自動的にカバレッジ漏れを検出する。

### Step 10: 型チェック・lint・format

**対象ファイル:** （全変更ファイル）

**コマンド:**
```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

**理由:** CLAUDE.md の「After changes」ルール。

---

## 設計判断（ADR 要約）

詳細な背景・トレードオフ・採用理由は `.issue/221/adr.md` を参照。本 plan に直接関係する判断のみ要約する:

- **ADR-001: グローバルバックグラウンド処理バッジは見送り** — Header の client 化コストと #217 競合を避け、`/upload` ページ内のインジケータで代替。
- **ADR-002: 推定残り時間は表示しない** — LLM 推論時間の変動が大きく信頼できる推定が出せないため。定性メッセージで代替。
- **ADR-003: 進捗更新はポーリング（SSE / WebSocket は見送り）** — Cloudflare Workers の実行モデルと既存 `UploadDialog` パターンに整合。間隔は active あり: 4s / なし: 16s。
- **ADR-004: business `code` / pipeline 識別子のマッピングは presentation 層に集約** — `errorDisplay.ts` を単一の真実とし、ドメイン側にユーザー向け文言を持たせない。i18n 拡張容易性も担保。
- **ADR-005: pipeline 識別子という別グループのコード値を許容し、(a)/(b) 区分でマッピングする** — `IngestionErrorCode` 列挙値（usecase throw）と pipeline 識別子（`classifyPipelineError` 由来）を 2 グループに分けてマッピング表に並べる。詳細は adr.md 参照。

---

## リスクと注意点

- **ポーリング負荷:** 全ユーザーが `/upload` を開きっぱなしにすると `getIngestionJobsFn` のリクエスト数が増える。間隔を可変（active あり: 4s、なし: 16s）にして緩和。**さらに `visibilitychange` でタブ非表示時の tick をスキップし、visible 復帰時に即時 tick する**（Step 4-2 で導入済み、後付け忘れ防止のため本 Issue で同時実装）。
- **fatal 検出後の polling 復活防止:** `unauthorized` / `forbidden` / `notFound` を踏んだ後、`fatalRef.current = true` を立て、effect 冒頭で fatal なら return することで、jobs 状態変化等で effect が再実行されても polling が復活しない。timerRef は fatal 時に明示 clear する。
- **`useEffect` 依存配列ループ回避:** activeCount を依存配列に入れると jobs 変化のたびに effect が cleanup → 再実行されるループになるため、`jobsRef` で最新 jobs を参照する設計に変更。依存は `[fetchJobs]` のみ。
- **competing `router.invalidate` と client polling:** `IngestionJobRow.onCommit` / `onDiscard` / `onRegenerate` が `router.invalidate()` する一方、`IngestionQueue` は polling で独立に `setJobs` する。基本的には両者は最新状態に収束する設計だが、IngestionJobRow のアクション（commit/discard/regenerate）完了直後に polling tick が来ると **サーバー側の結果が一瞬古く見える微小な race window が理論上ある**（router invalidate の serverFn 結果がコミットされる前に polling tick が走り、未更新のジョブ一覧で上書きする可能性）。実装時に `IngestionJobRow` から `IngestionQueue` に「即時 tick 発火」のコールバックを props で渡す案（例えば `onLocalChange?: () => void` を IngestionQueue 経由で IngestionJobRow へ注入し、各アクション完了時に props で即時 tick を発火）を検討する余地あり。実装時に動作確認し、race が体感できるレベルなら本対策を入れる旨を testing.md にも明記する。なお、`IngestionJobRow` の `confirmDiscardOpen` 等の state は行コンポーネント内に閉じており、行が unmount されれば自動で消える。ConfirmDialog は body にポータルされるが、行 unmount で onClose が呼ばれなくなるだけで実害なし。テストで確認。
- **`displayJobErrorCode` の fallback:** マッピングに無いコード（`InvalidId` 等の value-object 構築時エラー、もしくは将来追加された未マッピングコード）が wire 経由で漏れた場合、汎用文言「取り込みに失敗しました。時間をおいて再度お試しください」を出す。これは「内部コードを出さない」原則を守る最終防衛線。Step 9 のテストで `IngestionErrorCode` 列挙値 + pipeline 識別子の全網羅を保証。
- **既存テストへの影響:** `UploadDialog.test.tsx` で `errorCode` 文字列を直接 assert している箇所があれば変更必要。`getIngestionJobsFn` のモック追加が `IngestionQueue` のテスト導入時に必要（本 Issue ではテストは Step 9 範囲のみ追加）。
- **i18n 対応**: 文言は日本語ハードコード。将来 i18n を入れる時は `errorDisplay.ts` の差し替えだけで済む構造になっている。
- **`spec/manual-tests/ingest.md`** の手順書も実装変更に追従する必要があるかも → Step 7/8 後に確認し、必要なら別途更新。

---

## テスト方針

### 自動テスト

- `errorDisplay.test.ts`（新規 or 拡張）:
  - 既知の `IngestionErrorCode` を `renderErrorMessage({ kind: "business", code, message: code })` に渡すと内部 code が文字列に出ないこと
  - `displayJobErrorCode("unsupported_format")` 等が日本語文言を返す
  - `displayJobErrorCode(null)` が `null` を返す
  - `displayJobErrorCode("__unknown_code__")` が fallback 日本語文言を返す（内部 code を含まない）
  - `IngestionErrorCode` 全値を反復し、いずれも `null` or 英語 code を返さないことを保証
- `UploadDialog.test.tsx` の既存テストが緑のまま通ること
- `pnpm test`（ユニット + integration の非リグレッション）

### 手動テスト（`.issue/221/testing.md` に詳細記載予定）

1. ヘッダーのアップロードボタンを押す → モーダルが開き、ファイル選択 / D&D で即座にローディング → プレビュー編集 → 保存・破棄まで一連の動作
2. 対応外形式（例: `.exe`）を投入 → 「このファイル形式には対応していません」とユーザー向け文言が出る（生 code が出ない）
3. アップロード上限を超過（dev では quota を一時的に下げてテスト）→ 「本日のアップロード上限に達しました…」が出る
4. アップロード完了後にホーム画面のノート一覧へ戻る → スクロール位置が保たれる（フルリロードでない）
5. `/upload` 画面で別タブからアップロード → 4 秒程度で `pending`→`processing`→`previewing` がポーリングで自動反映
6. `/upload` 画面で `failed` 状態のジョブを開く → 「取り込みに失敗しました…」がユーザー向け文言で表示（生 code が出ない）
7. DevTools で network throttling / offline → ポーリング失敗が `aria-live` でアナウンス、復帰後に自動再開
8. スクリーンリーダー（VoiceOver / NVDA）でモーダル開閉・ローディング・完了通知が読み上げられる
9. `prefers-reduced-motion: reduce` で skeleton のパルスが止まる

### 型・lint

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

---

## 変更ファイル一覧（参考）

新規:
- `app/components/ingestion/IngestionQueue.tsx`
- `app/core/presentation/__tests__/errorDisplay.test.ts`（既存なければ）
- `.issue/221/adr.md`
- `.issue/221/testing.md`

変更:
- `app/core/presentation/errorDisplay.ts`
- `app/components/ingestion/actions.ts`（`getIngestionJobsFn` 追加）
- `app/components/ingestion/IngestionJobRow.tsx`（生 errorCode 表示の差し替え）
- `app/components/ingestion/UploadDialog.tsx`（`FailedView` の生 errorCode 表示の差し替え）
- `app/components/ingestion/UploadPage.tsx`（`IngestionQueue` 差し替え）
- `app/components/ingestion/__tests__/UploadDialog.test.tsx`（assertion 微調整、必要なら）
- `spec/pages/index.md`（P13 節にフィードバックポリシー追記）
- `spec/design/index.md`（10b セクション追加）
- `spec/scenario/ingest.md`（L69 付近の内部 code 直書きをユーザー向け文言に書き換え、S-3）
- `spec/manual-tests/ingest.md`（生 errorCode を期待値にしている箇所の見直し、S-3）

---

## レビュー履歴

### 1周目

2視点並列レビュー（要件カバレッジ / アーキテクチャ・リスク）で指摘された問題点を反映した。

**必修正対応（P-A〜P-G）:**

- **P-A: pipeline 系 errorCode のマッピング欠落** — Step 1 のマッピング表に pipeline 識別子 8 種（`llm_failure` / `ocr_failure` / `speech_failure` / `pdf_parse_failure` / `office_parse_failure` / `ingestion.invalid_state` / `ingestion.temp_storage` / `ingestion.unknown`）を追加し、(a) `IngestionErrorCode` 列挙値 / (b) pipeline 識別子 の 2 グループ構成に再編。これらは `runIngestionJob.ts` の `classifyPipelineError`（L319-329）が `job.errorCode` に書き込む値で、実運用で `failed` ジョブの errorCode の大半を占める。
- **P-B: `invalid_status_for_regeneration` 漏れ** — Step 1 の `invalid_status_for_commit` / `invalid_status_for_discard` グループに追加。`IngestionErrorCode.InvalidStateForRegenerate` の値はこれ。
- **P-C: マッピング基準の明文化** — Step 1 冒頭に (a)/(b)/(c) の 3 区分（必マッピング 2 区分 + fallback 許容 1 区分）を明文化。Step 9 のテスト方針でグループ別網羅検証と実 throw 元の grep 確認手順を追加。
- **P-D: `useEffect` 依存配列バグ** — Step 4-2 の依存配列から `activeCount` を削除し、`jobsRef.current = jobs` を毎レンダー更新 + `tick` 内で参照する設計に変更。依存は `[fetchJobs]` のみ。
- **P-E: 変数名 shadow** — Step 4-2 で `{ jobs: next }` と `next` 間隔の衝突を解消。`{ jobs: nextJobs }` / `nextInterval`（実装では `schedule(computeInterval())`）に分離。
- **P-F: fatal 検出後の polling 停止保証** — `fatalRef.current = true` を導入し、effect 冒頭で fatal なら return、timerRef を明示 clear。jobs 変化等で effect が再実行されても polling が復活しない。
- **P-G: fallback 文言見直し** — 「詳細は管理者にお問い合わせください」→「時間をおいて再度お試しください」に変更。既存 `errorDisplay.ts` の他文言と質感を揃えた。

**取り込んだ改善提案（S-1〜S-5）:**

- **S-1: FailedView の aria-live** — Step 3 で `<p>` に `role="alert"` を追加、`IngestionJobRow` と一貫させた。
- **S-2: visibilitychange 対応** — Step 4-2 と「リスクと注意点」に追記。`document.visibilityState === "hidden"` のときは tick をスキップし、`visibilitychange` で visible に戻った瞬間に即時 tick。後付け忘れ防止のため本 Issue で同時導入。
- **S-3: spec/scenario と spec/manual-tests の整合** — Step 8 に追加。`spec/scenario/ingest.md` L69 付近の「FRONT_MATTER_JSON_INVALID を表示」記述をユーザー向け文言に書き換え、`spec/manual-tests/ingest.md` も同視点で見直す。
- **S-4: extractSerializedError 利用意図** — Step 4-2 のコメントで「fatal kind 判定のためにのみ使う、表示は `displayError(e)` を使う」と明記。
- **S-5: UploadForm error path 検証** — Step 5 から「コメント追加」を削除（CLAUDE.md no-comments と衝突）、「動作確認のみ・コード変更なし」に修正。Step 9 のテストに `unsupported_format` を `UploadForm` の error path に流すケースを 1 件追加し、新マッピング適用を assert。

**ADR 分離:**

ADR セクションを `.issue/221/adr.md` に分離し、plan.md からは要約 + 参照のみとした。adr.md には ADR-001〜004 に加え、P-A 由来の設計判断として **ADR-005（pipeline 識別子という別グループのコード値の存在と (a)/(b) 区分マッピング）** を追加した。

### 2周目

2 視点並列レビュー（要件カバレッジ / アーキテクチャ・リスク）の 2 周目で **両視点とも問題点ゼロ** となり、レビューループは終了した。軽微な改善提案 5 件を取り込んで plan.md / adr.md を更新した。

**取り込んだ改善提案（2周目）:**

- **Step 9 テスト方針の明確化**: `Object.values(IngestionErrorCode).forEach` での「明示マッピング必須」一括 assert は (c) 構築時エラー系列挙値が fail する。Step 9 を「(a) 明示マッピング必須 / (b) pipeline 識別子 / (c) fallback 許容」の 3 配列に分けた個別 assert 方針に書き換えた。
- **`getIngestionJobs` usecase 存在確認の判断ポイント**: Step 4-1 冒頭で `app/core/application/ingestion/getIngestionJobs.ts` の既存を確認済みであることを明記。仮に未存在だった場合の代替案（既存 loader serverFn 化 / usecase 新規追加）も判断ポイントとして記載。
- **`router.invalidate` と client polling の race window**: リスク章の記述を「安全」と断じる表現から、「アクション完了直後に polling tick が来ると一瞬古く見える微小な race window が理論上ある。即時 tick 発火コールバックを props で渡す案を実装時に検討」と書き換えた。
- **`IngestionQueue` の `pollErrorMessage` 表示位置**: Step 4-2 のコード例を、`jobs.length === 0` の early return ブランチでも `pollErrorMessage` が表示される構造に整理。`pollErrorMessage` は jobs の有無に関わらず常に一覧の上に出す位置に統一。
- **ADR-005 に no-comments 例外の旨を追記**: マッピング表のセクション区切りコメント (`// ---- (a) ... ----` / `// ---- (b) ... ----`) は no-comments 原則の例外（2 系統のコード出所という非自明な WHY を伝える）として許容する旨を adr.md ADR-005 に追記した。
