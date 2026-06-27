# 実装計画 — Issue #773: AuthHeader の webkit backdrop-filter を SSOT トークン var(--header-blur) に追従させる

**Issue:** #773
**作成日:** 2026-06-27
**複雑度:** 小規模

---

## 目的

`auth/AuthHeader/index.tsx` の backdrop-filter を他4ヘッダーと同じ canonical パターンに揃え、webkit 側も `var(--header-blur)`（SSOT）経由にして、#597 が残した「AuthHeader の Safari 描画だけ SSOT に追従しない」負債（ADR-008）を解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | AuthHeader の className から `supports-[backdrop-filter]:backdrop-blur-xl` が除去され、webkit/standard 両方が `var(--header-blur)` 経由になる（他4ヘッダーと同一の backdrop-filter ペアを持つ） | Issue 受け入れ基準1 / 方針案 | ステップ1 |
| AC-2 | Safari（webkit）の blur が `saturate(180%) blur(20px)` に揃う（=他ヘッダーと一致。`blur(24px)` saturate なし からの意図的な視覚変化） | Issue 受け入れ基準2 | ステップ1 |
| AC-3 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue 受け入れ基準3 | ステップ2 |

## スコープ

### 含まれないもの
- 他4ヘッダー（`LANDING_HEADER` / `APP_HEADER` / `PUBLIC_HEADER` / admin route header）の変更 — 既に canonical パターンで SSOT に追従済み。
- `--header-blur` トークン値そのものの変更 — 既存の `saturate(180%) blur(20px)` を正とする。

## 調査結果

- 関連ファイル:
  - `app/components/auth/AuthHeader/index.tsx:13` — 本Issueの唯一の変更対象。現状 `supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)]`。
  - canonical パターン（参照のみ・変更なし）: `app/components/landing/LandingPage.tsx:23`, `app/components/layout/styles.ts:6`, `app/components/public/styles.ts:11`, `app/routes/admin/route.tsx:27`。いずれも `supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)] supports-[backdrop-filter]:[-webkit-backdrop-filter:var(--header-blur)]`。
  - `app/styles/tokens.css:140` — `--header-blur: saturate(180%) blur(20px);`（SSOT）。
- あるべきアーキテクチャ: CLAUDE.md の styling 規約 — backdrop-filter は「always-on base + `supports-[backdrop-filter]:` for blur」パターン（ADR-005）。design token は `tokens.css` を SSOT とし、リテラルを直書きしない。
- 既存実装の状態: AuthHeader だけ webkit 側が Tailwind ユーティリティ `backdrop-blur-xl`（= `blur(24px)`、saturate なし、トークン非経由）で描画されており、SSOT から乖離。本Issueで canonical に寄せる。
- 依存関係: CSS の見た目のみ。型・ロジックへの影響なし。Safari の AuthHeader 描画が `blur(24px)` → `saturate(180%) blur(20px)` に変化（意図的）。

## 設計

### ドメインモデルへの影響
なし（プレゼンテーション層の className のみ）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
`AuthHeader` の `<header>` className の backdrop-filter ユーティリティ群を canonical パターンに置換する。

## 実装ステップ

### 1. AuthHeader の backdrop-filter を canonical パターンに統一

- **対象ファイル:** `app/components/auth/AuthHeader/index.tsx`
- **変更内容:** className 内の
  `supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)]`
  を
  `supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)] supports-[backdrop-filter]:[-webkit-backdrop-filter:var(--header-blur)]`
  に置換する（他4ヘッダーと完全一致させる）。
- **理由:** `backdrop-blur-xl`（webkit 側フォールバック・トークン非経由）を除去し、`-webkit-backdrop-filter:var(--header-blur)` を明示することで webkit も SSOT に追従させる。

### 2. 品質ゲート

- **対象ファイル:** —
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行して通すことを確認する。
- **理由:** AC-3。

## リスクと注意点

- Safari での AuthHeader 描画が `blur(24px)` → `saturate(180%) blur(20px)` に変わる。**これは負債解消に伴う意図的な視覚変化**で、回帰ではない。
- Chromium 系（standard）の描画は変化しない（既に `var(--header-blur)` 経由）。

## テスト方針

- AuthHeader をレンダリングするログイン/サインアップ系画面で、ヘッダーの blur が他画面のヘッダーと視覚的に揃うことを確認する。
- standard 経路（Chrome）で見た目の回帰がないことを確認する。
- webkit リテラルの視覚差は Safari 実機でのみ厳密に確認できるが、本変更は他4ヘッダーと同一文字列への統一なので、それらと同一描画になることで担保される。
