# TC-rec-6: 録音UI 状態機械（AC-4, 項目6）

- **対応 AC:** AC-4
- **判定:** PARTIAL PASS（idle 状態を確認。recording/stopped/discard/re-record はヘッドレスにマイクが無く到達不能=SKIP）

## 検証手順と観測

1. `/upload` の AudioRecorder（idle 状態）を確認:
   - 見出し: 「マイクで録音して取り込む」
   - 説明文: 「録音した音声は文字起こしして新規ノートにします。最大 30 分・24 MB まで。」
   - ボタン: 「録音を開始」

## 結果

- **idle 状態**: PASS。録音開始ボタン・説明文（上限値 30 分 / 24 MB 明示）を確認。
- **recording 状態（経過時間・サイズ表示）**: SKIP。agent-browser ヘッドレス環境にマイクデバイスが無く `getUserMedia` が拒否されるため、idle→recording に到達できない（代わりに permission-denied に遷移、TC-rec-7 参照）。
- **stopped / 取り消し / 再録音**: SKIP。recording に到達できないため検証不能。

## コード上の確認（参考）

`AudioRecorder.tsx` の状態機械は idle → requesting-permission → recording（経過秒・bytes 表示, `RecordingView`）→ stopped（プレビュー再生・取り込む/録り直す/取り消す, `StoppedView`）。discard は revoke→idle、reRecord は revoke→beginRecording。上限実装あり: `MAX_RECORDING_BYTES=24MiB`, `MAX_RECORDING_SECONDS=30分`、80%/90% で警告アラート、上限到達で auto-stop。

マイク使用可能環境での recording/stopped 検証は別途要（headless では不可）。
