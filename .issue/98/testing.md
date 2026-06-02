# 動作確認計画 — Issue #98: [a11y] ConfirmDialog エラー時のフォーカス管理と in-dialog エラー表示

**Issue:** #98
**作成日:** 2026-06-02

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 自動テスト

```bash
pnpm test:unit
```

ConfirmDialog の error 表示・閉じない挙動の新規ユニットテストと、既存 `IngestionPreviewForm.test.tsx` の回帰をここで担保する（本 Issue の主検証）。

### 検証環境の起動（ブラウザ目視確認用）

`pnpm start` はビルド済み dist を wrangler dev で配信するため、ソース変更を反映するには先に build が必要:

```bash
pnpm build
pnpm start
```

dev サーバーで HMR を使う場合:

```bash
pnpm dev
```

### デプロイ方法

なし（検証環境のみで確認できる。本番反映は本 Issue の確認には不要）。

## 確認項目

### 1. ConfirmDialog の error 表示（ユニット）

- **目的:** `error` prop 指定時にダイアログ内へエラーが `role="alert"` で表示され、ダイアログが閉じないことを確認
- **手順:**
  1. `pnpm test:unit` を実行
  2. ConfirmDialog 新規テストが PASS することを確認
- **期待結果:** (a) `error` 指定で `role="alert"` 領域が `displayError` 文言付きで描画 (b) `error` 指定でもダイアログが mount 維持 (c) `aria-describedby` に description と error の id が両方含まれる (d) `error` 未指定で alert 領域なし、が全て緑
- **確認ポイント:** `aria-describedby` 合成で空文字が出ていないこと

### 2. 既存削除フローの回帰（ユニット）

- **目的:** A 群移行で既存テストが壊れていないことを確認
- **手順:**
  1. `pnpm test:unit` を実行
  2. `IngestionPreviewForm.test.tsx` の commit エラー alert テストが PASS することを確認
- **期待結果:** commit エラーは従来どおりフォーム内 alert に出て、discard 用 dialog の error とは二重化しない
- **確認ポイント:** `[role="alert"]` の件数が commit テストで増えていないこと

### 3. ブラウザ目視（静的なエラー表示の見た目）

- **目的:** dialog 内エラー表示の視覚的レイアウト（説明 → エラー → ボタンの順、`text-error` の可読性）を確認
- **手順:**
  1. `pnpm build && pnpm start` で起動
  2. 認証必須ルート（タグ管理・ゴミ箱・ノート詳細等）へアクセス（認証手順は下記「補足」参照）
  3. 削除ダイアログを開く
- **期待結果:** ダイアログのレイアウトが崩れず、エラー領域が確保されれば説明文の下・ボタンの上に収まる
- **確認ポイント:** mutation エラーの実誘発は agent-browser からの server-fn POST が 403 になるため不可。エラー表示状態は主にユニットテストで担保し、ブラウザは正常系ダイアログのレイアウト確認に留める

## エッジケース・異常系

### 1. キャンセルでエラーが行内へ移動しないこと（ユニット推奨）

- **目的:** 共有 `error` state を持つ呼び出し側で、エラー表示中にキャンセルすると `onClose` の `setError(null)` でエラーが破棄されることを確認
- **手順:** 該当呼び出し側のユニットテストで「error 設定 → onClose 発火 → 行内/dialog どちらにも error が残らない」を検証
- **期待結果:** キャンセル後にエラーが行内 `FORM_ERROR` へ再出現しない

## 既存機能への影響確認

- A 群 8 ファイルの削除・破棄フローの成功パス（成功時 close / navigate アンマウント）が従来どおり動くこと
- rename（TagActions）・commit（Ingestion 系）など削除以外のエラー表示が従来の行内/フォーム内表示のまま変わらないこと

## 確認チェックリスト

- [ ] `pnpm test:unit` 全緑（ConfirmDialog 新規テスト含む）
- [ ] `pnpm typecheck` 通過
- [ ] `./node_modules/.bin/biome check --write` でフォーマット/lint クリーン
- [ ] `IngestionPreviewForm.test.tsx` 回帰なし
- [ ] ブラウザで削除ダイアログのレイアウトが崩れない
- [ ] 成功時のダイアログクローズ/アンマウントが従来どおり

## 補足: 認証必須ルートのブラウザ検証手順

dev D1 は `.wrangler/state/v3/d1/<id>.sqlite`。sessions テーブルに生トークンを直挿しし、`eval document.cookie` で `__Host-session` を注入する（`cookies set` は http で弾かれる）。詳細は過去の `.issue/*/manual-test/` 記録を参照。
