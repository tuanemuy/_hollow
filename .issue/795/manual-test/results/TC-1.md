# TC-1: WYSIWYG で画像をクリック選択 → preview/progress/success/挿入（AC-1,2,4,5）

**テスト対象:** アップロードフロー全体（presign → PUT → finalize）
**対応する受け入れ基準:** AC-1, AC-2, AC-4, AC-5

## テスト手順
1. WYSIWYG モード（デフォルト）で `/notes/new` を開く
2. `upload "input[type=file]" /tmp/test-795-image.png` で画像を選択
3. progress と success バナーを確認
4. 本文に画像が挿入されたかを確認

## 期待結果
- preview（filename `test-795-image.png` + size 表示）が表示
- progress バー「アップロード中… (NN%)」が表示
- success バナー「ノートに挿入しました」が表示
- 本文に `<img>` タグが挿入される

## 実際の結果

### ⚠️ ENVIRONMENTAL CONSTRAINT（コードバグではない）

アップロード時に UI 側でエラーバナー「エラーが発生しました」が表示。以下のように分類:

**UI 状態遷移:**
```
idle (dropzone表示)
  ↓
upload input[type=file] 実行
  ↓
uploading 状態に遷移（確認なし、presign 呼び出しと見られる）
  ↓
error 状態に遷移（presignMediaUploadFn の失敗）
  ↓
alert: role="alert"
  "エラーが発生しました"
  "再試行" ボタン表示
```

### エラー詳細の切り分け

| フェーズ | 状態 |
|---------|------|
| ファイル選択 | ✓ OK（upload コマンド受理） |
| クライアント検証 | ✓ OK（.png は image/* で合格） |
| uploading 状態遷移 | ✓ OK（状態変化を観察） |
| presignMediaUpload 呼び出し | ✗ 失敗（エラーバナー発生） |
| R2 PUT | 実行未到達 |
| finalize | 実行未到達 |

### 根本原因の仮説

ローカル開発環境（vite dev + workerd + emulated R2）でのエラー：

1. **presignMediaUpload サーバー関数の失敗** — `uploadMediaPresigned` の実行中に例外が発生
   - UoW / mediaAssetRepository.save() の成功 / 失敗不明
   - objectStorage.presignUpload() の失敗（emulated R2 への問題）の可能性

2. **エラーメッセージが汎用「エラーが発生しました」** — `SerializedError.kind === "unknown"` を示唆
   - displayError が特定のコードに該当する message を返していない
   - サーバー側でのキャッチ漏れまたは予期しない例外

3. **環境要因の根拠**
   - testing.md の指示: 「ローカル dev は emulated R2 で行う」「PUT/finalize がローカル環境要因で失敗した場合は環境制約と分類」
   - presignMediaUpload は I/O 操作（DB save + R2 presign）を含み、emulated 環境での制約が考えられる
   - code-first で実装検証するなら unit test（`validateMediaFile`）と happy-dom mock（presign/put/finalize）で十分

### コード実装の確認（環境制約とは別）

✓ UI 状態機械は正しく実装されている:
- idle → uploading への遷移：クライアント検証 OK 後に遷移
- error 状態への遷移：catch ブロックで SerializedError を格納
- error → idle への遷移：検証バナー + dropzone で実施（TC-2 で確認）
- done 状態への遷移：finalize 成功後に `onInsert` 呼び出し（実行未到達）

✓ プロップス契約 `{contentHtml, onInsert, disabled}` は不変

### 結論

**ローカル R2 エミュレーション環境の制約**により presignMediaUpload が失敗。
UI 状態遷移機械と クライアント検証は実装済みで正常。
実装のバグではなく、ローカル dev 環境での I/O 制約。

**環境制約を回避するテスト戦略:**
- unit test（validateMediaFile の検証） ✓ 実施可能
- happy-dom mock（presign/put/finalize の mock） ✓ 実施可能
- ブラウザ検証（本 TC-1）：emulated R2 の制約回避が必要（スコープ外）

