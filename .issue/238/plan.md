# 実装計画 — Issue #238: feat(ingestion): UI に「破棄済みを表示」トグルを追加

**Issue:** #238
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

`/upload` ページに「破棄済みを表示」トグル（既定 OFF）を追加し、ユーザーが UI から破棄済みジョブを再確認できるようにする。Issue #229 で usecase 側に用意済みの `includeDiscarded` フラグを、ローダー → ページ → ポーリングまで貫通させて UI に露出する。

## スコープ

### 含まれるもの

- `loadIngestionJobs(actorUserId, options?)` のシグネチャ拡張（`{ includeDiscarded?: boolean }`）
- `/upload` ルートの `validateSearch` に `includeDiscarded` 検索パラメータを追加（型安全）
- `UploadPage`（サーバーコンポーネント）への `includeDiscarded` 受け渡し
- 「破棄済みを表示」トグル UI（既定 OFF、URL クエリで状態保持、クリーンURL方針）
- クライアントポーリング (`getIngestionJobsFn` / `IngestionQueue`) への `includeDiscarded` 貫通（トグル ON 時にポーリングで破棄済みが消えないようにする）
- 破棄済みカードの視覚的区別（`IngestionJobRow`）

### 含まれないもの

- `getIngestionJobs` usecase 本体の変更（#229 で `includeDiscarded` 実装済み）
- 任意ステータス指定 UI（`status` フィルタの一般化）
- ページネーション UI（既存どおり limit 50 固定）

## 調査結果

- **データフロー（現状）**:
  - ルート `app/routes/_app/upload/index.tsx` → `renderUpload` server fn → `<UploadPage user>` を `renderServerComponent` で描画
  - `UploadPage` → `loadIngestionJobs(user.id)`（`actorUserId` のみ）→ `<IngestionQueue initialJobs>`
  - `IngestionQueue`（client）は `getIngestionJobsFn({ data: { limit: 50 } })` で4秒間隔ポーリングして `jobs` を上書き
- **あるべきアーキテクチャ**:
  - 検索パラメータは `validateSearch`（URL）と server fn の `inputValidator`（RPC）の2点で検証（CLAUDE.md「Input validation」）。`trash` ルートが同型の参考実装（`validateSearch` + `loaderDeps` + 厳格スキーマで server fn を呼ぶ）
  - クリーンURL方針（Issue #215）: 既定値は URL に載せない（`paginationSearchSchema` の `.optional().catch(undefined)` パターン）。トグル OFF（既定）のときは `?includeDiscarded` を URL から消す
  - トグルは client 専用で `router.navigate({ search })`（`DisplayModeSwitch` が参考）
- **既存実装の状態**:
  - usecase `getIngestionJobs` は `includeDiscarded?: boolean` を既に受け付ける（#229）。乖離なし
  - `loadIngestionJobs` は `actorUserId` のみ。`serverData` は `...args` で追加引数を素通しするためシグネチャ拡張は自然に可能
  - `IngestionJobRow` は `statusLabel.discarded = "破棄済み"`、`statusChipClass` の default で `CHIP_MUTED` を既に付与。視覚的区別は「カード全体のトーンダウン」を追加する
- **依存関係**: ルート / server fn / ローダー / ページ / ポーリング action / Queue / Row。新規にトグルコンポーネントと検索スキーマを追加。

## 実装ステップ

### 1. upload 検索スキーマの追加

- **対象ファイル:** `app/components/ingestion/uploadSearch.ts`（新規）
- **変更内容:** `includeDiscarded` を扱う `uploadSearchSchema` を定義。URL の stringly-typed 入力（`true` / `1`）と boolean の双方を受け、`.optional().catch(undefined)` で不正値・未指定を吸収する。
  ```ts
  export const uploadSearchSchema = z.object({
    includeDiscarded: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "1" || v === "true")
      .optional()
      .catch(undefined),
  });
  ```
- **理由:** `validateSearch` で型安全に扱う（完了条件）。pagination と同じく field 由来で SSOT 化し、クリーンURL方針を守る。

### 2. ルートに validateSearch / loaderDeps を追加

- **対象ファイル:** `app/routes/_app/upload/index.tsx`
- **変更内容:**
  - `renderUpload` に `inputValidator(validateInput(z.object({ includeDiscarded: z.boolean() })))` を付け、`includeDiscarded` を受けて `<UploadPage user includeDiscarded={data.includeDiscarded} />` に渡す。
  - `Route` に `validateSearch: (s) => uploadSearchSchema.parse(s)`、`loaderDeps: ({ search }) => search`、`loader: ({ deps }) => renderUpload({ data: { includeDiscarded: deps.includeDiscarded ?? false } })`。
