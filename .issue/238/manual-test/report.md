# ブラウザ検証レポート — Issue #238: UI に「破棄済みを表示」トグルを追加

**実行日**: 2026-05-29
**テストソース**: `.issue/238/testing.md`
**サーバー**: http://localhost:3001/（`pnpm dev`、Cloudflare Workers ローカルランタイム）
**ツール**: agent-browser 0.27.0

## 結果概要

| 指標 | 値 |
|------|----|
| テストケース | 7 |
| PASS | 7 |
| FAIL | 0 |
| 起票Issue | 0 |

全テストケース PASS。検証の過程で hand-typed `?includeDiscarded=1`（数値）が
ON 判定されない実装バグを発見し、変更箇所起因かつ即時修正可能だったため
Phase 2 で修正・再検証して解消した（詳細は `results/summary.md` / ADR-001 補足）。

## 確認できたこと（完了条件との対応）

- [x] `/upload` に「破棄済みを表示」トグルがある（既定 OFF）— TC-002
- [x] トグル OFF のとき `discarded` が非表示 — TC-002 / TC-005
- [x] トグル ON のとき `discarded` を含む全ステータスが表示される — TC-003
- [x] URL クエリパラメータでトグル状態が保持される（リロード耐性）— TC-003 / TC-004
- [x] 破棄済みカードが視覚的に区別できる（「破棄済み」バッジ＋トーンダウン）— TC-003
- [x] `validateSearch` で型安全に扱う（不正値でルートが壊れない）— TC-006
- [x] hand-typed `=1` / `=true` の truthy URL で ON — TC-007（修正後）

## スクリーンショット

- TC-001: `screenshots/tc-001/login-done.png`
- TC-002: `screenshots/tc-002/upload-off.png`
- TC-003: `screenshots/tc-003/upload-on.png`
- TC-004: `screenshots/tc-004/reload-on.png`
- TC-005: `screenshots/tc-005/upload-off-again.png`
- TC-006: `screenshots/tc-006/invalid-url.png` / `invalid-url-recheck.png`
- TC-007: `screenshots/tc-007/url-1.png`（修正前FAIL）/ `url-1-fixed.png`（修正後PASS）/ `url-true.png`

## 成果物

- シードデータ: `seed-data.md` / `seed.sql`
- サーバー情報: `server-info.md`
- 結果サマリー: `results/summary.md`
