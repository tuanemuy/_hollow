# 動作確認計画 — Issue #255: Issue #226 フォローアップ: ingestion / note actions の小規模リファクタリング

**Issue:** #255
**作成日:** 2026-05-28

---

## 確認環境

このIssueはすべて presentation 境界のリファクタリングであり、ドメイン/usecase/DB は変更しない。動作確認は型・テスト・ローカル UI の 3 軸で行う。

### 検証環境の起動

```bash
pnpm dev
```

`http://localhost:5173` 付近で TanStack Start 開発サーバが立つ（Cloudflare Workers 互換ランタイム）。Issue が再現する画面は `/upload`（owner upload page）と関連モーダル。

### デプロイ方法

なし（検証環境のみで確認可能）。

---

## 確認項目

### 1. `flattenDirectoryTree` の挙動同一性（W-B-001）

- **目的:** リファクタ前後で directory tree のフラット化結果が完全に同一であることを確認
- **手順:**
  1. `pnpm dev` を起動
  2. ログインしてディレクトリツリーが存在する状態にする（複数階層のディレクトリ、ノートを含む）
  3. `/upload` ページの UploadDialog（または ingestion preview の "edit" ビュー）を開く
  4. ディレクトリ選択 `<select>` を開き、ツリーの depth-prefixed リスト表示を確認
  5. ノート一覧ページ等で `loadDirectoryTreeFlat` を経由するセレクタも開く
- **期待結果:**
  - ディレクトリ階層が `actions.ts` (server fn 経由) と `loaders.ts` (RSC 経由) 両方で**同一の depth・並び順**で表示される
  - depth = ネスト階層を反映したインデントが正しい
- **確認ポイント:** リファクタ前と全く同じ表示。万一 depth がずれる、並びが変わる場合は `flattenDirectoryTree` の DFS 順が崩れている兆候。

### 2. failed job の UI 表示変更（W-B-003）

- **目的:** failed ingestion job 表示が `{errorCode}: {errorReason}` から `{errorCode}` のみに変わることを確認
- **手順:**
  1. `pnpm dev` を起動
  2. `/upload` ページで意図的に失敗するファイル（例: 巨大ファイル、サポート外 mime）をアップロードして job を failed 状態に持っていく、または DB / fixture で既に failed なジョブを参照する
  3. `IngestionJobRow`（UploadPage のジョブカード）の表示を確認
  4. `UploadDialog` の failed ビュー（`UploadDialog.tsx:496-500`）の表示も確認
- **期待結果:**
  - failed ジョブのエラー表示が `errorCode` の値のみ（例: `INGESTION_TIMEOUT`、`unsupported_format`）
  - `errorReason` の自由文字列（例: "LLM timed out", スタックトレース風メッセージ）は UI に出現しない
- **確認ポイント:**
  - 開発者ツールの Network / Response に `errorReason` フィールドが含まれていないか（漏出遮断の確認）
  - `errorCode` が null の場合（失敗していない or 古いデータ）は何も表示されない

### 3. ingestion preview / upload フローの回帰確認（W-B-003 副作用）

- **目的:** Wire 型変更が既存の正常フロー（ingestion preview, commit, discard）を壊していないこと
- **手順:**
  1. `pnpm dev` を起動
  2. 正常なファイル（例: Markdown）をアップロード
  3. preview モーダルでタイトル・ディレクトリ・タグを編集
  4. Save (commit) して Note が作成されることを確認
  5. 別のファイルでアップロードし、Discard で破棄
- **期待結果:** いずれも従来どおり動作。`IngestionJobWire` の型変更で TypeScript エラーや runtime エラーが出ない。

### 4. directory picker (NotePicker / UploadDialog) の動作（W-T-010 副作用）

- **目的:** test mock helper 切り出しが対象テストの実装挙動に影響していないことを実機で念のため確認
- **手順:**
  1. `/upload` で UploadDialog のディレクトリ picker を操作
  2. note 関連画面で NotePickerDialog（ある場合）を操作
- **期待結果:** 既存の picker UX に変化なし。

---

## エッジケース・異常系

### 1. `errorCode` が null で `errorReason` のみ存在する failed ジョブ（理論的な過去データ）

- **目的:** 旧コードでは `errorReason !== null` で表示判定していたため、`errorCode === null && errorReason !== null` のジョブが過去存在した場合、新コードでは何も表示されなくなる
- **手順:**
  1. もし既存 DB にそのような job が存在する場合は確認
  2. `IngestionJobRow` / `UploadDialog` で何も error 表示されないことを確認
- **期待結果:** UI 崩れなし。ユーザーには status のみが伝わる（容認可能、ADR-001 で記録）
- **確認ポイント:** 通常 `markFailedSafely` は `errorCode` を必ずセットするので、このケースは実運用ではほぼ発生しない

### 2. ディレクトリツリーが空のとき

- **目的:** `flattenDirectoryTree([])` が空配列を返すこと
- **手順:** 新規アカウントなど directory が 1 つもない状態で UploadDialog のディレクトリ選択を開く
- **期待結果:** select が空、または "ディレクトリなし" 等のフォールバック表示（既存挙動と同じ）

---

## 既存機能への影響確認

- **`IngestionJobRow` を使う他箇所**: `grep -r "IngestionJobRow" app/` 結果 caller は `UploadPage.tsx` のみ → admin 経路への影響なし
- **`FlatDirectory` 型の type-only import**: `IngestionPreviewForm.tsx:28` が `note/loaders` から import → `loaders.ts` の re-export で後方互換維持
- **`IngestionJobWire` の re-export**: `actions.ts` 経由の既存 import パスをすべて温存（`wire.ts` 切り出し時に re-export 必須）

---

## 自動チェック

実装完了時に以下をすべて green にする:

```bash
pnpm typecheck
pnpm lint
pnpm format
pnpm test:unit
pnpm test:integration
```

`pnpm test:unit` で特に確認したいテストファイル（変更対象）:

- `app/components/ingestion/__tests__/IngestionPreviewForm.test.tsx`
- `app/components/ingestion/__tests__/UploadDialog.test.tsx`
- `app/components/note/list/__tests__/NotePickerDialog.test.tsx`

`pnpm test:integration` は domain/usecase に変更がないので影響なしの想定。

---

## 確認チェックリスト

- [ ] `pnpm typecheck` が green
- [ ] `pnpm test:unit` が全件 green（特に上記 3 テストファイル）
- [ ] `pnpm test:integration` が全件 green
- [ ] `pnpm lint` が green
- [ ] ディレクトリツリーのフラット化結果が server fn / loader 両方で同一（確認項目 1）
- [ ] failed ジョブ表示が `{errorCode}` のみ、`errorReason` 文字列が UI / network response に出ない（確認項目 2）
- [ ] ingestion 正常フロー（upload → preview → commit / discard）が従来どおり動く（確認項目 3）
- [ ] directory picker UX に変化なし（確認項目 4）