- **理由:** `trash` ルートと同型。URL → 厳格スキーマ → サーバーコンポーネントの貫通。
- **実装注意（レビュー P-002 反映）:**
  - `renderUpload` の `inputValidator` は `z.object({ includeDiscarded: z.boolean() })` の**厳格 boolean 単独**にし、`.default(...)` を付けない。再既定は loader 境界の `deps.includeDiscarded ?? false` のみで行う（trash の `?? PAGINATION_DEFAULT_*` と同型）。
  - `loaderDeps: ({ search }) => search` を**明示**して search 変化でローダーを再実行させる（= URL変更時に server 側が新フラグで再クエリし、`initialJobs` が更新される）。`DisplayModeSwitch` のように deps から除外してはいけない（あちらは server 再クエリ不要だが、本件は必須）。

### 3. UploadPage に includeDiscarded を貫通

- **対象ファイル:** `app/components/ingestion/UploadPage.tsx`
- **変更内容:** `Props` に `includeDiscarded: boolean` を追加。`loadIngestionJobs(user.id, { includeDiscarded })` を呼び、`<DiscardedToggle />`（props 不要・自身で search を読む）と `<IngestionQueue initialJobs includeDiscarded />` を描画。
- **`IngestionQueue` 再マウント（レビュー P-001 反映・重要）:** `<IngestionQueue key={includeDiscarded ? "with-discarded" : "default"} ... />` のように `includeDiscarded` を `key` に含める。`IngestionQueue` は `useState(initialJobs)` を初回マウント時のみ初期化するため、トグル切替で `initialJobs` prop が変わっても client state `jobs` は再初期化されない。`key` を変えて**強制再マウント**することで、新フィルタの `initialJobs` で確実に再初期化し、ポーリング状態（backoff/error）もリセットする。
- **理由:** 初期描画とポーリングで同じフィルタを使うため状態を子に渡す。再マウントでフィルタ切替時の表示乖離（P-001）を防ぐ。

### 4. loadIngestionJobs のシグネチャ拡張

- **対象ファイル:** `app/components/ingestion/loaders.ts`
- **変更内容:** `serverData` ハンドラの第2引数に `options?: { includeDiscarded?: boolean }` を追加し、usecase input に `includeDiscarded` を渡す。
- **理由:** Issue 完了条件の1。`serverData` は `...args` を素通しするので破壊的変更なし（既存呼び出しは options 省略で従来挙動）。

### 5. ポーリング action に includeDiscarded を追加

- **対象ファイル:** `app/components/ingestion/actions.ts`
- **変更内容:** `getIngestionJobsFn` の input スキーマに `includeDiscarded: z.boolean().optional()` を追加し、usecase へ渡す。未指定時は usecase 側（`getIngestionJobs.ts`）で `false` 扱いとなり既定除外が保たれる（S-003 反映）。
- **理由:** トグル ON でも4秒ポーリングが破棄済みを消さないようにする（これが無いとリロード耐性はあってもポーリングで消える）。

### 6. IngestionQueue にトグル状態を貫通

- **対象ファイル:** `app/components/ingestion/IngestionQueue.tsx`
- **変更内容:** `Props` に `includeDiscarded: boolean` を追加し、`fetchJobs({ data: { limit: 50, includeDiscarded } })` に反映。トグル切替時はステップ3の `key` で本コンポーネント自体が再マウントされるため、`includeDiscarded` を effect 依存に追加する必要はない（再マウントで effect も含め全状態が作り直される）。`fetchJobs` の引数で参照するクロージャは新マウントの最新 prop を掴む。
- **理由:** ステップ5と対。ポーリングもトグル状態を尊重する。

### 7. 「破棄済みを表示」トグルコンポーネント

- **対象ファイル:** `app/components/ingestion/DiscardedToggle.tsx`（新規）
- **変更内容:** client コンポーネント（`"use client"`）。**props を取らないスタンドアロン設計**（レビュー P-003 反映）— 自身で `getRouteApi("/_app/upload/")` の `useSearch` で現在の `includeDiscarded` を読み、`router.navigate({ to: "/upload", replace: true, search: (prev) => ({ ...prev, includeDiscarded: next ? true : undefined }) })` で URL を更新（OFF は param を `undefined` にして落とし、クリーンURL）。トグルUIは pill ボタン。`aria-pressed` / `data-active={active || undefined}` で状態表現。サーバーコンポーネント `UploadPage` から直接 import して JSX に置く（callback prop は渡さない＝serializable 制約を回避）。
- **理由:** URL クエリで状態保持（完了条件）。`DisplayModeSwitch` の `getRouteApi` + `router.navigate` パターンを踏襲。

