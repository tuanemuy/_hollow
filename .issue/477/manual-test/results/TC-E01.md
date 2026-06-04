# TC-E01: pending 中は閉じられない

**結果**: PASS（注記あり）
**セッション**: verify-tc-e01

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | モーダルを開きステータスを変更→「公開状態を更新」押下直後の状態を高頻度サンプリング | pending 中は × ボタンが disabled（closable=false） | t=25ms のサンプルで `updText="適用中..."`・**`xDisabled=true`**・dialog 残存 を捕捉。pending 中に × が disabled になることを確認 | PASS |
| 2 | pending 中に Esc を試す | 処理完了までモーダルは閉じない | pending フラグの反映が1tick遅れ、ローカル応答が高速すぎて「pending 中の Esc」を確実な瞬間で分離捕捉できず（Esc を撒いても pending が立つ前に処理完了→閉鎖）。×が disabled である事実（closable=false の根拠）で代替確認 | 注記 |

## スクリーンショット

- Step 1 (pending 捕捉): `screenshots/tc-e01/step-01-pending-captured.png`
- Step 2 (最終): `screenshots/tc-e01/step-02-final.png`

## 確認ポイント

- pending 中 × ボタンが disabled: PASS（`xDisabled=true` を pending サンプルで捕捉）
- pending 中 Esc/閉じる で閉じない: 直接の分離捕捉は困難（注記）。実装は `closable=false` を × disabled として表出しており、同フラグが Esc/オーバーレイ閉鎖もゲートする設計とみられる

## 注記

- タスク指示どおり、ローカルは応答が速く pending が瞬間的すぎて「pending 中の Esc/閉じる操作」を確実に捕捉するのは困難。FAIL ではなく注記扱いとする。
- ただし「pending 中に × ボタンが disabled になる」決定的証拠は捕捉できた（`適用中...` 表示と同時に `xDisabled=true`）。これは `closable=false` の挙動を裏付ける。
- agent-browser にネットワークスロットリング機能がないため、pending 窓を意図的に広げられなかった。実ブラウザの DevTools で Slow 3G 等にして再確認すると、Esc/閉じるの無効化も明示的に観察できる見込み。
