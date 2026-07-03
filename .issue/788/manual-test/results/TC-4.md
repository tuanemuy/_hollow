# TC-4: 接続テストが keyless ゲートを抜ける（AC-3・ゲート通過まで）

結果: **PASS**

## 前提・環境
- サーバ: http://localhost:3001（起動済み・env ロック解除済み）
- TC-3 で `deepgram-workers-ai` / `@cf/deepgram/nova-3` を保存済みの状態
- ローカルは Workers AI (`env.AI`) binding 未注入。ゲート通過後に ping が binding 不在で失敗するのは想定内。

## 操作 / 期待 / 実際 / 判定

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | 「接続テスト」ボタン押下 → wait → snapshot | ゲートで短絡せず adapter.ping まで到達 | ステータス「接続失敗 · AI binding is not configured」を表示 | PASS |
| 2 | 表示メッセージを精査 | 「No api key available」「API key is empty」等のキー不在ゲート短絡で失敗していない | メッセージは「AI binding is not configured」= adapter.ping まで到達した証拠。キー不在ゲートによる短絡失敗ではない | PASS |

## 判定根拠
- keyless プロバイダのため API キーゲートを免除し、そのまま接続確認（`env.AI` binding 検査）に進んでいる。
- ローカルでは AI binding 未注入のため「AI binding is not configured」で ping が失敗するのは想定内であり、これは adapter.ping まで到達した肯定的証拠。仕様どおり PASS 扱い。
- 「No api key available」等のキー不在短絡メッセージは一切出ていない（keyless 分岐の欠陥なし）。
