# 残存課題 — Issue #228

## 1. 過大プロンプト入力時のエラー文言が汎用的（軽微・非ブロッカー）

- **内容**: 16 KiB を超えるカスタムプロンプトをアップロードフォームに入力すると、transport boundary（`uploadFileFn` → `readPromptOverride`）が `throw new Error("... exceeds maximum size")` でガードする。これは presentation の error serialization で汎用的な「エラーが発生しました」として表示され、ユーザーには「サイズ上限を超えた」ことが伝わらない。
- **理由**: 過大入力は DoS ガードが主目的で、16 KiB 超のプロンプトは通常運用ではほぼ発生しない pathological ケースのため、初回実装では汎用エラーに留めた。
- **影響範囲**: `app/components/ingestion/actions.ts`（`readPromptOverride`）と presentation の error display。ガード機能自体は正しく動作し、ジョブは不正状態にならない（ブラウザ検証 Edge-1 で確認済み）。
- **フォローアップ候補**: (a) textarea に `maxLength` 属性を付けてクライアント側で入力を抑止、または (b) transport で具体的な検証エラー（kind=validation）をスローしてユーザーに上限超過を明示。レビューフェーズで対応要否を判断する。

## 2. ブラウザ未実行のテストケース（自動テストでカバー済み）

- **TC-5（再生成時の override 保持）**: `runIngestionJob` 統合テストに「regenerate 後も同じ override が LLM に渡る」検証を実装済み。ブラウザでの再実行は省略。
- **Edge-2（html/markdown では structure override 無視）**: plan「既知の仕様上の制約」。`runPipeline` が html/markdown 分岐で `structureToHtml` を呼ばない設計上の帰結で、テストは LLM 経由 kind で担保。
