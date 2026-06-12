# TC-2: determinate 進捗バー（AC-6 / .issue/655/testing.md 確認項目1 再実行）

**結果**: PASS
**実行時間**: 約4分（スロットリング調査含む。最終試行は約25秒）
**セッション**: verify-tc-2

## 環境
- サーバー: http://localhost:8787（wrangler dev、ポート8787固定）
- ネットワーク: CDP `Network.emulateNetworkConditions` で uploadThroughput=60,000 B/s（Fast 3G 以下相当）、latency=50ms に制限
  - 注: agent-browser に throttling コマンドがないため、`get cdp-url` の browser WS に node から接続し、page target にセッションを保持したまま emulation を適用（CDP セッション切断で emulation が解除されるため、バックグラウンドで接続を維持）
- テスト画像: /tmp/tc2.png（ランダムノイズ PNG、936,803 bytes < 1MiB）

## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | テスト画像生成（936,803 bytes < 1MiB） | 制限内の PNG | 520x600 ランダムノイズ PNG | PASS |
| 2 | cookie 注入 → http://localhost:8787 → 「新規作成」でノート編集画面 | エディタ表示 | 「新規ノート」フォーム表示 | PASS |
| 3 | CDP でアップロード帯域を 60KB/s に制限 | PUT が数秒以上かかる | PUT duration ≈ 15.7s（performance resource entry で確認） | PASS |
| 4 | DOM ポーラー（150ms 間隔）を設置して「メディアを追加」に画像を upload | アップロード中表示をサンプリング | 105 サンプル取得 | PASS |
| 5 | 「アップロード中…（n%）」テキストが n 増加で表示 | n が単調増加 | 「アップロード中…」（presign 中、% なし）→ 10% → 19% → 30% → 38% → 49% → 58% → 68% → 77% → 87% → 96% → 100% | PASS |
| 6 | ProgressBar が determinate（幅が増える） | fill 幅が 0→100% に追従、pulse のままでない | presign 中のみ indeterminate（pulse）、最初の progress イベント以降は fill の style.width がテキストの % と常に一致（10%〜100%） | PASS |
| 7 | 完了後ノート本文に `<img>` 挿入 | `<img src="/media/<id>">` | `img src="/media/019ebc9d-b58d-71d9-af5b-1b6c91b24a1d"` が本文に挿入、エラー表示なし | PASS |

## 補足
- ProgressBar は `decorative`（`aria-hidden`、`role="progressbar"` なし）で描画される。これは PR #656 Round 1 W-001 対応（aria-live テキストと進捗バーの二重アナウンス回避）どおりの仕様。determinate 判定は fill 要素の `style.width` 追従で確認した。
- presign / finalize フェーズは進捗ソースがないため indeterminate（pulse）表示 — JSDoc 記載どおりの挙動。

## 失敗詳細
なし
