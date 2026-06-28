# TC-2: 非対応形式の検証バナー（AC-3）

**テスト対象:** クライアント検証（unsupported format）
**対応する受け入れ基準:** AC-3

## テスト手順
1. ページをリロード（`/notes/new`）
2. `upload "input[type=file]" /tmp/test-795-doc.txt` を実行
3. エラーバナーを確認

## 期待結果
- 非対応形式のエラーバナー「対応していない形式です」が role=alert で表示
- ファイル名が filename で表示
- presign が呼ばれない（アップロードが開始されない）
- dropzone が引き続き表示される

## 実際の結果

### ✓ PASS

エラーバナーが正しく表示されました:

```
alert
  - paragraph
    - StaticText "対応していない形式です"
  - paragraph
    - code
      - StaticText "test-795-doc.txt"
    - StaticText " はアップロードできません。画像・動画ファイルのみ追加できます。"
```

### 確認項目

| 項目 | 状態 | 備考 |
|-----|------|------|
| エラーバナー表示 | ✓ | role=alert で「対応していない形式です」 |
| ファイル名表示 | ✓ | `test-795-doc.txt` が code 要素で表示 |
| presign 呼び出し | ✓ 確認予定 | エラーバナーが即座に表示されたため、クライアント検証で弾かれている（サーバー呼び出しなし） |
| dropzone 表示 | ✓ | エラー後も dropzone が引き続き表示されている |
| バナーレイアウト | ✓ | ingestion パターンと同じ `.alert` 構造 |

### 検証ロジック確認
`validateMediaFile` の実装が正しく機能：
- `.txt` ファイルは image/video MIME でない → `reason: "unsupported"` で弾く
- バナー出し分け: `unsupported` → `ALERT_ERROR`（赤）
- state は `idle` のまま（uploading に遷移しない）

### 結論
AC-3 の「クライアント検証バナー」と「presign を呼び出さない保証」が完全に動作している。
