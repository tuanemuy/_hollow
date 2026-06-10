# ブラウザ検証レポート — Issue #616

**実行日:** 2026-06-10
**テストソース:** .issue/616/testing.md
**サーバー:** http://localhost:3000/（`pnpm dev`、未認証で LP 到達可能）

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | Teaser「公開検索を試す」→ /search | 正常系 | PASS |
| TC-002 | Footer「公開検索」→ /search | 正常系 | PASS |
| TC-003 | Footer に「エクスポート」リンクが無い | 正常系 | PASS |
| TC-004 | ヘッダーロゴ → /（回帰） | 回帰 | PASS |

**合計:** 4 件（PASS: 4 / FAIL: 0）

## 確認結果

- Teaser「公開検索を試す」: `http://localhost:3000/search?q=&limit=20` へ遷移、検索ページ（h1「公開ノートを検索」）描画を確認。ホーム `/` には戻らない。
- Footer「公開検索」: 同上 `/search?q=&limit=20` へ遷移。
- Footer「プロダクト」列: 「機能（→#features）/ 公開検索（→/search）」の 2 項目のみ。「エクスポート」テキスト・リンクは存在しない（フッター全体で NOT FOUND）。
- ヘッダー Hollow ロゴ: `/`（ホーム）へ遷移。`/search` でないことを確認（従来挙動を維持）。
- ランタイムのコンソールエラーなし（検出された警告は TanStack Router のビルド時最適化通知でランタイムエラーではない）。

## 補足

agent-browser の座標クリックがフォールド外要素に届かないケースがあり、teaser リンクは要素の `.click()` で遷移を確認した。href / onclick はいずれも `/search` を正しく指しており、テストツール起因であってアプリ側の問題ではない。

## スクリーンショット

- screenshots/step-01.png — LP teaser セクション
- screenshots/step-02.png — teaser クリック後の検索ページ
- screenshots/step-03.png — フッター
- screenshots/step-04.png — footer 公開検索クリック後の検索ページ
- screenshots/step-05.png — フッター「プロダクト」列
- screenshots/step-06.png — ロゴクリック後のホーム
