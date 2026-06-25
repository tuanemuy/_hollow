# 動作確認計画 — Issue #597: ヘッダーの backdrop-filter をリテラルから SSOT トークン var(--header-blur) に統一

**Issue:** #597
**作成日:** 2026-06-25

---

## 確認環境

このIssueはバックエンド変更を伴わない CSS 値の SSOT 統一（同値置換）。4つのヘッダー（アプリ / 認証 / 公開 / ランディング）の backdrop-filter が `var(--header-blur)` 経由になり、見た目が変わらないことをローカル開発サーバで確認する。

### 検証環境の起動

```
pnpm dev
```

`vite dev`（Cloudflare ランタイム）でローカルサーバが起動する。表示された URL をブラウザで開いて確認する。

アプリシェル（`layout/` の `APP_HEADER`）は認証が必要。D1 ローカルにシードが無い場合はマイグレーション適用 → シード投入を行う:

```
pnpm db:migrate
pnpm seed:dev-admin
```

認証済みアクセスは agent-browser に session cookie を注入して行う（`docs/test.md` 参照）。認証不要なヘッダー（AuthHeader = `/login`、PUBLIC_HEADER = 公開ページ、LANDING_HEADER = トップ `/`）はログインなしで確認できる。

### デプロイ方法

なし（検証環境のみで確認できる。ステージング反映が必要な場合は `pnpm deploy:staging`）。

---

## 確認項目

### 1. ランディング/公開/認証ヘッダーの blur が変わらない（AC-1・AC-2・AC-3）

- **対応する受け入れ基準:** AC-1, AC-2, AC-3
- **目的:** トークン化後も backdrop blur の見た目が同一であること。
- **手順:**
  1. `/`（LANDING_HEADER）、`/login`（AuthHeader）、公開ページ（PUBLIC_HEADER）を順に開く。
  2. 各ヘッダー下に背景コンテンツがスクロールで透ける状態にし、ヘッダーの blur/saturate のかかり具合を確認する。
  3. DevTools の Computed で `<header>` の `backdrop-filter` が `saturate(1.8) blur(20px)`（= `var(--header-blur)` 解決値）になっていることを確認する。
- **期待結果:** 置換前と blur の見た目が同一。Computed 値がトークン解決値と一致する。
- **確認ポイント:** Chrome（standard）で 4ヘッダーすべて同じ blur に揃っていること。

### 2. アプリヘッダーの blur が変わらない（AC-1・AC-3）

- **対応する受け入れ基準:** AC-1, AC-3
- **目的:** 認証後アプリシェルの `APP_HEADER` も同値であること。
- **手順:**
  1. session cookie を注入して認証済みでアプリシェル画面を開く。
  2. ヘッダー下に背景を透けさせ blur を確認する。
- **期待結果:** 置換前と blur の見た目が同一。

## エッジケース・異常系

### 1. 旧リテラルの残存が無いこと（AC-1・AC-2）

- **目的:** 置換漏れが無いことを静的に保証する。
- **手順:**
  1. `grep -rn "saturate(180%)_blur(20px)" app/` を実行する。
- **期待結果:** マッチ 0 件（4箇所すべて `var(--header-blur)` 化済み）。

### 2. Safari での AuthHeader 挙動（ADR-008）

- **目的:** AuthHeader の webkit 側（`backdrop-blur-xl`）が無改変で、Safari 挙動が変わらないこと。
- **手順:**
  1. Safari（または `-webkit-backdrop-filter` 経路）で `/login` を開く。
- **期待結果:** 置換前と Safari の blur 見た目が同一（webkit 側は意図的に未変更）。

## 既存機能への影響確認

- ヘッダーのレイアウト・スティッキー挙動・ボーダー等、backdrop-filter 以外のスタイルに変化が無いこと。
- `pnpm typecheck && pnpm lint:fix && pnpm format` が通ること（AC-4）。
