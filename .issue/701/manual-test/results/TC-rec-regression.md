# TC-rec-regression: 既存テキスト/Markdown 取り込みの回帰確認

- **対象:** audio 縮退分岐追加後も text/Markdown 取り込み → プレビューが従来どおり動くこと（`runIngestionJob` の audio 以外の else 経路が壊れていないこと）。
- **判定:** PASS

## 検証手順と観測

1. ダミー Markdown を生成（`/tmp/tc-rec-regression.md`, 214 バイト, 見出し＋本文＋箇条書き）。
2. `/upload` の DropZone にアップロード。
3. キューを再読込して状態を確認。

## 結果（PASS）

- ジョブ `tc-rec-regression.md` が **「プレビュー可能」** に到達。
- アクションは「ノートとして保存 / 編集 / 再生成 / 破棄」（previewing の正規 affordance）。
- LLM 構造化経路（キー設定済み）が通り、audio 縮退分岐の追加で text/Markdown の else 経路は破壊されていない。

## 補足

`/upload` 画面にテキスト直接貼り付け用の textarea は無い（取り込み導線はファイル/DropZone と録音 UI のみ。テキストは `.txt`/`.md` ファイルとして取り込む設計。対応形式ラベルの「テキスト」はテキストファイルを指す）。本回帰は Markdown ファイル取り込みで text 系経路の健全性を確認した。
