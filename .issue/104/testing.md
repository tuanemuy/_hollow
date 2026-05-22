# 動作確認計画 — Issue #104: feat(ui): Dialog プリミティブの背景クリック / × ボタンによる close オプション

**Issue:** #104
**作成日:** 2026-05-22

---

## 確認環境

このIssueの変更は `app/components/common/Dialog.tsx` と関連 utility hoist が中心で、既存コンシューマは無改修。新挙動は opt-in で既存コンシューマでは発火しないため、**主たる動作確認は単体テスト** で行い、手動確認は **既存挙動の回帰確認** に限定する。

### 検証環境の起動

```bash
pnpm dev   # vite dev (workerd via @cloudflare/vite-plugin) on http://localhost:3000
```

### 検証コマンド

```bash
pnpm typecheck       # 既存7コンシューマが opt-in default で型エラーにならないことを確認
pnpm test:unit       # 新規 Dialog.test.tsx のケースを実行
pnpm lint:fix        # Biome lint
pnpm format          # Biome format
```

### デプロイ方法

なし（プリミティブ UI 変更のみで、検証環境で確認できる）。

## 確認項目

### 1. 単体テスト全件 PASS

- **目的:** 新 props の挙動が plan.md ステップ7の全ケースで意図通り動くことを確認。
- **手順:**
  1. `pnpm test:unit` を実行
  2. `app/components/common/__tests__/Dialog.test.tsx` の全ケースが PASS することを確認
- **期待結果:** 8 ケース（default 挙動 / backdrop opt-in / origin guard / closable 連動 / × ボタン opt-in / × disabled / 初期 focus 除外 など）が全て PASS。
- **確認ポイント:** origin guard のテスト（`closeOnBackdropClick=true` でも panel 内 mousedown→backdrop click で閉じない）が PASS していること。

### 2. 型チェック

- **目的:** 既存 7 コンシューマが opt-in default false で無改修のまま型エラーにならないことを確認。
- **手順:**
  1. `pnpm typecheck` を実行
- **期待結果:** エラー 0。`NotePickerDialog`、`MoveNoteDialog`、`SaveViewDialog`、`BulkVisibilityDialog`、`BulkExportDialog`、`MergeTagDialog`、`ConfirmDialog` 全てが既存通り通る。
- **確認ポイント:** 新 props を渡していないコンシューマで `DialogProps` に関する型エラーが出ていないこと。

### 3. 既存 Dialog 挙動の回帰確認（手動）

- **目的:** `dialog` 定数への `relative` 追加が既存コンシューマの視覚的レイアウトを変えていないこと、既存の close 経路（Esc、Cancel ボタン）と focus trap が変わらず動くことを確認。
- **手順:**
  1. `pnpm dev` で開発サーバ起動
  2. ノート一覧ページで「移動」ボタン押下 → `MoveNoteDialog` が開く
     - 視覚的レイアウト（パネルの中央配置、padding、shadow）が変わっていないことを目視確認
     - Esc キーで閉じることを確認
     - 「キャンセル」ボタンで閉じることを確認
     - Tab キーで focus が dialog 内を巡回することを確認（focus trap）
     - 確定処理中（pending）に Esc キーが効かないことを確認（`closable={false}` 経路）
  3. ノート一覧で「ビューを保存」操作 → `SaveViewDialog` も同様にレイアウト・close 経路・focus trap を確認
  4. ノート一覧でフィルタ操作 → `NotePickerDialog` も同様
  5. 削除ダイアログ（`ConfirmDialog`）でレイアウト・キャンセル・確認ボタンの動作確認
- **期待結果:** 全ての既存 Dialog が変更前と同じ見た目・close 経路・focus trap で動く。
- **確認ポイント:**
  - 「dialog 定数への `relative` 追加」で予期しないレイアウトずれが起きていないか（特に padding と中央配置）
  - 既存の Cancel ボタンと Esc キーの close 経路が壊れていないか
  - `closable={false}` 中の close 経路無効化が依然として有効か

## エッジケース・異常系

### 1. IME 変換中の Esc キー

- **目的:** 既存仕様（IME 変換中の Esc キーで dialog が閉じない）が変更後も維持されることを確認。
- **手順:**
  1. `pnpm dev` でサーバ起動
  2. `SaveViewDialog` を開き、ビュー名入力欄で日本語を入力（IME 変換中の状態）
  3. 変換中に Esc キーを押下
- **期待結果:** Dialog は閉じず、IME 変換のみキャンセルされる。

### 2. 同時に複数 Dialog（body scroll lock）

- **目的:** 既存の body scroll lock counter ロジックが変更後も正しく動くことを確認。
- **手順:**
  1. ノート一覧で `BulkVisibilityDialog` を開く
  2. その状態で `ConfirmDialog`（操作確認）が重なる経路があれば triggered させる
  3. 外側 Dialog を閉じたとき body の `overflow` が元に戻ることを確認
- **期待結果:** body scroll lock が破綻せず、最後の Dialog が閉じた時点で body スクロールが復活。

## 既存機能への影響確認

- **既存 7 コンシューマ:** 全て opt-in props を渡していないため、新挙動（× ボタン描画、backdrop click close）は発火しない。視覚レイアウトに影響するのは `dialog` 定数への `relative` 追加のみで、事前 grep で視覚的 `absolute` 子要素は存在しないことを確認済み（`SR_ONLY` の clip 済み要素のみ）。
- **NotePickerDialog の既存テスト:** dialog 内 button 総数に依存していないため、コンシューマが `showCloseButton` を有効化しない限り破壊しない。`pnpm test:unit` で確認。
- **`__tests__/errorCodeNaming.test.ts` 等の domain 系テスト:** UI 変更で影響なし。

## 確認チェックリスト

- [ ] `pnpm typecheck` が成功する
- [ ] `pnpm test:unit` で新規 `Dialog.test.tsx` の全ケースが PASS する
- [ ] `pnpm lint:fix` でエラーなし
- [ ] `pnpm format` でフォーマット適用済み
- [ ] `MoveNoteDialog` / `SaveViewDialog` / `NotePickerDialog` / `ConfirmDialog` で既存挙動（Esc / Cancel / focus trap / pending 中 close 抑止）が変わらない
- [ ] `dialog` 定数の `relative` 追加で視覚的レイアウトが変わらない
- [ ] IME 変換中の Esc キーで Dialog が閉じない
