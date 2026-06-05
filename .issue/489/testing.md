# 動作確認計画 — Issue #489: presentation → domain の id 型漏れ全スライス解消

**Issue:** #489
**作成日:** 2026-06-05

---

本 Issue は挙動変更を伴わない型レベルのリファクタ（usecase の id 入力を `string` に統一、presentation の domain id 型 import / 剥がしキャスト除去）である。担保の主体は静的検証（typecheck）と既存テストであり、実機確認は「型変更で挙動が壊れていないこと」の最小スモークに限定する。

## 確認環境

### 静的検証・自動テスト（第一の担保）

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test:unit
pnpm test:integration
```

### 検証環境の起動（実機スモーク用）

```bash
pnpm dev
```

（Cloudflare Workers ランタイムをターゲットにした dev サーバ。`vite dev --config vite.config.cloudflare.ts`）

### デプロイ方法

なし（検証環境のみで確認できる。本番反映は通常の CI/CD フローに従い、本 Issue 固有の手順はない）。

## 確認項目

### 1. note: 作成・保存・リネーム・移動・削除・復元・複製

- **目的:** note actions（`createNote` / `saveNote` / `renameNote` / `moveNote` / `deleteNote` / `restoreNote` / `purgeNote` / `duplicateNote` 等）の id を string で渡すよう変えた後も従来どおり動くこと。
- **手順:**
  1. ログインしてノートを新規作成する（タイトル・本文・ディレクトリ指定あり）。
  2. 本文を編集して保存、タイトルをリネーム、別ディレクトリへ移動する。
  3. ノートをゴミ箱へ、ゴミ箱から復元、別途完全削除（purge）する。
  4. ノートを複製する。
- **期待結果:** すべて従来どおり成功し、画面表示・遷移が変わらない。
- **確認ポイント:** 500 やバリデーションエラーが出ないこと。

### 2. note: 一覧フィルタ（directoryId / referencingNoteId の graceful fallback）

- **目的:** ADR-002 の transport-boundary graceful fallback が温存されていること。
- **手順:**
  1. ホーム（ノート一覧）でサイドバーからディレクトリを選択し `?directoryId=<有効id>` で絞り込む。
  2. URL の `directoryId` を**存在しない値**に手で書き換えてリロードする。
  3. 同様に `?referencingNoteId=<不正値>` を付与してリロードする。
- **期待結果:** 有効 id では絞り込みが効く。不正 id では 500 にならず「フィルタなし（全件）」相当で一覧が表示される（従来挙動）。
- **確認ポイント:** 不正 id でページが壊れない（黙って無視される）こと。

### 3. note: 編集ロック・履歴・内部リンク補完

- **目的:** `acquireEditLock` / `extendEditLock` / `releaseEditLock` / `listNoteRevisions` / `getNoteRevision` / `restoreNoteRevision` / `searchInternalLinkTargets` が動くこと。
- **手順:**
  1. ノート編集画面を開く（ロック取得）→ 放置して延長 → 離脱（解放）。
  2. 履歴ページで版を一覧 → 1 版を開く → その版へ復元する。
  3. エディタで `[[` を打ち内部リンク候補を検索する。
- **期待結果:** いずれも従来どおり動作する。

### 4. publication: 公開設定・共有リンク

- **目的:** `changePublicationVisibility` / `issueShareLink` / `revokeShareLink` / `setShareLinkPassword` / `bulkChangePublicationVisibility` が動くこと。
- **手順:**
  1. ノートの公開設定モーダルで visibility を private→unlisted→public と変更する。
  2. 共有リンクを発行 → パスワードを設定 → 失効させる。
  3. 一覧で複数ノートを選択して一括公開設定を変更する。
- **期待結果:** すべて従来どおり成功し、失敗ノートは `failures` に出る（バルク）。

### 5. media: アップロード・参照

- **目的:** `uploadMediaPresigned` / `finalizeUpload` / `downloadMedia` が動くこと。
- **手順:**
  1. エディタで画像をアップロードする（presign → PUT → finalize）。
  2. 挿入された `/media/<id>` を開き、画像が 302 リダイレクトで表示されることを確認する。
- **期待結果:** アップロード・表示が従来どおり成功する。

### 6. export: 単発・バルク・キャンセル・ダウンロード・一覧

- **目的:** `startExportJob` / `enqueueExportJob` / `cancelExportJob` / `downloadExportArtifact` / `getExportJob` / `listExportJobs` が動くこと。
- **手順:**
  1. 単一ノートを同期エクスポート（ダウンロードが走る）。
  2. ビュー / 複数選択でバルクエクスポートをキュー投入 → ジョブ一覧で状態を確認 → 完了後ダウンロード。
  3. 処理中ジョブをキャンセルする。
- **期待結果:** すべて従来どおり成功する。

## エッジケース・異常系

### 1. 不正 id を含むリクエスト

- **目的:** 型を string に広げても、不正 id が NotFound / 適切なエラーで返ること（挙動不変）。
- **手順:**
  1. 存在しない `noteId` でノート詳細・保存系の server fn を叩く（DevTools や直接 URL で）。
  2. 存在しない `jobId` でエクスポートジョブ詳細を開く。
- **期待結果:** 従来どおり NotFound 相当の表示・エラーになる（型変更で握りつぶしや 500 化が起きない）。

## 既存機能への影響確認

- ingestion（OCR/取込）スライスは本 Issue で**変更しない**（既に string 化済み）。念のため取込フローが従来どおり動くことを確認する。
- worker / domain event 経由の非同期処理（エクスポート consumer、取込 consumer、note 削除に伴う publication/search/media/view の fan-out）は本 Issue で**変更しない**。これらが従来どおり動くことを確認する（特に note を完全削除した後に search/publication/media の整合が取れること）。

## 確認チェックリスト

- [ ] `pnpm typecheck` がパスする
- [ ] `pnpm lint:fix && pnpm format` で差分が出ない（整形済み）
- [ ] `pnpm test:unit` がグリーン
- [ ] `pnpm test:integration` がグリーン
- [ ] note の作成/保存/リネーム/移動/削除/復元/複製
- [ ] note 一覧の不正 directoryId/referencingNoteId が graceful fallback（500 にならない）
- [ ] 編集ロック / 履歴 / 内部リンク補完
- [ ] publication（公開設定 / 共有リンク / バルク）
- [ ] media（アップロード / 参照）
- [ ] export（単発 / バルク / キャンセル / DL / 一覧）
- [ ] 不正 id が従来どおり NotFound / エラーになる
- [ ] ingestion フロー（変更なし）が従来どおり動く
- [ ] worker 経由の非同期処理（変更なし）が従来どおり動く
