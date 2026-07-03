# TC-regression: 既存 REST provider の非回帰

結果: **PASS**

## 前提・環境
- サーバ: http://localhost:3001（起動済み・env ロック解除済み）
- keyless 免除が REST プロバイダに波及していないことの確認。保存は行わない。

## 操作 / 期待 / 実際 / 判定

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | プロバイダで「Deepgram」(REST) を選択 → snapshot | 選択が反映される | combobox 値が「Deepgram」に変わり option[selected] が移動 | PASS |
| 2 | API キー入力欄を確認 | 通常の API キー入力欄が表示される（keyless 免除が波及していない）| 通常の「新しい API キー」textbox（required）が表示。「プロバイダの変更 — API キーの再入力が必要」アラートも表示。モデルは `nova-3` に自動セット。keyless 分岐（「不要（Cloudflare が管理）」）にはならない | PASS |
| 3 | select の選択肢を確認 | OpenAI / Deepgram / Gemini / Deepgram (Workers AI) の4択 | 4択すべてが並ぶことを確認 | PASS |

## 判定根拠
- REST 版 Deepgram では従来どおり API キー入力欄が必須表示され、Workers AI のキーレス免除が波及していない。
- プロバイダ切替時の「API キー再入力が必要」ゲート表示も REST では従来どおり機能。
