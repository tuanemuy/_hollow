# 動作確認計画 — Issue #773: AuthHeader の webkit backdrop-filter を SSOT トークンに追従させる

**Issue:** #773
**作成日:** 2026-06-27

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーション適用（未適用なら）
pnpm dev              # Vite + Cloudflare ローカル開発サーバー
```

起動後、ブラウザで `/login` を開き AuthHeader を表示させる。

### デプロイ方法

なし（検証環境のみで確認できる。本番反映は通常のデプロイフロー `pnpm deploy:staging` / `pnpm deploy:production` に従う）。

## 確認項目

### 1. AuthHeader の backdrop-filter が canonical パターンに統一されている

- **対応する受け入れ基準:** AC-1
- **目的:** AuthHeader が webkit/standard 両方とも `var(--header-blur)` 経由で描画されること。
- **手順:**
  1. `/login`（または `/signup` 等 AuthHeader を持つ画面）を開く。
  2. DevTools で `<header>` 要素を選択し、Computed/Styles から `backdrop-filter` と `-webkit-backdrop-filter` を確認する。
  3. `app/components/auth/AuthHeader/index.tsx` の className に `backdrop-blur-xl` が残っていないことを確認する。
- **期待結果:** `backdrop-filter` と `-webkit-backdrop-filter` がともに `saturate(180%) blur(20px)`（= `var(--header-blur)`）として解決される。`backdrop-blur-xl` 由来の `blur(24px)` は出ない。
- **確認ポイント:** 他ヘッダー（公開トップ・管理画面ヘッダー等）と同一の backdrop-filter 値になっているか。

### 2. Safari での blur が他ヘッダーと揃う

- **対応する受け入れ基準:** AC-2
- **目的:** webkit 描画が `blur(24px)`（saturate なし）から `saturate(180%) blur(20px)` に変わる意図的な視覚変化を確認する。
- **手順:**
  1. Safari で `/login` を開き、ヘッダー背後にコンテンツが透ける状態（スクロール）でヘッダーの blur/彩度を観察する。
  2. 同じ Safari で公開トップなど他ヘッダーを持つ画面を開き、blur/彩度を見比べる。
- **期待結果:** AuthHeader の blur と彩度が他ヘッダーと視覚的に一致する。
- **確認ポイント:** AuthHeader だけ blur が強い/彩度がない、という差が解消されていること。

## 既存機能への影響確認

- Chrome（standard 経路）の AuthHeader 描画は本変更で変わらない（既に `var(--header-blur)` 経由）。回帰がないことを確認する。
- AuthHeader 以外の4ヘッダーは変更対象外。見た目に変化がないことを確認する。