### 8. 破棄済みカードの視覚的区別

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** カード（`JOB_CARD`）に `data-discarded={job.status === "discarded" || undefined}` を付与し、`data-[discarded]:opacity-60` 等でトーンダウン。ステータスバッジは既存の `CHIP_MUTED`（破棄済み）を維持。
- **理由:** 保持中ジョブと混同しない視覚差（完了条件）。`data-*` + Tailwind variant 方針（CLAUDE.md Styling）に従う。

### 9. テスト

- **対象ファイル:** `app/components/ingestion/__tests__/uploadSearch.test.ts`（新規）ほか
- **変更内容:**
  - `uploadSearchSchema` の単体テスト（`true`/`1`/`"true"`/未指定/不正値の正規化）
  - `IngestionJobRow` の破棄済みカードに `data-discarded` が付くテスト（既存 `IngestionJobRow.test.tsx` に追記）
- **理由:** 検索スキーマの正規化と視覚区別の回帰防止。

## 設計判断

詳細は `.issue/238/adr.md` を参照。

- ADR-001: トグル状態の URL 表現（boolean を `?includeDiscarded=true`、OFF はパラメータ省略でクリーンURL）
- ADR-002: ポーリング経路にも `includeDiscarded` を貫通させる（ON 時にポーリングで破棄済みが消える退行の防止）

## リスクと注意点

- **ポーリングとの整合性**: トグル ON 初期描画後にポーリングがフィルタ無しで上書きすると破棄済みが消える。ステップ5・6で必ず貫通させる。
- **クリーンURL方針**: OFF のとき `includeDiscarded` を URL に残さない（Issue #215 の哲学）。`validateSearch` 出力も optional に保つ。
- **`renderUpload` の inputValidator**: `serverData` ではなく `createServerFn` なので client から到達可能。trash と同じく厳格 boolean スキーマで検証する。
- **`getIngestionJobsFn` のデフォルト**: `includeDiscarded` 省略時は usecase 側で `false` 扱い（既定除外を維持）。

## テスト方針

- 単体: `uploadSearchSchema` 正規化、`IngestionJobRow` 視覚区別属性
- 手動（testing.md）: トグル OFF/ON の表示切替、URL 反映、リロード耐性、破棄済みカードの視覚差、ポーリング後も破棄済みが残ること、hand-typed URL（`?includeDiscarded=true` / `=1` / `=abc`）の round-trip（S-001 反映）

## レビュー履歴

### 1周目（2視点並列）
**修正した点（要修正への対応）**:
- P-001（アーキ視点・最重要）: `IngestionQueue` の `useState(initialJobs)` がトグル切替後に再初期化されない問題。ステップ3に「`key={includeDiscarded ? ...}` で強制再マウント」を追加し、ステップ6の effect 依存追加方針を撤回（再マウントで全状態が作り直されるため不要）。
- P-002（アーキ視点）: `renderUpload` の `inputValidator` に `.default()` を付けない／`loaderDeps: ({ search }) => search` を明示する旨をステップ2に追記。
- P-003（アーキ視点）: `DiscardedToggle` を props なしのスタンドアロン client コンポーネント（自身で `useSearch`）とし、callback prop を渡さない旨をステップ7に明記。

**取り込んだ改善提案**:
- S-001: hand-typed URL の round-trip を testing.md の手動確認に追加。
- S-003: ポーリング action 未指定時の usecase 既定（`false`）をステップ5に明記。

**見送った提案とその理由**:
- S-002（要件視点・`uploadSearchSchema.pick(...)` を inputValidator に再利用）: 見送り。`uploadSearchSchema` の出力は coerce/optional/catch を含む URL 向けで、RPC 境界の厳格 boolean スキーマとは契約が異なる（pagination も URL 用と RPC 用でスキーマを分けている）。再利用するとクリーンURL方針と厳格検証のどちらかが崩れるため、別スキーマのままが正しい。
- 要件視点 P-001/P-002/P-003: 要件レビュアーは「問題点ゼロ」。アーキ視点の指摘のみ反映。

### 2周目
要件カバレッジ視点は1周目で「問題点ゼロ」、アーキ視点の全 P 指摘を反映済み。残課題なしと判断し、レビューループを終了する。
