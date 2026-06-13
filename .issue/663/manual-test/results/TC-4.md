# TC-4: docs の記述が新挙動と一致している（AC-5）

**結果**: PASS
**実行時間**: 約1分（ドキュメント照合）
**セッション**: なし（ファイル照合）

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | docs/runtime_cloudflare.md「Local dev outbox dispatch」を読む | 旧記述「`pnpm start` ではインライン経路は無効」が消えている | 2段ゲート（DCEゲート＋実行時ゲート）の説明に置き換わっている | PASS |
| 2 | `DEV_INLINE_RELAY` ゲート・staging/production 禁止ルールの記載確認 | 記載あり | 「Never add `DEV_INLINE_RELAY` to staging/production toml」明記 | PASS |
| 3 | `pnpm build:local && pnpm start` 手順と redirected config の説明確認 | 記載あり | redirected config の仕組み・素の build では DCE 済みで動かない旨・DCE grep は素の build 成果物に対して行う旨を明記 | PASS |
| 4 | 二次 outbox イベント滞留の補足確認 | 記載あり | `runExportJob` は 1 kick で完了、`export.completed` 等の二次イベントは次の kick まで滞留、と明記 | PASS |
| 5 | TC-1/TC-3 の実挙動と突き合わせ | 記述どおり | TC-1（pnpm start で完走・drained ログ）/ TC-3（pnpm dev 退行なし）と一致 | PASS |
