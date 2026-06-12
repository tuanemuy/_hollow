# ブラウザ検証レポート — Issue #663

**実行日**: 2026-06-13
**テストソース**: .issue/663/testing.md
**結果**: 5/5 PASS（FAIL 0、起票 Issue なし）

## 概要

`pnpm start`（wrangler dev）でジョブ型エクスポートが完走することを E2E で検証した。Round 1 で TC-1 が FAIL し、原因分析の結果「`pnpm build` 後の `wrangler dev` は redirected config（`.wrangler/deploy/config.json` → `dist/server/wrangler.json`）経由で production ビルドを実行するため、DCE でインライン経路自体が存在しない」ことが判明。`pnpm build:local` スクリプトを追加して解消し、Round 2 で全件 PASS した。

## 結果詳細

- 個別結果: `results/TC-1.md`〜`TC-4.md`, `results/EC-1.md`
- サマリー: `results/summary.md`
- シードデータ: `seed-data.md`（dev-admin + ローカル D1）

## エビデンス要点

- TC-1: ジョブ完了まで数秒、サーバーログに `[relay-trigger] inline dispatch drained 2 { processed: 2 }`、ダウンロード URL（/dev/r2/...zip）200
- EC-1: var を外して再ビルド・再起動すると元症状（待機中のまま・dispatch ログ 0 件）を再現 → ゲートが実際に効いている
- TC-3: `pnpm dev` で `drained 6 { processed: 6 }`、退行なし

## クリーンアップ

- agent-browser 全セッション close 済み
- wrangler.toml は原状復帰済み（`DEV_INLINE_RELAY = "true"`）
- 検証サーバーはレポート作成後に停止
