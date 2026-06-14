# TC-rec-7: マイク権限拒否時のフォールバック（AC-4, 項目7）

- **対応 AC:** AC-4
- **判定:** PASS

## 検証手順と観測

1. `/upload` で「録音を開始」ボタン（idle）をクリック。
2. agent-browser ヘッドレス環境にはマイクが無く `navigator.mediaDevices.getUserMedia({audio:true})` が reject。
3. 2 秒後の DOM を確認。

## 結果（PASS）

UI が **permission-denied 状態** に遷移し、以下のフォールバックを表示:

- タイトル: 「マイクを使用できませんでした」
- 本文: 「マイクの使用が許可されていないか、利用できる録音デバイスがありません。ブラウザの権限設定を確認するか、上のファイルアップロードから音声ファイルを取り込んでください。」

確認ポイント:

- **未捕捉例外でクラッシュしない**: クリック後も `/upload` に留まり、`h1="アップロード"`・DropZone（file input）健在。
- **エラー画面に飛ばない**: AppErrorFallback / エラーバウンダリ文言（「問題が発生」「エラーが発生」）は表示されず（`errorBoundary:false`）。
- **コンソールに未捕捉例外なし**: Vite/React/router の良性警告のみ。
- **ファイルアップロードへの誘導あり**: 本文が明示的に「上のファイルアップロードから音声ファイルを取り込んでください」と誘導。

`getUserMedia` の reject を `AudioRecorder.tsx:177` の `catch` が拾い `permission-denied` 状態へ遷移（権限拒否・デバイス無し・insecure-context をまとめてフォールバック）する設計どおり。
