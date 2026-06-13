# 実装計画 — Issue #688: ノート一覧→詳細→編集でメインコンテンツの幅が変わる

**Issue:** #688
**作成日:** 2026-06-13
**複雑度:** 小規模

---

## 目的

app（ノート）側のメインコンテンツが画面ごとに生 px で幅を直書きしているために起きる横幅のガタつき（特に「詳細 760px → 編集 1100px」の +340px ジャンプ）を解消する。幅指定を既存の幅トークンへ集約し、各画面が「外枠幅(`--container-max`)」か「本文幅(`--content-max`)」かの**意味**を選ぶ構造にする。

## ユーザー確認済みの方針

`APP_MAIN` の `1100px` の寄せ先について、Issue 本文で「`--container-max` または app 用の専用トークン」の 2 択が残されていた。ユーザー確認の結果 **既存の `--container-max`(1280px) に統一** する方針で確定（app の一覧・編集は 1100px → 1280px に拡幅される）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | ノート一覧・ノート編集のメインコンテンツ外枠幅が同一（`--container-max` = 1280px）で表示される | Issue 本文「対応方針」 | 1, 5 |
| AC-2 | ノート詳細のヘッダー（パンくず・タイトル・メタ）が外枠幅まで広がり、一覧・編集とタイトル左右端が揃う（760px 制限が撤廃される） | Issue 本文「対応方針: 詳細・編集は外枠幅に揃える」 | 2 |
| AC-3 | ノート詳細 → 編集の遷移でタイトル/ヘッダー幅が変わらない（視覚的連続性が保たれる） | Issue 本文「概要」 | 1, 2, 5 |
| AC-4 | ノート詳細・編集の本文（プローズ）読み幅は従来どおり 760px（`--content-max`）に保たれる | 既存 `.note-detail-content` 仕様の維持 | 2（撤廃しても `.note-detail-content` が担保） |
| AC-5 | app 側に残る幅の生 px 直書き（`1100px` / `760px`）が幅トークン参照に置き換わっている | Issue 本文「対応方針: トークンに集約」 | 1, 2, 3, 4, 5 |
| AC-6 | 履歴一覧・過去版詳細の本文幅(760px)は維持しつつ `--content-max` トークン参照になる | Issue 本文「残す場合の本文幅(760px)直書きは --content-max に置き換え」 | 3, 4 |

## スコープ

### 含まれないもの
- `SavedViewsList/Page.tsx` の `<main>` を `APP_MAIN` 定数で**丸ごと置換**すること。同 `<main>` は `lg:px-10 lg:py-12 xl:px-16 xl:py-16 max-sm:*` という `APP_MAIN`（`px-6 pt-8 pb-20`）より手厚いレスポンシブ padding を持つため、定数置換は padding の退化を招く。Issue が問題視しているのは「`1100px` 幅値の再直書き」なので、**幅値のみ** `var(--container-max)` にトークン化し、padding は据え置く（ステップ 5）。
- `--container-max` 等のトークン値そのものの変更、新規トークンの追加（ユーザーが既存トークン流用を選択済み）。
- 本文 `max-w-[NNch]`（`56ch`/`60ch` 等の文字数基準の読み幅）— これは px 直書きではなく意図的な可読幅指定でありトークン対象外。

## 調査結果

- 関連ファイル / 現状の幅指定:
  - `app/components/layout/styles.ts:120` `APP_MAIN = "... max-w-[1100px] ..."`（一覧 `HomePage` と編集 `NoteEditor` が継承）
  - `app/components/note/detail/NoteDetail.tsx:125` `<article className="max-w-[760px] mx-auto">`（詳細のヘッダー＋本文ラッパー）
  - `app/components/note/history/NoteRevisionDetail.tsx:41,57` `max-w-[760px]`（alert / 本体）
  - `app/components/note/history/NoteHistoryList.tsx:50,73` `max-w-[760px]`（alert / 本体）
  - `app/components/view/SavedViewsList/Page.tsx:36` `<main className="... max-w-[1100px] ...">`
- 幅トークン（`app/styles/tokens.css:92,96`）: `--container-max: 1280px;` / `--content-max: 760px;`。`index.css:134` の `@theme inline` で `--container-max` は Tailwind に橋渡し済み（任意値 `max-w-[var(--container-max)]` で参照可能）。
- 重要な構造的発見: 本文プローズの実体 `.note-detail-content`（`index.css:191`）が既に `max-width: var(--content-max)`(760px) を内部で持つ。詳細の `<article>` の `max-w-[760px]` は**ヘッダー（タイトル等）まで**を 760px に絞る役割。一方エディタは `titleInput` が `w-full`（外枠幅）、本文編集ホスト（`HtmlEditor`/`InlineEditor`）が `.note-detail-content`(760px)。
  - → 「詳細→編集」のガタつきの実体は**タイトル幅が 760px → 1100px に広がること**。詳細の `<article>` から `max-w-[760px]` を撤廃すれば、ヘッダー/タイトルは外枠幅でエディタと揃い、本文プローズは両画面とも `.note-detail-content`(760px) で揃う。
