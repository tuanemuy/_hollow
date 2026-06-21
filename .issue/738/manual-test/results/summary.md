# テスト実行サマリー — Issue #738

**実行日時**: 2026-06-21
**テストソース**: .issue/738/testing.md
**サーバー**: http://localhost:3000（pnpm dev）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | provider select に Deepgram が出る（AC-3） | 正常系 | PASS | - |
| TC-002 | provider 切替で model 欄が nova-3 にリセット・placeholder/ヒント切替（AC-4） | 正常系 | PASS | - |
| 確認項目3 | env で model ロック時はリセット抑制（AC-4） | 正常系 | 間接確認 | - |
| 確認項目4 | Deepgram 接続テスト成功（AC-5） | 正常系 | SKIP | 実 Deepgram API キー必須 |
| 確認項目5 | Deepgram で実文字起こし → ノート保存（AC-6） | 正常系 | SKIP | 実 Deepgram API キー必須 |
| 異常系1 | Deepgram 認証失敗で接続テスト失敗（AC-5） | 異常系 | SKIP | 実 Deepgram API キー必須 |
| 異常系2 | Deepgram transcribe 失敗時の縮退（AC-6） | 異常系 | SKIP | 実 Deepgram API キー必須 |

**合計**: 検証可能項目 2 件（PASS: 2 / FAIL: 0）。API キー必須の 4 項目は SKIP。

## 補足
- **TC-002 の経緯**: 初回はデフォルト dev サーバーが `wrangler.toml [vars]` の `ADMIN_SPEECH_PROVIDER`/`ADMIN_SPEECH_MODEL` で env-lock され、実装が意図的に model リセットを抑制（= 確認項目3 AC-4 の env ロック抑制挙動が間接的に確認できた）。env override を一時的に外して再起動し AC-4 の核（双方向 model リセット）を PASS で確認後、wrangler.toml は元に戻した（git diff なし）。
- **model 欄観測値（TC-002 再検証）**: OpenAI `gpt-4o-transcribe` → Deepgram `nova-3` → OpenAI `gpt-4o-transcribe`。API キー placeholder `sk-...` ⇄ `Token ...`、model ヒント「例: gpt-4o-transcribe」⇄「例: nova-3」も連動。
- **SKIP 理由**: AC-5/AC-6 は有効な Deepgram API キー（`Token` 形式）が必要で、本環境では未保有のため実行不能。adapter 境界（2xx/4xx/5xx/timeout/空発話）・ping・registry dispatch・構成解決は自動テスト（pnpm test:unit / test:integration、全 pass）でカバー済み。
