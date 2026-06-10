# 実装計画 — Issue #621: 公開ページのコンテナ幅が中身依存で可変になる（PUBLIC_MAIN / NOTE_DETAIL_WRAP に w-full 欠落）

**Issue:** #621
**作成日:** 2026-06-10
**複雑度:** 小規模

---

## 目的

公開ページ（P30 ユーザー公開トップ / P31 ノート詳細 / P32 公開検索）のコンテンツコンテナが、ビューポートではなく中身（最長のノート行・タイトル・日付）に依存して幅が可変になるバグを解消する。600px 付近でリスト幅がガタつく現象を止める。

## 原因（確認済み）

`PublicLayout`（`app/components/public/PublicLayout.tsx:34`）は `flex flex-col min-h-screen` で、`{children}`（各ページのルート要素）をその直下に置く。flex の cross-axis（横方向）のマージンが `auto`（= `mx-auto`）の場合、CSS 仕様上 `align-items: stretch` が無効化され、要素は `max-content`（中身幅、`max-width` を上限）に縮む。

該当コンテナは `w-full` / `flex-1` を持たないため幅が中身依存になる:

- `PUBLIC_MAIN`（`app/components/public/styles.ts:27-28`）— P30 / P32 の `<main>` が使用
- `NOTE_DETAIL_WRAP`（`app/components/public/styles.ts:125-126`）— P31 の `<div>` が使用

`SHARE_PAGE` / `ERR_PAGE` / `LegalDocument` は `flex-1` を持つため stretch して全幅になり、問題が出ない（対照群）。

## スコープ

### 含まれるもの

- `PUBLIC_MAIN` に `w-full` を追加
- `NOTE_DETAIL_WRAP` に `w-full` を追加
- P30 / P31 / P32 でコンテナ幅が中身に依存せず一定（`max-width` 上限・中央寄せ）になることのブラウザ確認

### 含まれないもの

- #619 のデザイン乖離（プロフィール構造・日付表記など）— 幅バグのみ本 Issue に集約
- `SHARE_PAGE` / `ERR_PAGE` / `LegalDocument`（既に `flex-1` を持ち問題なし）

## 実装ステップ

### 1. PUBLIC_MAIN に w-full を追加

- **対象ファイル:** `app/components/public/styles.ts`（28行目）
- **変更内容:**
  ```diff
  - "max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]"
  + "w-full max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]"
  ```
- **理由:** 親 100% 幅を明示し、`mx-auto` による cross-axis auto マージンが stretch を無効化しても `max-content` に縮まないようにする。余白は `mx-auto` が左右に振り、`max-width` で上限を担保する。

### 2. NOTE_DETAIL_WRAP に w-full を追加

- **対象ファイル:** `app/components/public/styles.ts`（126行目）
- **変更内容:**
  ```diff
  - "max-w-[920px] mx-auto px-[var(--container-padding)] pt-8 pb-16"
  + "w-full max-w-[920px] mx-auto px-[var(--container-padding)] pt-8 pb-16"
  ```
- **理由:** ステップ1と同じ。P31 ノート詳細のラッパーを全幅化する。

## 設計判断

なし（Issue 本文の修正方針を踏襲。トレードオフのある技術選択は発生しない）。

## リスクと注意点

- `w-full` 追加は幅を「中身依存 → 親100%（max-width上限）」に変えるだけで、`max-width` と `mx-auto` による中央寄せ・最大幅は不変。視覚的なデグレは想定されない。
- `PUBLIC_FOOTER_INNER`（36行目）も同じ `mx-auto`＋`max-width` だが、`PUBLIC_FOOTER` 内に入れ子で、フッターは `flex` 子ではあるものの内側の `_INNER` はブロック子なので cross-axis auto マージン問題の対象外。本 Issue のスコープ外（フッターのガタつき報告もない）。
- Tailwind JIT はこの文字列リテラルをスキャンするため、`w-full` が確実にクラス生成される。

## テスト方針

- ブラウザで P30 / P31 / P32 を開き、ビューポート幅を 600px 付近で変化させてもコンテナ幅が中身に依存せず一定（`max-width` 上限・中央寄せ）であることを確認する。
- 600px 付近のリスト幅のガタつきが解消されていることを確認する。
- `pnpm typecheck && pnpm lint:fix && pnpm format` がパスすることを確認する。