- あるべきアーキテクチャ（CLAUDE.md styling 節）: 幅などのレイアウト値はデザイントークン（`tokens.css`）を SSOT とし、Tailwind 任意値で `var(--token)` 参照する。public/admin 側は既に `--container-max`/`--content-max` を使用しており、app 側だけがトークン体系から外れている（乖離）。本 Issue 範囲で app 側をトークン体系に揃える。
- 依存関係: いずれも CSS クラス文字列のみの変更。ドメイン/ユースケース/アダプター/ルーティング・データフローへの影響なし。

## 設計

### ドメインモデルへの影響
なし（純粋にプレゼンテーション層のスタイル変更）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
各 app 画面のメインコンテナ幅指定を、生 px から幅トークン参照に置き換える。意味の割り当て:

- **外枠幅（`--container-max`）**: `APP_MAIN`（一覧・編集）、`SavedViewsList`（幅値のみ）。
- **詳細ヘッダーの外枠化**: `NoteDetail` の `<article>` から `max-w-[760px]` 制限を撤廃（本文プローズは `.note-detail-content` が 760px を担保するため別途指定不要）。
- **本文幅（`--content-max`）の維持＋トークン化**: 履歴一覧・過去版詳細（`NoteHistoryList`/`NoteRevisionDetail`）は読みビューとして 760px を維持しつつ、生 px をトークン参照に置換。

## 実装ステップ

### 1. `APP_MAIN` の幅を外枠トークンへ

- **対象ファイル:** `app/components/layout/styles.ts:120`
- **変更内容:** `max-w-[1100px]` → `max-w-[var(--container-max)]`
- **理由:** 一覧・編集が継承する外枠幅を、独自値 1100px から既存トークン(1280px)へ集約（AC-1, AC-5）。

### 2. ノート詳細の 760px 制限を撤廃

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx:125`
- **変更内容:** `<article className="max-w-[760px] mx-auto">` → `<article>`（`max-w`/`mx-auto` を除去。`mx-auto` は max-width 喪失で無意味になるため一緒に外す）
- **理由:** ヘッダー/タイトルを外枠幅まで広げ、編集画面とタイトル左右端を揃える。本文プローズは `.note-detail-content` が 760px を担保（AC-2, AC-3, AC-4）。

### 3. 過去版詳細の本文幅をトークン化

- **対象ファイル:** `app/components/note/history/NoteRevisionDetail.tsx:41,57`
- **変更内容:** `max-w-[760px]` → `max-w-[var(--content-max)]`（alert / 本体の 2 箇所）
- **理由:** 読みビューとして 760px を維持しつつ生 px を排除（AC-5, AC-6）。

### 4. 履歴一覧の本文幅をトークン化

- **対象ファイル:** `app/components/note/history/NoteHistoryList.tsx:50,73`
- **変更内容:** `max-w-[760px]` → `max-w-[var(--content-max)]`（alert / 本体の 2 箇所）
- **理由:** 同上（AC-5, AC-6）。

### 5. SavedViews の重複幅値をトークン化

- **対象ファイル:** `app/components/view/SavedViewsList/Page.tsx:36`
- **変更内容:** `max-w-[1100px]` → `max-w-[var(--container-max)]`（padding 等その他のクラスは据え置き）
- **理由:** `APP_MAIN` と同じ外枠幅値の別ファイル再直書きを解消。`APP_MAIN` 定数への丸ごと置換は padding 退化を招くため幅値のみトークン化（AC-1, AC-5、スコープ参照）。

## リスクと注意点

- app の一覧・編集が 1100px → 1280px に拡幅されるため、広い画面で行長が伸びる。一覧はカード/行レイアウト、編集はタイトル `w-full`・本文 760px 制約のため実害は小さいが、ブラウザ検証で崩れがないか確認する。
- 詳細の `<article>` から `max-w-[760px]` を外すと、本文プローズ(760px)は左寄せ（`.note-detail-content` に `margin-inline:auto` は無い）になる。エディタの本文ホストも左寄せのため挙動は一致するが、詳細→編集で本文の左端位置が揃うか検証する。
- `var(--container-max)` は `@theme inline` で橋渡し済みのため `max-w-[var(--container-max)]` は機能するが、`--content-max` は `@theme inline` に無い。ただし任意値 `max-w-[var(--content-max)]` は CSS 変数を直接参照するだけで Tailwind のテーマ登録は不要なので問題なく解決する（既存 public 側でも同パターンを使用）。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` がパスすること。
- ブラウザ検証（testing.md）: 一覧→詳細→編集でメインコンテンツ外枠幅が揃うこと、詳細本文が 760px を保つこと、履歴・過去版が 760px を保つこと、保存ビューが 1280px になること。
- 自動テスト（unit/integration）への影響は無い見込み（スタイル文字列のみの変更）だが、念のため `pnpm test:unit` がグリーンであることを確認する。

## レビュー履歴

### 1周目
小規模 Issue のため計画レビューループはスキップ（メイン自身が関連コードを精査し、`.note-detail-content` の内部 760px 制約という構造的事実を確認した上で各ステップの妥当性を検証済み）。
