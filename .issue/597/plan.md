# 実装計画 — Issue #597: ヘッダーの backdrop-filter をリテラルから SSOT トークン var(--header-blur) に統一

**Issue:** #597
**作成日:** 2026-06-25
**複雑度:** 小規模

---

## 目的

既存ヘッダー系コンポーネントが backdrop-filter にリテラル `saturate(180%) blur(20px)` を直書きしているのを、SSOT トークン `var(--header-blur)` 経由に統一し、将来トークンを変更したときにヘッダーごとの blur がばらつくリスクを解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `layout/styles.ts` / `landing/LandingPage.tsx` / `public/styles.ts` の `[backdrop-filter:...]` と `[-webkit-backdrop-filter:...]` が `var(--header-blur)` 経由になる | Issue 本文「対象」 | 1 |
| AC-2 | `auth/AuthHeader/index.tsx` の standard `[backdrop-filter:saturate(180%)_blur(20px)]` が `[backdrop-filter:var(--header-blur)]` になる | Issue 本文「対象」 | 2 |
| AC-2b | `routes/admin/route.tsx` の `ADMIN_HEADER_CLASS`（Issue 未列挙だが同一リテラルのヘッダー）も `var(--header-blur)` 経由になる | Issue 意図（タイトル: ヘッダー統一）／実装中に発見 | 1 |
| AC-3 | 見た目の回帰が無い（同値置換）。代表ヘッダーを目視確認 | Issue 受け入れ基準 | 3 |
| AC-4 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue 受け入れ基準 | 4 |

## スコープ

### 含まれないもの
- AuthHeader の webkit 側（`supports-[backdrop-filter]:backdrop-blur-xl`）の変更。これを `var(--header-blur)` 経由に寄せると Safari の blur 半径が 24px→20px に変わり「見た目の回帰が無い」基準に反するため触らない（詳細は adr.md ADR-008）。
- `--header-blur` トークン自体の値変更。

## 調査結果

- 関連ファイル:
  - `app/components/layout/styles.ts:6`（`APP_HEADER`）— standard + `-webkit-` 両方のリテラル
  - `app/components/landing/LandingPage.tsx:23`（`LANDING_HEADER`）— standard + `-webkit-` 両方のリテラル
  - `app/components/public/styles.ts:11`（`PUBLIC_HEADER`）— standard + `-webkit-` 両方のリテラル
  - `app/components/auth/AuthHeader/index.tsx:13` — `backdrop-blur-xl`（webkit 担当）+ standard リテラル1つ。`-webkit-` リテラルは持たない
  - `app/routes/admin/route.tsx:27`（`ADMIN_HEADER_CLASS`）— Issue 本文に未列挙だが standard + `-webkit-` の同一リテラルを持つ5箇所目のヘッダー。Issue タイトル「ヘッダーの backdrop-filter をSSOT統一」の意図に沿うため本Issueに含める
  - `app/styles/tokens.css:140` — `--header-blur: saturate(180%) blur(20px);`（SSOT 定義、リテラルと同値）
- あるべきアーキテクチャ: CLAUDE.md styling 規約「Design tokens は SSOT、トークン経由で参照」。backdrop-filter は ADR-005 の「always-on base + `supports-[backdrop-filter]:` で blur」パターン。`.issue/587/adr.md` ADR-006 で新設 CTA バーが既に `var(--header-blur)` 採用済み、既存リテラルは負債として本Issueに切り出された。
- 既存実装の状態: 4箇所がリテラル直書きで SSOT から乖離。同値なので現状は無害だが将来ばらつく。本Issueでトークン経由に統一する。
- 依存関係: 純粋な CSS 値の表現変更のみ。ロジック・型・他コンポーネントへの波及なし。

## 設計

CSS ユーティリティ文字列内のリテラル置換のみ。ドメイン/ユースケース/アダプター層への影響は **なし**。

### UI / プレゼンテーション
4ファイルの className 文字列内で `saturate(180%)_blur(20px)` を `var(--header-blur)` に置換する。3ファイルは standard + `-webkit-` の両方、AuthHeader は standard の1箇所のみ（後述 ADR）。

## 実装ステップ

### 1. 3ヘッダー定数のリテラルをトークン化
- **対象ファイル:** `app/components/layout/styles.ts`, `app/components/landing/LandingPage.tsx`, `app/components/public/styles.ts`
- **変更内容:** `[backdrop-filter:saturate(180%)_blur(20px)]` → `[backdrop-filter:var(--header-blur)]`、`[-webkit-backdrop-filter:saturate(180%)_blur(20px)]` → `[-webkit-backdrop-filter:var(--header-blur)]`
- **理由:** SSOT トークン経由に統一（AC-1）

### 2. AuthHeader の standard リテラルをトークン化
- **対象ファイル:** `app/components/auth/AuthHeader/index.tsx`
- **変更内容:** `supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)]` → `supports-[backdrop-filter]:[backdrop-filter:var(--header-blur)]`。`supports-[backdrop-filter]:backdrop-blur-xl` はそのまま残す
- **理由:** standard 側を SSOT 経由に（AC-2）。webkit 側は ADR-008 の通り無改変で回帰回避

### 3. 目視確認
- **変更内容:** 代表ヘッダー（layout/auth/public/landing）を起動して blur の見た目が変わらないことを確認
- **理由:** AC-3

### 4. 静的検証
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`
- **理由:** AC-4

## 設計判断

AuthHeader の webkit 側を無改変にする判断を adr.md ADR-008 に記録。

## リスクと注意点

- 同値置換のため機能・見た目の回帰リスクは低い。唯一の注意点は AuthHeader の webkit/standard の挙動差が既存仕様として残る点（ADR-008 で意図的）。
- Tailwind JIT が新しいリテラル `[backdrop-filter:var(--header-blur)]` をスキャンする必要があるが、同じ className 文字列内なので問題なし。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- ブラウザで4ヘッダーの backdrop blur が変わらないことを目視確認
- 置換後の文字列に旧リテラル `saturate(180%)_blur(20px)` が残っていないことを grep で確認
