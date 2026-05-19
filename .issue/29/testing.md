# 動作確認計画 — Issue #29: search 経路への visibility 入力伝達 + projection 実値化

**Issue:** #29
**作成日:** 2026-05-18

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

ローカルマイグレーション（`search_documents` テーブル schema 変更はないが、念のため）:

```bash
pnpm db:apply:local
```

### デプロイ方法

ステージング（必要な場合のみ）:

```bash
pnpm deploy:staging
```

本 Issue の変更はマイグレーション不要のため、`db:apply:staging` は不要。

---

## 確認項目

### 1. search 経路で `?visibility=public` が効く

- **目的:** URL の `visibility` パラメータが `searchOwnNotes` に伝達され、index 側でフィルタされること
- **前提:** 同一 owner で `private` / `unlisted` / `public` の各 visibility に同じキーワード（例: "test"）を含むノートを最低 1 件ずつ用意
- **手順:**
  1. ログイン
  2. ホーム画面で `/?q=test&visibility=public` にアクセス
  3. 検索結果を確認
- **期待結果:** public visibility のノートのみが結果に含まれる。private / unlisted は含まれない
- **確認ポイント:** 結果件数とノートのタイトル

### 2. search 経路で `?visibility=private` が効く

- **目的:** 同上、private のフィルタが効くこと
- **手順:**
  1. `/?q=test&visibility=private` にアクセス
- **期待結果:** private visibility のノートのみが結果に含まれる
- **確認ポイント:** public / unlisted のノートが除外されていること

### 3. search 経路で `?visibility=unlisted` が効く

- **手順:** `/?q=test&visibility=unlisted` にアクセス
- **期待結果:** unlisted visibility のノートのみが結果に含まれる

### 4. search 経路で `visibility` を指定しないと従来通り全件

- **目的:** 後方互換性の確認
- **手順:** `/?q=test` （visibility パラメータなし）にアクセス
- **期待結果:** 全 visibility のノートが結果に含まれる（Issue #29 以前と同じ挙動）

### 5. filter 経路（`q` なし）への影響なし

- **目的:** filter 経路のリグレッションがないこと
- **手順:**
  1. `/?visibility=public` （`q` なし）にアクセス
- **期待結果:** Issue #8 / PR #28 で実装された通り、public のノートのみが listing に表示される

## エッジケース・異常系

### 1. 不正な visibility 値

- **目的:** URL に `?visibility=invalid` のような不正値が来たときの挙動
- **手順:** `/?q=test&visibility=invalid` にアクセス
- **期待結果:** route の `validateSearch` が不正値を弾く（Issue #8 のパターン）。エラー表示またはパラメータが drop される

### 2. 検索結果ゼロ件

- **目的:** visibility フィルタで該当ノートがゼロになった場合
- **手順:** 該当ノートが存在しない visibility を指定（例: `/?q=test&visibility=public` で public ノートが無い owner で実行）
- **期待結果:** 「0 件のノート」表示、エラーは出ない

## 既存機能への影響確認

- **filter 経路の visibility フィルタ** (Issue #8/#28): 動作変化なし
- **search 経路の `q` 単独検索**: 結果件数・並び順に変化なし
- **search 経路の tag / directory / dateRange フィルタ**: 動作変化なし
- **`searchPublicNotes`**: `visibilityFilter = ['public']` 固定は維持。公開検索結果に変化なし
- **`NoteList` のバッジ表示**: Issue #29 では UI ガード (`mode === "filter"`) を撤廃しないため、search 結果でバッジが表示されない状態は ADR-004 通り意図的（フォロー Issue で `updatedAt` 実値化と同時に切り替え）
- **CalendarView**: ADR-014 のフォールバック（search 結果では「カレンダー表示非対応」文言）は継続

## 確認チェックリスト

- [ ] search 経路で `?visibility=public` がフィルタとして効く
- [ ] search 経路で `?visibility=private` がフィルタとして効く
- [ ] search 経路で `?visibility=unlisted` がフィルタとして効く
- [ ] search 経路で `visibility` 未指定なら全件
- [ ] filter 経路の visibility フィルタが従来通り動作
- [ ] 不正な visibility 値が安全に扱われる
- [ ] 検索結果ゼロ件のときエラーが出ない
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit` 全グリーン
