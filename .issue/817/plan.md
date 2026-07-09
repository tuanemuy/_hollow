# 実装計画 — Issue #817: fix(admin): UsersTable で hydration mismatch（SSR/クライアントの日付フォーマット差）

**Issue:** #817
**作成日:** 2026-07-10
**複雑度:** 小規模

---

## 目的

`/admin/users`・`/admin/jobs` の日付整形が SSR（Cloudflare Workers = UTC）とクライアント（ブラウザのタイムゾーン）で異なる文字列になり、hydration mismatch の warning とツリー再生成を引き起こしている。日付整形を TZ 非依存の決定論的なものにして mismatch を解消する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | admin 認証済みで `/admin/users` を SPA 描画したとき、`SectionErrorBoundary section="ユーザー一覧"` を含む hydration mismatch warning がコンソールに出ない | Issue 本文 | 1 |
| AC-2 | `/admin/jobs`（取り込み/エクスポートジョブ、検索インデックス再構築・バックフィルの結果表示）でも同型の hydration mismatch warning が出ない | Issue 本文（同型パターンの確認要請） | 2 |
| AC-3 | 登録日・ジョブ日時の表示内容が JST（Asia/Tokyo）基準で変わらず読める（既存の見た目・粒度を維持） | Issue 本文（決定論的整形にする） | 1, 2 |

## スコープ

### 含まれないもの
- `formatDate`/`toLocaleString` を使う他コンポーネント（`ProfileForm`, `PublishSettings`, `SecurityForm`, `NoteMetaPanel`, `TrashList`, `TagList`, `relativeTime`, `admin/Dashboard` の `formatActivityTime`, `NoteRevisionDetail`, `NoteHistoryList` など）の同型の潜在的 mismatch。Issue が明示的に対象としているのは UsersTable と Jobs の2つのみ。横断修正は別 Issue として起票を検討する（Phase 4）。
- 表示タイムゾーンをユーザー設定で切り替える仕組み。アプリ全体が `ja-JP` ロケールをハードコードしている現状に合わせ、admin の運用ビューは JST 固定とする。

## 調査結果

- 関連ファイル:
  - `app/components/admin/UsersTable/index.tsx:91-99` — `formatDate` が `Date#toLocaleDateString("ja-JP", …)` を TZ 未指定で呼ぶ（`"use client"`、`/admin/users` で SSR される）。
  - `app/components/admin/Jobs/index.tsx:159-169` — `formatDateTime` が `Date#toLocaleString("ja-JP", …)` を TZ 未指定で呼ぶ（`"use client"`、`/admin/jobs` で SSR される。取り込み/エクスポート行・検索インデックス再構築結果・バックフィル結果の4箇所で使用）。
  - `app/components/admin/UsersTable/Page.tsx` / `app/components/admin/Jobs/Page.tsx` 経由で `renderServerComponent` により SSR される（`app/routes/admin/users.tsx`, `app/routes/admin/jobs.tsx`）。
- あるべきアーキテクチャ: 整形はプレゼンテーション層の責務（`app/components/common/relativeTime.ts` の JSDoc に明記）。`app/components/note/list/listSelectors.ts:169-171` の JSDoc が「Workers の `Intl.DateTimeFormat` は UTC デフォルト」とチームの既知事項として記録しており、TZ を明示しないと SSR/クライアントで出力がずれることが分かっている。
- 既存実装の状態: `listSelectors.groupNotesByDay` はクライアントでブラウザ TZ を解決して引数で渡すパターン（バケット化用途）。単純な日付表示側（UsersTable/Jobs 等）は TZ 未指定のままで、SSR 時 UTC → クライアント再生成でブラウザ TZ に化ける。今回は表示用途なので SSR 時点で決定論的に定まる固定 TZ を明示する方針を採る（詳細は adr.md）。
- 依存関係: DTO（`UserDTO.createdAt`, `IngestionJobDTO.updatedAt`, `ExportJobDTO.createdAt`, `RebuildSearchIndexResultDTO.finishedAt`, `BackfillInternalLinksResultDTO.finishedAt`）は ISO 文字列を渡すのみ。DTO・ユースケース・ドメインへの変更は不要。

## 設計

### ドメインモデルへの影響
なし（表示整形のみの変更でドメイン・ユースケース・アダプター・DTO は不変）。

### UI / プレゼンテーション
`formatDate`（UsersTable）と `formatDateTime`（Jobs）の整形オプションに `timeZone: "Asia/Tokyo"` を追加し、SSR とクライアントで同一文字列になるようにする。ロケールは既存どおり `ja-JP` を維持。関数の呼び出し側・引数・戻り値の型は変えない。

## 実装ステップ

### 1. UsersTable の `formatDate` を TZ 固定にする

- **対象ファイル:** `app/components/admin/UsersTable/index.tsx`
- **変更内容:** `formatDate` の `toLocaleDateString("ja-JP", {...})` オプションに `timeZone: "Asia/Tokyo"` を追加。なぜ固定 TZ を明示するのか（hydration 決定論化）を一言 WHY コメントで残す。
- **理由:** SSR（UTC）とクライアント（ブラウザ TZ）の出力差が hydration mismatch の直接原因。TZ を固定すれば両者が一致する（AC-1, AC-3）。

### 2. Jobs の `formatDateTime` を TZ 固定にする

- **対象ファイル:** `app/components/admin/Jobs/index.tsx`
- **変更内容:** `formatDateTime` の `toLocaleString("ja-JP", {...})` オプションに `timeZone: "Asia/Tokyo"` を追加。同型パターンを一括で解消する（この関数がジョブ行・再構築/バックフィル結果の全表示を担う）。
- **理由:** UsersTable と同一原因。Issue が「Jobs テーブルなど同型パターンも合わせて確認する」と明示（AC-2, AC-3）。

## 設計判断

表示タイムゾーンを `Asia/Tokyo` に固定する点、および `suppressHydrationWarning` を採らない理由を adr.md（ADR-001）に記録。

## リスクと注意点

- 非 JST 環境から admin を閲覧している場合、これまで「ブラウザ TZ で再生成された値」が表示されていたのが JST 固定表示に変わる。ただし対象はアプリ全体が `ja-JP` 前提の admin 運用ビューであり、JST 固定は妥当。実害となる利用者はほぼいない。
- `Intl` の `timeZone: "Asia/Tokyo"` は Workers・主要ブラウザともにサポート済み（`listSelectors` で既に `timeZone` 指定の `Intl.DateTimeFormat` を本番利用している実績あり）。

## テスト方針

- `pnpm typecheck && pnpm lint && pnpm format:check` が通ること（整形オプション追加のみなので型・lint 影響は軽微）。
- ブラウザ検証（manual-test）で `/admin/users`・`/admin/jobs` を admin 認証済みで開き、コンソールに hydration mismatch warning が出ないこと・日付表示が JST で正しく読めることを確認する。
