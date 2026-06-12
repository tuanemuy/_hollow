# ブラウザ検証レポート — Issue #642

**実行日**: 2026-06-13
**テストソース**: .issue/642/testing.md
**サーバー**: http://localhost:3642（pnpm dev --port 3642、検証後停止済み）
**シードデータ**: .issue/642/.manual-test/seed-data.md（公開ノート26件・2ユーザー・3タグ・updated_at 全件異なる）

## 結果

12 件中 PASS 11 / FAIL 1（許容）。詳細は `results/summary.md`、各 TC は `results/TC-*.md` / `EDGE.md` / `REGRESSION.md`。

- 関連度順 ⇄ 新着順のトグル、URL 保持（`sort=newest` 付与・relevance で除去・後方互換）、cursor リセット、新着順ページネーション連続性、LIKE 経路、ファセット変更時の sort 維持、spec 更新、エッジ3種、回帰確認すべて PASS。
- TC-007（モックとの見た目整合）のみ、モバイル幅でボタン高さ 40.56px（モックは 44px）。同一ツールバーの既存チップと同じ `max-sm:h-11` ＋フルード root font-size によるプロジェクト全体の既存差異であり、本 Issue の回帰ではないため許容（`results/analysis.md`）。Issue 起票なし。
- P30 `/notes/search`（要ログイン）の回帰確認のみ SKIP（ログイン情報なし）。自動テスト（unit/integration）でソート未指定経路は回帰ガード済み。

## 起票した Issue

なし。

## 備考

- agent-browser の `click` が SPA リンク遷移を発火しないケースがあり、`eval` 経由の `element.click()` で代替（アプリ起因ではない）。
