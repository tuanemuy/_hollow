# TC-rec-4: 音声ファイルアップロード導線（AC-3, DropZone の audio 受理のみ）

- **対応 AC:** AC-3
- **判定:** PASS（受理導線のみ。実文字起こし→ノート化は SKIP=キー未設定）
- **担当範囲:** 取り込み画面のファイル選択/DropZone が音声形式を受理する導線になっているかを snapshot とコードで確認。

## 検証手順と観測

1. `http://localhost:3000/upload` を開き snapshot 取得。DropZone（`LabelText "ファイルをドラッグ&ドロップ またはクリックして選択複数選択にも対応"`）と AudioRecorder（`button "録音を開始"`）が表示されることを確認。
2. file input の属性を eval で確認:
   `{"found":true,"accept":null,"multiple":true}`

## 結果

- DropZone の `<input type="file">` には **`accept` 属性が無い**（`accept: null`）。OS のファイルピッカー段階では全形式を受理し、音声受理の判定は **クライアントガード**（`UploadForm.validateUploadFiles` → `IngestionService.detectKind`）に委ねる設計。
- `IngestionService.detectKind` は `audio/` MIME プレフィックス（`app/core/domain/ingestion/service.ts:43`）と拡張子 `mp3/wav/m4a/flac/ogg/webm`（同 76-81 行）を `audio` kind に分類する。
- 対応形式ラベル（`SUPPORTED_FORMATS_LABEL`, `UploadForm.tsx:39`）に「音声」が含まれる。
- 実機検証（TC-rec-edge2）で WAV ファイルが DropZone に受理され、サーバーへアップロードされる（=拒否されない）ことを確認済み。

## 結論

音声形式は DropZone で受理される。`accept` 属性ではなくクライアントガード方式だが、これは意図的設計（`UploadForm.tsx` の JSDoc / コメント参照）。実装漏れではない。
実際の文字起こし→ノート化（happy path）は `ADMIN_SPEECH_API_KEY` 未設定（Stub）のため **SKIP**。
