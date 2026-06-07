# ブラウザ検証レポート — Issue #545

**実行日:** 2026-06-08
**テストソース:** `.issue/545/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**認証:** admin（`pnpm seed:dev-admin` の `dev-admin`、cookie `__Host-session`）

## サマリ

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | P47 限度テーブルの狭幅行積層（本命） | 正常系 | PASS |
| TC-002 | P45 ユーザーテーブルの狭幅横スクロール | 正常系 | PASS |
| TC-003 | P46 ジョブテーブルの狭幅横スクロール | 正常系 | PASS |
| TC-004 | P40 ダッシュボード — 実値表示・虚偽数値なし | 正常系 | PASS |

**合計: 4 件（PASS: 4 / FAIL: 0）**

## 要点

- **TC-001（本命）**: `/admin/metrics` の限度テーブルが広幅(1280px)=2列テーブル、狭幅(390px)=行積層カードへ切替。computed style で `table→block` / `thead→none` / セル→block を確認。ラベル「項目」「値」は実 DOM の `<span>`（`hidden max-md:inline-block ... text-ink-tertiary text-xs`、色 ink-tertiary・11.73px）で狭幅のみ表示（ADR-004 どおり）。値は実値でダミーでない。セル潰れなし。
- **TC-002**: `/admin/users` は `min-w-[880px]` + `overflow-x-auto`。狭幅で `display:table` 維持（非積層）、scrollWidth 880 > clientWidth で横スクロール。
- **TC-003**: `/admin/jobs` の3テーブルすべて `min-w-[920px]` + `overflow-x-auto`。狭幅で非積層・横スクロール。
- **TC-004**: `/admin` は status banner + 4 metric-card のみ。全カード「取得失敗/—」（虚偽数値なし）。svg/canvas/table=0 でチャート・最近のアクティビティは未描画。「管理メニュー」案内は存在。

## 特記事項

- testing.md のリスク注記にあった **#471（`/admin/users` ローダーエラー）は本環境では再現せず**、正常描画されたため TC-002 は PASS。
- 起票した Issue: なし（全 PASS）。
