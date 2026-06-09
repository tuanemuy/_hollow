# ブラウザ検証レポート — Issue #572: P22 アクティブセッション一覧

**実行日時:** 2026-06-09
**テストソース:** `.issue/572/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`、Cloudflare ランタイム）
**検証ツール:** agent-browser 0.27.1
**検証アカウント:** `dev-login@example.com` / `DevPassw0rd!2024`（`scripts/seed-dev-login.mjs` で投入、ローカル D1）

---

## サマリー

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | アクティブセッション一覧の表示 | 正常系 | PASS | 2セッションが端末ごと行表示。実データ一致 |
| TC-002 | 「このセッション」バッジ（isCurrent） | 正常系 | PASS | 現在セッション行のみ pill、失効ボタンなし |
| TC-003 | 行単位ログアウト（個別失効） | 正常系 | PASS | DB で 2→1 を実証。UI 再検証で行消失。対象セッションはログアウト |
| TC-004 | 既存一括失効ボタンとの共存 | 正常系 | PASS | 2→1。一覧UIと一括失効が破綻なく共存 |
| Edge-1 | セッションが現在の1件のみ | 異常系 | PASS | 1行＋バッジ、失効ボタンなし、レイアウト崩れなし |
| Sec-1 | session token の非露出 | セキュリティ | PASS | DOM 内に token 文字列ゼロ件 |
| Sec-2 | 時刻ラベル「ログイン日時」 | 表示正確性 | PASS | `createdAt` ベース。「最終アクセス」相対時刻は不使用 |
| Sec-3 | 捏造値の不表示 | 表示正確性 | PASS | IP は localhost で null のため非表示（捏造せず） |

**合計:** 8 件（PASS: 8 / FAIL: 0）

---

## 詳細

### TC-001 / TC-002: 一覧表示と isCurrent バッジ

2つのブラウザ context（agent-browser `--session verify-a` / `verify-b`）から同一ユーザーでログインし、A から `/settings/security` を開いた。

- 「セッション」節に **2行**が表示された。
- 各行に userAgent（HeadlessChrome の生 UA 文字列）と「ログイン日時: 2026/06/09 23:06」が表示。
- A の現在セッション行のみ「このセッション」pill が付き、**失効ボタンが出ない**。もう一方（B）の行には「ログアウト」ボタンが出る。
- スクショ: `screenshots/tc-01-list.png`

### TC-003: 行単位ログアウト

A の画面で B 行の「ログアウト」を発火させた。

- **重要:** agent-browser の `click @ref` では React の onClick が発火せず POST が飛ばなかった（後述 Known Issue）。`eval` 経由の `button.click()` で発火させたところ、**ローカル D1 のセッション数が 2→1 に減少**（対象セッションが削除）。
- 失効後、A の一覧は **1行（現在セッションのみ、失効ボタンなし）** に再検証された（`routerInvalidate`）。
- 失効された B が `/settings/security` に再アクセスすると `/` にリダイレクト（保護ルートから弾かれ、ログアウト確認）。
- スクショ: `screenshots/tc-03b-after-eval-revoke.png`

### TC-004: 一括失効との共存

セッションC を追加ログイン（DB 2件）→ A の一覧が2行 → 「他のすべてのセッションをログアウト」を eval 発火 → DB 1件（現在のみ）。一覧UIと一括失効ボタンが共存して破綻しない。
- スクショ: `screenshots/tc-04-two-rows.png`, `screenshots/tc-04b-after-bulk.png`

### Sec-1: token 非露出

現在セッションの実 token（`m7ahgj8kn6z-...`）でレンダリング済み DOM（101KB）を grep → **0 件**。session token は client に一切渡っていない。

---

## Known Issue（偽陽性の記録）

**agent-browser の `click @ref` が React 合成 onClick まで届かない。** TC-003 の初回試行では `click @e14` で POST が飛ばず DB も変化せず、一見 FAIL に見えた。manual-test スキルの既知事象（React 19 + useTransition + useServerFn のボタン）に該当。`eval` 経由の `button.click()` では正しく発火し、end-to-end（server function → `revokeUserSession` → D1 delete → 一覧再検証）が動作することを DB で実証した。**実装バグではなく agent-browser 起因の偽陽性。Issue 起票なし。**

実装側の自動テストでもこの導線は担保済み:
- `SecurityForm/__tests__/index.test.tsx`: 失効ボタンの onClick が `revokeSessionFn({ data: { sessionId } })` を呼ぶ
- `identity.integration.test.ts`（real D1）: `revokeUserSession` が所有者一致のみ削除・他人/不在 id は no-op

---

## 起票した Issue

なし（全 PASS、実装バグなし）。
