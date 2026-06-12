# EC-1: `DEV_INLINE_RELAY` を外すとゲート OFF（元症状＝待機中のまま）に戻る

**結果**: PASS
**実行時間**: 2026-06-13（エクスポート実行後 約60秒観察、ビルド時間除き3分以内）
**セッション**: verify-tc-001

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | wrangler.toml の `DEV_INLINE_RELAY = "true"` をコメントアウト | - | 該当行のみコメントアウト | PASS |
| 2 | `pnpm build:local` で再ビルド（`.wrangler/deploy/config.json` が `dist/server/wrangler.json` にリダイレクトしており vars は dist 側に焼かれるため再ビルド必須） | dist の vars から消える | `dist/server/wrangler.json` に `DEV_INLINE_RELAY` なし | PASS |
| 3 | サーバー再起動（ログ: /tmp/manual-test-server-ec1.log）→ ヘルスチェック | 200 | 200。起動ログの env 一覧にも `DEV_INLINE_RELAY` なし（ゲート OFF 確認） | PASS |
| 4 | 選択モードで Test Note 14 / 13 を選択し一括エクスポート（HTML）実行 | ジョブ作成（エラーにならない） | ジョブ詳細画面へ遷移、「ステータス: 待機中」「進捗 0/0」、エラー表示なし | PASS |
| 5 | 約60秒後にリロードしてステータス確認 | 「待機中」のまま進まない（元症状再現） | リロード後も「ステータス: 待機中」。/tmp/manual-test-server-ec1.log に `relay-trigger` ログ 0 件 | PASS |
| 6 | 原状復帰: コメントアウトを戻す → `pnpm build:local` → サーバー再起動（ログ: /tmp/manual-test-server.log）→ ヘルスチェック | 稼働状態で終了 | dist に `"DEV_INLINE_RELAY":"true"` 復元、curl 200、起動ログに `env.DEV_INLINE_RELAY ("true")` | PASS |

## 備考

- ゲート ON/OFF が `DEV_INLINE_RELAY` 変数のみで切り替わることを確認。OFF 時はエラーにならず outbox に滞留する（Issue #663 の元症状）。
- EC-1 で作成した滞留ジョブ（待機中のまま）は dev DB に残存するが、テスト用シードのため放置。
