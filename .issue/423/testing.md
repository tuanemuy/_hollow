# 動作確認計画 — Issue #423: 楽観的UI更新の残スコープ

**Issue:** #423
**作成日:** 2026-06-03

---

## 確認環境

本 Issue は React 19 `useOptimistic` の残スコープ展開（複製の楽観追加 / tag の rename・delete / directory rename）。**成功時の即時反映は実機ブラウザで体感確認**し、**失敗時の rollback + エラー表示は component テストで担保**する（ボタン経由 mutation のブラウザ自動検証は cross-origin で弾かれるため）。

### 検証環境の起動

- component / unit テスト: `pnpm test:unit`
- 型チェック: `pnpm typecheck`
- Lint: `pnpm lint`（push 前は `./node_modules/.bin/biome format` で format:check 相当も確認）
- 実機ブラウザ確認用 dev サーバー（live source）: `pnpm dev`
- DB マイグレーション（必要時）: `pnpm db:migrate`

> 本 Issue はスキーマ変更を伴わない（presentation 層のみ）。マイグレーションは不要。

### デプロイ方法

なし（検証環境のみで確認できる）。ステージング確認が必要なら `pnpm deploy:staging`。

## 確認項目

### 1. SavedView 複製の楽観追加

- **目的:** 複製操作直後に新しいビュー行がリストに即時出現すること（loader 往復を待たない）。
- **手順:**
  1. `pnpm dev` でサーバー起動、`/views` を開く（保存ビューが 1 件以上ある状態）
  2. いずれかのビューの「複製」をクリック
- **期待結果:** クリック直後に「{元の名前} のコピー」行がリストに現れる。loader 再取得後も二重に現れず収束する。
- **確認ポイント:** 楽観追加した行と invalidate 後の行で key 衝突・二重表示・ちらつきがないか。並び順ジャンプ（末尾→正位置）が許容範囲か。

### 2. tag のリネーム / 削除の即時反映

- **目的:** tag rename / delete が操作直後に反映されること。
- **手順:**
  1. `/tags`（タグ管理）を開く（タグが複数ある状態）
  2. あるタグを「リネーム」→ 新名で保存
  3. 別のタグを「削除」→ 確認ダイアログで確定
- **期待結果:** rename は保存直後に `#{新名}` 表示 + 編集モード即時 close。delete は確定直後に該当行が消え、件数表示（`N 件のタグ`）も即時に減る。統合候補からも即時に外れる。
- **確認ポイント:** loader 再取得で表示が崩れず収束するか。削除確定の瞬間に行が消えるか。

### 3. directory インライン rename の即時表示

- **目的:** directory のインライン rename 確定後、表示名が即時に切り替わること（sidebar tree の invalidate 完了を待たない）。
- **手順:**
  1. 任意の画面で左サイドバーのディレクトリツリーを開く
  2. あるディレクトリを F2 もしくは操作メニューから「リネーム」→ 新名で確定（Enter / blur）
- **期待結果:** 確定直後に新名が表示される。input が閉じた瞬間に古い名前が一瞬見えるちらつきがない。invalidate 後も新名で収束する。
- **確認ポイント:** rename 確定〜sidebar 再取得までの表示名つなぎが効いているか。

### 4. directory の移動 / 削除（楽観化しない・操作中フィードバックの維持）

- **目的:** 移動・削除は楽観化しないが、操作中フィードバック（"移動中..." / "削除中..." / disabled）が出ること。
- **手順:**
  1. ディレクトリの移動ダイアログで移動を実行
  2. ディレクトリの削除ダイアログで削除を実行
- **期待結果:** 操作中はボタンが pending 表示。確定後（invalidate 完了後）に tree が更新される。
- **確認ポイント:** 移動・削除で tree がちらつかず、従来どおり invalidate で収束すること。

## エッジケース・異常系

### 1. mutation 失敗時の自動 rollback + エラー表示（component テストで担保）

- **目的:** 複製・tag rename/delete・directory rename が失敗したとき、optimistic 反映が baseline に巻き戻り、エラーが表示されること。
- **手順:**
  1. `pnpm test:unit` を実行
  2. 以下の全テスト pass を確認:
     - `app/components/view/SavedViewsList/__tests__/SavedViewsList.test.tsx`（複製の追加 / reject 復帰）
     - `app/components/tag/__tests__/TagList.test.tsx`（rename / delete の即時反映 / reject 復帰）
     - `app/components/directory/__tests__/DirectoryTree.test.tsx`（rename 即時表示 / reject 復帰）
- **期待結果:** 複製 reject → 新行が消える（baseline 復帰）+ 複製元行に `role="alert"`。tag rename reject → 旧名へ復帰 + エラー。tag delete reject → 行が再表示 + エラー。directory rename reject → input が残り baseline 名 + エラー。
- **確認ポイント:** optimistic 値が失敗時に確実に元へ戻ること。

### 2. 複製の二重 key 防御

- **目的:** 楽観追加した view.id が baseline 収束後に同一 id で現れても二重表示にならないこと。
- **手順:**
  1. `SavedViewsList.test.tsx` の「baseline に同一 id が存在する場合に add reducer が重複追加しない」テスト pass を確認
- **期待結果:** reducer の guard により同一 id は 1 行のみ描画。

## 既存機能への影響確認

- SavedView の CRUD（削除・rename・既定 toggle・編集・修復）が #414 の楽観挙動から回帰していないこと（既存 `SavedViewsList.test.tsx` / `ViewFormDialog.test.tsx`）。
- tag の作成（`CreateTagForm`）・統合（`MergeTagDialog`）が `TagList` への list 引き上げ後も従来どおり動くこと。
- directory の作成・移動・削除が rename 楽観化後も回帰していないこと。
- アップロード（`UploadForm`）の `isPending` 表示が現状維持であること（楽観追加は本 Issue では入れない）。
- ingestion job の discard 即時 dim（#414）が回帰していないこと（`IngestionJobRow.test.tsx`）。

## 確認チェックリスト

- [ ] SavedView 複製が操作直後にリストへ即時追加される（項目1）
- [ ] tag rename / delete が即時反映される（項目2）
- [ ] directory inline rename が即時表示される（項目3）
- [ ] directory 移動 / 削除は楽観化せず操作中フィードバックを維持（項目4）
- [ ] 失敗時の rollback + エラー表示が component テストで pass（異常系1）
- [ ] 複製の二重 key 防御（異常系2）
- [ ] アップロードは現状維持（楽観追加なし）
- [ ] `pnpm test:unit` 全 pass
- [ ] `pnpm typecheck` エラーなし
- [ ] `pnpm lint` エラーなし
