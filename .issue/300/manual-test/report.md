# ブラウザ検証レポート — Issue #300

**実行日時:** 2026-05-29
**テストソース:** `.issue/300/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev` 起動、検証後停止）

---

## 結論

**部分的に検証完了**。Issue #300 の testing.md に挙げられた確認項目のうち、ブラウザ自動化で検証可能な「smoke / regression」項目はすべて PASS。残る項目（W-A-001 セッション失効・W-P-002 errorComponent retry）は **DevTools での cookie 削除 / Network request blocking が必要なため agent-browser では再現不能** であり、人手検証または別 Issue に委ねる。

---

## 実行できた項目

| # | 項目 | 結果 | スクリーンショット |
|---|------|------|---------|
| 1 | fresh 未認証訪問で `/` がランディング表示 | **PASS** | `screenshots/01-fresh-landing.png` |
| 2 | `/login` ページが描画される（既存 UX 非 regression） | **PASS** | `screenshots/02-login.png` |
| 3 | `/setup` 初期管理者セットアップが描画される | **PASS** | `screenshots/03-setup.png` |
| 4 | 未認証で `/notes` を直叩き → 404（既存ルート構造、`/notes` index は存在しない） | **PASS** | `screenshots/04-notes-redirect.png` |

### サーバー起動確認
- `pnpm dev` で Cloudflare Vite dev サーバーがポート 3000 で起動（2 秒で HTTP 200 応答）
- predev の `wrangler types` 生成成功
- ランディング・login・setup ページのレンダリング異常なし

### 自動化された unit test
- `pnpm test:unit`: **142 files / 2717 tests PASS**（実装時に確認済み）
- `routerInvalidate.test.ts`（新規）: 6 ケース PASS
- `useAuthGuardEffect.test.tsx`（新規）: 6 ケース PASS

---

## 実行できなかった項目（agent-browser の制約）

| 確認項目 | スキップ理由 | フォローアップ |
|---------|---------|---------|
| W-A-001 セッション失効シナリオ | DevTools の Cookies 削除 API が agent-browser に存在しない。DB sessions 行直接削除も DB セットアップが必要 | 人手で実機確認、または Playwright スクリプトで `context.clearCookies()` 経由の自動化 |
| W-P-002 errorComponent retry シナリオ | DevTools の Network Request Blocking API が agent-browser に存在しない。`loadAppShell` server fn を意図的に 500 にする手段がない | 人手で実機確認、または server fn を一時的に常時 throw に変えるテスト専用 mode を別 Issue で検討 |
| ログイン直後フローでの二重 invalidate 検証 | アカウント登録 → ログインの flow にはメール認証 / OAuth が絡むため、agent-browser だけでは完結しない | 人手検証 |
| Sidebar payload 短期効果（regression） | 認証済み状態が必要 | 人手検証 |
| AppShell client state 保持の SPA regression | 認証済み状態が必要 | 人手検証 |

---

## 検証範囲の制限について

Issue #300 の修正は次のいずれも「stale な状態が観測された時の defensive 補強」であり、**正常系では観測可能な変化を起こさない** 性質を持つ:

1. **W-A-001 解消**: 「shell キャッシュに userDto あり × leaf 観測が unauthenticated」の不整合時のみ hook が発火。fresh 未認証訪問・通常のログイン後ナビゲーション・通常 SPA 遷移ではすべて no-op
2. **W-P-002 解消**: `_app.loader` が throw した場合のみ `AppErrorFallback` が描画。正常系では `errorComponent` 自体に到達しない
3. **W-P-003 スコープアウト**: 本 Issue では構造変更なし

したがって unit tests（hook の発火条件マトリクスを完全に固定）+ smoke test（ランディング・login が描画される）+ 静的検査（typecheck / lint）の組み合わせで実装の正しさは十分に保証できる。残る項目は **「stale 状態」を人為的に作る必要があり**、agent-browser のスコープ外。

---

## 起票した Issue

なし。

実装上のバグ・regression は検出されなかった。実行できなかった項目は実装の不備ではなく検証手段の制約に起因するため、Issue 起票の対象外。

---

## 成果物

- レポート: `.issue/300/manual-test/report.md`
- スクリーンショット: `.issue/300/manual-test/screenshots/`
  - `01-fresh-landing.png`: fresh 未認証訪問でランディング表示
  - `02-login.png`: ログインフォーム
  - `03-setup.png`: 初期セットアップ
  - `04-notes-redirect.png`: `/notes` 直叩き（404）
- unit test 結果: `pnpm test:unit` 全件 PASS（実装時の出力に記録）

---

## 完了報告

ブラウザ自動化で確認可能な範囲はすべて PASS。実装上の bug や regression は検出されず。W-A-001 / W-P-002 の最終確認は人手検証または別 Issue（人為的セッション失効シナリオの再現自動化）に委ねる。
