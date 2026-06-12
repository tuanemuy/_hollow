# TC-1: ジョブ型一括エクスポートが pnpm start で完走する（AC-1）

Round 2（build:local 修正後）

Round 1 の FAIL 概要: ジョブが約107秒経過しても「待機中」のまま進行せず、サーバーログに inline dispatch の痕跡なし（修正前ビルドで InlineRelayTrigger が無効だったため）。

**結果**: PASS
**実行時間**: 2026-06-13（エクスポート実行から完了確認まで約3秒、全体で3分以内）
**セッション**: verify-tc-001

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | cookie 注入後 http://localhost:8787 を開く | ログイン状態 | Dev Admin (dev-admin@example.com) でログイン済み | PASS |
| 2 | ノート件数確認 | 2件以上 | 既存ノート14件（Test Note 01〜14）あり、作成不要 | PASS |
| 3 | 選択モードで Test Note 14 / 13 を選択し一括エクスポート（HTML）を実行 | ジョブ作成・詳細画面へ遷移 | ダイアログ「2 件のノートをエクスポート」→ 実行 → ジョブ詳細画面へ遷移 | PASS |
| 4 | ステータスが「待機中」から完了まで進行 | 完了に到達 | 遷移後約3秒のスナップショット時点で既に「ステータス: 完了」「完了日時」表示、「ダウンロード」ボタン表示 | PASS |
| 5 | ダウンロード URL（/dev/r2/...）が 200 | 200 | 署名付き URL `http://localhost:8787/dev/r2/hollow-local-objects/exports/.../019ebde6-36b3-7489-8104-83715024de2c.zip?X-Amz-...` を curl → **200**（署名なし素 URL は 403 = presign が機能） | PASS |
| 6 | サーバーログに inline dispatch の痕跡 | `[relay-trigger] inline dispatch drained` あり | /tmp/manual-test-server.log L6235: `[relay-trigger] inline dispatch drained 2 { processed: 2 }` | PASS |

## 備考

- ブラウザのダウンロードボタン経由のアクセスもサーバーログで `GET /dev/r2/.../*.zip 200 OK` を確認（L6245）。
- 進捗表示は「0/0」のままだったが、ステータスは「完了」に到達しダウンロードも成功しているため AC-1 は満たす。
