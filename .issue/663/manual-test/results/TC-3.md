# TC-3: `pnpm dev`（Vite）の既存 InlineRelayTrigger 挙動が退行しないこと（AC-4）

**結果**: PASS
**実行時間**: 2026-06-13（エクスポート実行 07:23:15 → ジョブ完了確認 07:23:19、約4秒。全体3分以内）
**セッション**: verify-tc-003

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | wrangler dev (pnpm start) を停止しポート解放確認 | ポート解放 | PID kill 後、残存 node(36340) も終了し 3000/8787 解放 | PASS |
| 2 | `pnpm dev` 起動・ヘルスチェック | 200 | Vite が http://localhost:3000 で待ち受け、`curl /` → 200 | PASS |
| 3 | `__Host-session=dev-admin-session-token` cookie 注入後にトップを開く | ログイン状態 | Dev Admin (dev-admin@example.com) でログイン済み、ノート14件表示 | PASS |
| 4 | 選択モードで Test Note 14 / 13 を選択し一括エクスポート（HTML）を実行 | ジョブ作成・詳細画面へ遷移 | ダイアログ「2 件のノートをエクスポート」（HTML 既定選択）→ 実行 → エクスポートジョブ詳細画面へ遷移 | PASS |
| 5 | ジョブが即時〜数秒で完了 | 完了に到達 | 実行から約4秒後のスナップショットで「ステータス: 完了」「完了日時」「ダウンロード」ボタン表示 | PASS |
| 6 | dev ログに inline dispatch の痕跡 | `[relay-trigger] inline dispatch drained` あり | /tmp/manual-test-dev.log L1062（07:23:15 直後）: `[relay-trigger] inline dispatch drained 6 { processed: 6 }` | PASS |
| 7 | ダウンロード URL が 200 | 200 | 署名付き URL `http://localhost:8787/dev/r2/hollow-local-objects/exports/.../019ebdee-acdf-76fe-b924-2f2fbcb617ce.zip?X-Amz-...` を curl → **200** | PASS |

## 備考

- 署名付きダウンロード URL は `R2_S3_ENDPOINT`（http://localhost:8787/dev/r2）宛て・`X-Amz-SignedHeaders=host` で発行されるため、Vite dev 単独稼働中（8787 停止中）は到達不可。検証用 wrangler サーバー再起動後（署名の有効期限 300 秒内）に curl し 200 を確認。Vite dev と wrangler はローカル R2 状態を共有しており、オブジェクト自体は正しく書き込まれている。
- `drained 6` は今回のエクスポート起因イベント＋未処理 outbox 残の一括ドレイン。ジョブ完了とダウンロード成功により AC-4 の退行なしを確認。
