# 動作確認計画 — Issue #171: findByOwner chunk 経路の 2-pass 最適化

**Issue:** #171
**作成日:** 2026-05-23

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

本 Issue は D1 リポジトリ層の内部最適化で UI 表面挙動は不変が期待値。検証は integration テストで完結する:

```bash
pnpm test:integration -- noteRepository
```

UI 経由で確認したい場合は通常の dev サーバー:

```bash
pnpm db:apply:local   # スキーマ変更なしだが念のため
pnpm dev
```

### デプロイ方法

```bash
# staging への反映
pnpm deploy:staging
```

スキーマ変更なし（マイグレーション追加なし）のため `pnpm db:apply:staging` は不要。

## 確認項目

### 1. 既存 T-bind-008..014 が回帰しないこと

- **目的:** 2-pass 化前後で chunk 経路の振る舞いが等価であることの担保
- **手順:**
  1. `pnpm test:integration -- noteRepository`
  2. `T-bind-001..014` 全件 PASS を確認
- **期待結果:** 14 ケース全 PASS。失敗があれば 2-pass 化のロジック誤り（特に Pass 2 の order 復元、Pass 1 の sort、early return）
- **確認ポイント:** T-bind-009（offset/limit + sort DB 側順序一致）、T-bind-013（chunk seam 60+60）、T-bind-014（intersected 空短絡）

### 2. 新規 T-bind-015 が PASS すること

- **目的:** Pass 1 で `where` 追加述語（`status='active'`）が適用され、`idScope` から trashed 行が除外されることの観測
- **手順:**
  1. `pnpm test:integration -- noteRepository`
  2. `T-bind-015` の PASS を確認
- **期待結果:** 100 件 active + public が返り、50 件 trashed + public は除外される
- **確認ポイント:** `pnpm test:integration` のテスト時間が著しく劣化していないこと

### 3. application 層の regression なし

- **目的:** `findByOwner` を経由する usecase（`listNotesByOwner`、`rebuildSearchIndex`、`deleteTag` / `mergeTags` / `renameTag` の page loop、`handleUserDeletedEvent`）が引き続き動作すること
- **手順:**
  1. `pnpm test:integration app/core/application/note`
  2. 関連 usecase テスト全件 PASS を確認
- **期待結果:** regression なし

### 4. typecheck / lint / format

- **目的:** generic 化した `sortRowsByColumn` と Pass 1 の dynamic projection で型エラーが出ないこと
- **手順:**
  ```bash
  pnpm typecheck
  pnpm lint:fix
  pnpm format
  ```
- **期待結果:** 全 PASS（新規警告ゼロ）

## エッジケース・異常系

### 1. `idScope === null` 経路の non-regression

- **目的:** filter 未指定（`tagIds === undefined` and `visibility` が wantsPrivate or 未指定）で 2-pass 経路に誤って分岐しないこと
- **手順:** `T-bind-001..003` 系（既存 single-query 経路カバー）の PASS 確認
- **期待結果:** `idScope === null` 経路は 1 クエリで完結し、Pass 1/Pass 2 を経由しない

### 2. `pageIds.length === 0` の早期短絡

- **目的:** Pass 1 で `where` 述語により全 id が除外された場合、Pass 2 を呼ばずに `[]` を返すこと
- **手順:** 既存 T-bind-014（intersected 空）+ 新規 T-bind-015 の active 0 件パターンが PASS
- **期待結果:** `selectInChunks([], ...)` を呼ばずに早期 return

## 既存機能への影響確認

- **ノート一覧 UI（`/notes`）**: 表示順、ページネーション、フィルタ（公開状態 / タグ / 期間）が変わらない
- **タグ削除/マージ/リネーム**: 各 usecase が `findByOwner` で page loop しているため、500 件単位の処理が引き続き動く
- **検索インデックス再構築**: `rebuildSearchIndex` が `findByOwner` で 50 件単位の page loop を回しているため、全件処理が引き続き動く

## 確認チェックリスト

- [ ] `pnpm test:integration -- noteRepository` で T-bind-001..015 全 PASS
- [ ] `pnpm test:integration app/core/application/note` 全 PASS
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` クリーン
- [ ] T-bind-014（intersected 空）が変わらず `[]` を返す
- [ ] T-bind-015 で trashed 行が除外される

## 任意: staging でのプロファイル確認

`contentHtml` の大きいオーナーが存在する staging 環境で `listNotesByOwner` を叩き、Workers の `cpu_time` / `memory` ログを観測。本 PR 前後で OOM や著しいレイテンシ増加がないことを確認（PR 必須項目ではない）。
