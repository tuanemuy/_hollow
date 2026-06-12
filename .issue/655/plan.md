# 実装計画 — Issue #655: MediaUploader の presigned PUT を XHR 化して実バイト進捗を表示する

**Issue:** #655
**作成日:** 2026-06-12
**複雑度:** 小規模

---

## 目的

presigned URL への直接 PUT（バイト進捗が技術的に取得可能な唯一の経路）を `XMLHttpRequest` 化し、`xhr.upload.onprogress` のバイト進捗を determinate `ProgressBar` で表示する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `MediaUploader.tsx` の presigned PUT が `fetch` ではなく `XMLHttpRequest` で行われ、`xhr.upload.onprogress` で進捗を取得する | Issue本文 | 1 |
| AC-2 | アップロード中、バイト進捗（0–100%）が determinate `ProgressBar`（`value` prop）で表示される | Issue本文 | 1, 2 |
| AC-3 | 既存の per-file リトライ挙動（`lastFile` 再送）が維持される | Issue本文 | 1 |
| AC-4 | PUT 失敗（非2xx / ネットワークエラー）時は従来どおり `RetryableError` 表示になる | 既存挙動の維持 | 1 |

## スコープ

### 含まれないもの
- ingestion 経路（`uploadFileFn`）への実数進捗付与 — #637 ADR-001 で対応不能と結論済み
- presign / finalize フェーズの進捗表示の高度化（PUT フェーズ以外に進捗ソースは無い）

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/MediaUploader.tsx` — 変更対象。`runUpload` 内で `fetch(presigned.uploadUrl, { method: "PUT", ... })` している（63–70行）
  - `app/components/common/ProgressBar.tsx` — determinate 対応済み（`value` 0–100 で `aria-valuenow` 報告、`transition-[width]` 付き）
- あるべきアーキテクチャ: presentation 層のみの変更。ドメイン/アプリケーション/アダプターには触れない。React 19 クライアントコンポーネントの素直な state 管理で完結
- 既存実装の状態: `UploadState` は `idle | uploading | error` の判別共用体。`uploading` に進捗フィールドを足すだけで型レベルで整合する
- 依存関係: なし（`MediaUploader` の内部実装変更。props・呼び出し側は不変）

## 設計

### ドメイン / ユースケース / アダプター
なし — presentation 層内のクライアントサイド変更のみ。

### UI / プレゼンテーション
- `UploadState` の `uploading` バリアントを `{ kind: "uploading"; progress: number | null }` に拡張。`null` = presign 中など進捗未取得（または `lengthComputable` でない場合）→ indeterminate `ProgressBar`、数値 = determinate
- PUT を Promise でラップした XHR に置換:
  - `xhr.upload.onprogress` で `e.lengthComputable` なら `Math.round(e.loaded / e.total * 100)` を `setState`
  - `onload` で `status` 2xx 判定（従来の `putRes.ok` 相当）、非2xx は reject
  - `onerror` / `onabort` / `ontimeout` は reject
- 「アップロード中…」テキストは残し（aria-live で読み上げ）、`ProgressBar` は隣接テキストが状態を伝えるため `decorative` にするか、`aria-label` 付き progressbar にするかは #637 の既存パターン（隣接テキスト + bar）に合わせる — ingestion 側と同じく `decorative` 推奨

## 実装ステップ

### 1. PUT の XHR 化と進捗 state の追加

- **対象ファイル:** `app/components/note/editor/MediaUploader.tsx`
- **変更内容:** `UploadState.uploading` に `progress: number | null` を追加。`runUpload` の `fetch` PUT を XHR ラッパー（onprogress → setState、2xx 判定、エラー reject）に置換。エラーハンドリング・`lastFile` リトライは現行どおり catch 節で集約
- **理由:** `fetch` はアップロード進捗イベントを露出しないため（Issue の核心）

### 2. ProgressBar 表示

- **対象ファイル:** `app/components/note/editor/MediaUploader.tsx`
- **変更内容:** `state.kind === "uploading"` のブロックに `ProgressBar` を追加。`progress` が数値なら `value` 付き determinate、`null` なら indeterminate。隣接の「アップロード中…」テキストに `（{progress}%）` を併記し、bar は `decorative`
- **理由:** AC-2。スクリーンリーダー二重読み上げ防止は ProgressBar の JSDoc の指針どおり

## リスクと注意点

- R2 presigned PUT は CORS 設定次第で progress イベントが来ないことがあるが、`lengthComputable` フォールバック（indeterminate 表示）で劣化なし
- XHR の `onload` は 4xx/5xx でも発火するため status 判定を忘れない（従来の `!putRes.ok` と等価に）

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- ブラウザ手動検証: 大きめファイルのアップロードで determinate バーが伸びること、失敗時リトライが効くこと（testing.md 参照）
- 既存ユニットテストへの影響なし（MediaUploader の単体テストは無し）
