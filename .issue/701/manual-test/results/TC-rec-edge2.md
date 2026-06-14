# TC-rec-edge2: Speech 未設定（Stub）で音声取り込みは markFailed（AC-6 境界 / ADR-005）

- **対応 AC:** AC-6（縮退対象スコープの境界）
- **判定:** PASS

## 検証手順と観測

1. 最小の有効 WAV ファイルを生成（`/tmp/tc-rec-edge2.wav`, 60 バイト, 8-bit mono 8000Hz PCM）。`file` コマンドで `RIFF (little-endian) data, WAVE audio` と認識される正当な音声。
2. `/upload` の DropZone（`input[type=file]`）にアップロード。クライアントガード `detectKind('audio/wav','...wav')`→`audio` で受理され、サーバーへ送信。
3. `ADMIN_SPEECH_API_KEY` 未設定（=`StubSpeechRecognitionProvider` フォールバック）の状態で取り込みパイプライン（dev のインライン経路）を通過。
4. キューを再読込して結果を確認。

## 結果（PASS）

- ジョブ `tc-rec-edge2.wav` の状態は **「失敗」**。**「プレビュー可能」に到達しない**（=`markFailed`）。
- アクションは **「再試行 / 破棄」**（失敗ジョブの affordance）。previewing 用の「ノートとして保存 / 編集 / 再生成」ではない。
- 失敗理由アラート: 「このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください」
  - これは Stub の `BusinessRuleError('unsupported_format')` 由来。
- **縮退プレビュー（注記入り空本文）が出ないこと**を確認: `hasFailureNote:false`。本文 `<p class="ingestion-failure-note">文字起こしに失敗しました。録音は保存されています。…</p>` はページ内に**存在しない**。

## 結論

ADR-005 / plan.md Round 2 arch P-001 の境界どおり。縮退プレビュー（degraded preview）の対象は **設定済みプロバイダの `SpeechFailureError` のみ**で、Stub の `unsupported_format` は対象外。未設定（Stub）では従来どおり `markFailed` し、縮退で隠さない。

コード照合: `runIngestionJob.ts:564` `if (isSpeechFailureError(error)) return ""` は `SpeechFailureError` のみ縮退（空文字→audio空本文分岐）。Stub の `BusinessRuleError(UnsupportedFormat)` は `isSpeechFailureError` で false のため propagate → `markFailedSafely`。実機挙動が一致。
