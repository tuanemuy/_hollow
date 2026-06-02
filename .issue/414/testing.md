# 動作確認計画 — Issue #414: 楽観的UI更新で mutation インタラクションを滑らかにする

**Issue:** #414
**作成日:** 2026-06-02

---

## 確認環境

本 Issue は React 19 `useOptimistic` による楽観的 UI 更新の導入。**成功時の即時反映は実機ブラウザで体感確認**し、**失敗時の rollback + エラー表示は component テストで担保**する（ボタン経由 mutation のブラウザ自動検証は cross-origin で弾かれるため）。

### 検証環境の起動

- component / unit テスト: `pnpm test:unit`
- 型チェック: `pnpm typecheck`
- Lint: `pnpm lint`
- 実機ブラウザ確認用 dev サーバー（live source）: `pnpm dev`

### デプロイ方法

なし（検証環境のみで確認できる）。ステージング確認が必要なら `pnpm deploy:staging`。

## 確認項目

### 1. SavedView 削除の即時反映（list-level optimistic）

- **目的:** 削除操作直後に該当行がリストから即座に消え、loader 完了を待たないこと。
- **手順:**
  1. `pnpm dev` でサーバー起動、`/views` を開く（保存ビューが複数ある状態にする）
  2. いずれかのビューの削除を実行 → 確認ダイアログで確定
- **期待結果:** 確定直後に該当行が即座にリストから消える（ネットワーク往復待ちのラグなし）。
- **確認ポイント:** 削除確定の瞬間に行が消えるか。loader 再取得後に二重に消える/ちらつくことがないか。

### 2. SavedView 名前変更・既定 toggle の即時反映（row-level optimistic）

- **目的:** rename / 既定 toggle が操作直後に行に反映されること。
- **手順:**
  1. `/views` で任意のビューの名前を編集 → 保存
  2. 別のビューを「既定に設定」
- **期待結果:** rename は保存直後に新名称表示 + 編集モード即時 close。既定 toggle は直後にバッジ/ボタンラベルが切り替わる。
- **確認ポイント:** 即時反映後、loader 再取得で表示が崩れず収束するか。既定 toggle 後、他行の既定は再取得で収束する（一瞬 2 つ既定に見えても許容範囲）。

### 3. SavedView 編集ダイアログの即時 close

- **目的:** ViewFormDialog の保存後、loader を待たず即 close すること。
- **手順:**
  1. `/views` でビューの編集ダイアログを開き、内容を変更して保存
- **期待結果:** 保存成功直後にダイアログが閉じる（loader 再取得完了を待たない）。リストには再取得後に変更が反映される。
- **確認ポイント:** 保存ボタン押下から close までの体感ラグがないか。

### 4. 複製・修復の操作フィードバック

- **目的:** 複製は楽観"追加"しないが操作中フィードバック（disabled / aria-busy）が出ること。修復後は壊れバナーが即時非表示になること。
- **手順:**
  1. ビューを複製 → ボタンが操作中状態になり、確定後リストに新ビューが現れる
  2. 壊れた条件を持つビューを修復
- **期待結果:** 複製はボタンが pending 表示、確定後にリスト反映。修復は壊れバナーが即時に消える。
- **確認ポイント:** 複製確定時に行がちらつかないこと。

### 5. インジェスション job の discard 即時 dim（中優先度）

- **目的:** discard 操作直後に job カードが即座に薄く（dim）表示されること。
- **手順:**
  1. インジェスション画面で対象 job を discard
- **期待結果:** discard 直後にカードが dim 表示になり、アクションボタンが隠れる。
- **確認ポイント:** 「dim 済みなのにボタンが残る」一瞬がないこと。

## エッジケース・異常系

### 1. mutation 失敗時の自動 rollback + エラー表示（component テストで担保）

- **目的:** 削除・rename・既定 toggle が失敗したとき、optimistic 反映が baseline に巻き戻り、エラーが表示されること。
- **手順:**
  1. `pnpm test:unit` を実行
  2. `app/components/view/SavedViewsList/__tests__/SavedViewsList.test.tsx` と `app/components/view/__tests__/ViewFormDialog.test.tsx` の全テスト pass を確認
- **期待結果:** 削除 reject → 行が再表示（baseline 復帰）+ `role="alert"` エラー。既定 toggle reject → baseline 復帰 + 他行 isDefault は変わらず。submit reject → ダイアログ非 close + エラー表示。
- **確認ポイント:** optimistic 値が失敗時に確実に元へ戻ること。

## 既存機能への影響確認

- SavedView の CRUD（作成・編集・削除・複製・修復・既定設定）が従来どおり成功し、最終状態が loader 再取得後に正しく収束すること。
- インジェスション job の各操作（discard 以外）が回帰していないこと（既存 `IngestionJobRow.test.tsx`）。

## 確認チェックリスト

- [ ] 削除が操作直後に即時反映される（項目1）
- [ ] rename / 既定 toggle が即時反映される（項目2）
- [ ] 編集ダイアログが保存後即 close する（項目3）
- [ ] 複製の操作フィードバック / 修復の即時バナー非表示（項目4）
- [ ] discard の即時 dim（項目5）
- [ ] 失敗時の rollback + エラー表示が component テストで pass（異常系1）
- [ ] `pnpm test:unit` 全 pass
- [ ] `pnpm typecheck` エラーなし
- [ ] `pnpm lint` エラーなし
