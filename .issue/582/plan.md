# 実装計画 — Issue #582: ブランドアイコン(Vesica)を各ページの可視ロゴへ反映する

**Issue:** #582
**作成日:** 2026-06-08
**複雑度:** 中〜大規模

---

## 目的

確定済みブランド（Vesica マーク + Avenir Next アウトライン lowercase「hollow」）を、アプリ内で実際に表示される各ページの可視ロゴへ反映する。現状はすべてプレーンテキスト「Hollow」のままで、Vesica マークの SVG はアプリコンポーネントから参照されていない。

OG 画像 / favicon 一式は PR #590 までで対応済み。本 Issue では「アプリ内の可視ロゴ」を対象とする。

## スコープ

### 含まれるもの

- Vesica マークの共有コンポーネント化（マーク単体 + マーク+Wordmark ロックアップ、`currentColor` 追従・サイズ可変・aria 対応）
- 以下6箇所のテキストロゴをロックアップへ差し替え
  1. アプリヘッダー `app/components/layout/Header.tsx:34`
  2. 公開ヘッダー `app/components/public/PublicLayout.tsx:38`
  3. 公開フッター `app/components/public/PublicLayout.tsx:80`
  4. ランディングヘッダー `app/components/landing/LandingPage.tsx:107`
  5. ランディングフッター `app/components/landing/LandingPage.tsx:340`
  6. 認証ヘッダー `app/components/auth/AuthHeader/index.tsx`
  7. 管理ヘッダー（通常 / errorComponent / notFoundComponent の3箇所）`app/routes/admin/route.tsx`（実装時に追加発見。Issue 表には未記載だが「各ページの可視ロゴ」の意図に含まれるため対象に追加）
- 認証画面のブランド表記方針の明示（→ マーク採用：ロックアップ表示）
- OG 画像が新ブランドで表示されることの確認（実装変更なし、確認のみ）

### 含まれないもの

- OG 画像 / favicon アセットの差し替え（PR #590 までで完了済み）
- 新規ブランドトークンの定義・デザイン提案（ブランドは確定済み、既存素材を再利用）
- ランディングの Hero eyebrow の小円 SVG（`LandingPage.tsx:129`）— ロゴではなく装飾なので対象外

## 実装ステップ

### 1. 共有ブランドコンポーネントの追加

- **対象ファイル:** `app/components/common/BrandLogo.tsx`（新規）
- **変更内容:**
  - `BrandMark` — Vesica マーク単体。`spec/design/icons/hollow-mark.svg`（二円 / `stroke-width=1.5` / `currentColor`）を React 化。`size`（数値・既定値あり）と `className`、`label?` を受ける。`label` 省略時は `aria-hidden`、指定時は `role="img"` + `aria-label`（`Icon.tsx` の aria 規約に倣う）。
  - `BrandLockup` — マーク + アウトライン化 lowercase「hollow」の横組みロックアップ。`spec/design/icons/hollow-lockup.svg`（viewBox `0 0 473.84 84.48`、mark=stroke、wordmark=fill、ともに `currentColor`）を React 化。高さ基準でサイズ可変（aspect は viewBox 固定）。既定 `aria-label="hollow"`。
- **理由:** lucide `Icon` 同様のコントラクト（currentColor / サイズ可変 / aria）でブランドマークを再利用可能にする。インライン SVG にするのは、`<img>` では `currentColor` がテーマ追従しないため（OG と同じくフォント非同梱方針なのでアウトライン SVG を採用）。詳細は adr.md ADR-001。

### 2. 各ページのロゴ差し替え

- **対象ファイル:** `Header.tsx` / `PublicLayout.tsx` / `LandingPage.tsx` / `AuthHeader/index.tsx`
- **変更内容:** 各テキスト「Hollow」を `BrandLockup` に差し替える。既存の `Link`/`div`/`span` のラッパ・遷移先・レイアウト（`max-sm:hidden` 等）は維持し、中身のテキストのみ置換。色は親の `text-ink` を `currentColor` が継承。
- **理由:** 全ページで確定ブランドの可視ロゴを一貫表示する（完了条件）。

### 3. 旧テキストロゴ用スタイル定数の整理

- **対象ファイル:** `app/components/layout/styles.ts`（`APP_LOGO`）/ `app/components/public/styles.ts`（`PUBLIC_LOGO`）/ `app/components/landing/LandingPage.tsx`（`LOGO`）
- **変更内容:** テキスト前提の `text-[21px] font-light tracking-tightest text-ink` 定数が未使用化したら削除。`BrandLockup` を内包する `Link` には色（`text-ink`）と高さ制御の最小 className のみ残す。
- **理由:** 死蔵スタイルを残さない。ただし他参照があれば維持する（差し替え時に grep 確認）。

### 4. spec 整合の確認

- **対象ファイル:** `spec/design/icons/index.md`
- **変更内容:** 「次のステップ」「このタスク（#582）の残作業」と実装が整合するよう、各ページ反映が完了した旨を必要に応じて追記（ドキュメント差分は最小限）。
- **理由:** Issue の完了条件「spec 整合」。

## 設計判断

詳細は adr.md を参照。

- **ADR-001:** in-app ロゴはインライン SVG ロックアップ（アウトライン wordmark）で実装し、`<img>` 参照やテキスト+Webフォントは採らない。理由は `currentColor` テーマ追従とフォント非同梱方針。

## リスクと注意点

- **ロックアップの高さ合わせ:** 現行テキストは 21px。ロックアップは aspect 約 5.6:1 で、高さを揃えると幅 ~118px。ヘッダーの折返し・`max-sm:hidden` 挙動が崩れないか実機確認する。
- **casing 変更:** 表示が「Hollow」→「hollow」になる（ブランド確定どおり）。`© 2026 Hollow.` のような**文章中**の "Hollow"（`LandingPage.tsx:426`, `:256`, `:142` など）はロゴではないので変更しない。ロゴ箇所のみ差し替える。
- **アクセシビリティ:** SVG ロゴの accessible name が「hollow」になる。スクリーンリーダーで適切に読まれるか、`Link` 側に重複 aria が出ないか確認。
- **テスト影響:** 既存テストが「Hollow」テキストや `APP_LOGO` 定数に依存していないか確認（`app/components/layout/__tests__` 等）。依存していれば aria-label / ロール基準に更新。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` が通る。
- `pnpm test` が通る（ロゴ関連テストがあれば更新後グリーン）。
- ブラウザで 6 箇所のロゴが Vesica ロックアップで表示され、light/dark でテーマ追従することを manual-test で確認。
- OG 画像が新ブランドで表示されることをプレビューで確認。
