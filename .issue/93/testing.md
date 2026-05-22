# 動作確認計画 — Issue #93: bulkRebuildFromSnapshots を呼ぶ admin operation / worker 経路の配線

**Issue:** #93
**作成日:** 2026-05-22

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（初回 or schema 変更時のみ必要）
pnpm dev          # vite + workerd で http://localhost:8787 に起動
```

### デプロイ方法

```bash
# staging へデプロイ
pnpm deploy:staging   # ローカル D1 で確認後の staging 反映
# 必要に応じて sibling workers も
pnpm deploy:staging:relay && pnpm deploy:staging:consumer
```

本番は `pnpm deploy:production`（dry-run は `pnpm deploy:production:dry`）。

### テスト

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
pnpm test:unit
pnpm test:integration
```

---

## 確認項目

### 1. admin 権限のあるユーザーから rebuild ボタンが動作する

- **目的:** `rebuildSearchIndexFn` server-fn が起動し、`bulkRebuildFromSnapshots` が adapter で実行されること
- **手順:**
  1. admin ロールを持つアカウントでログイン
  2. `/admin/jobs` にアクセス
  3. 「検索インデックスを再構築」セクションのボタンをクリック
  4. レスポンスとして `processedCount`、`startedAt`、`finishedAt` が表示されることを確認
- **期待結果:** `processedCount` が DB の active ノート数と一致、`finishedAt > startedAt`、エラー表示なし
- **確認ポイント:** ボタンクリック中はボタンが disabled になっていること（多重押下防止）

### 2. rebuild 後に `/search` で結果が返る

- **目的:** rebuild により `search_documents` が再構築され、検索クエリが期待結果を返すこと
- **手順:**
  1. 事前に複数の note を作成（タイトル/本文/タグ/visibility がばらつくように）
  2. `/admin/jobs` で rebuild を実行
  3. `/search?keyword=<キーワード>` または UI 上の検索ボックスから検索
- **期待結果:** rebuild 直後でも該当 note がヒットする、スニペットとタグが正しく表示される
- **確認ポイント:** trashed status の note はヒットしないこと

### 3. visibility / tagNames / directoryPath が snapshot から正しく投影される

- **目的:** `buildNoteSnapshots` が複数 repository を跨いで snapshot を構築できていること
- **手順:**
  1. 1 ノートを public、1 ノートを private、1 ノートにタグ複数付与、1 ノートを特定 directory 配下に配置
  2. rebuild 実行
  3. `/search` で各検索条件（タグフィルタ、visibility、directory prefix）を試す
- **期待結果:** 各ファセットフィルタが期待通り絞り込む
- **確認ポイント:** `frontMatter.date` を持つ note は `dateForCalendar` に反映、未指定なら `updatedAt` が使われる

---

## エッジケース・異常系

### 1. non-admin ユーザーが rebuild を叩いた場合

- **目的:** 認可エラーで弾かれること
- **手順:**
  1. member ロールのユーザーでログイン
  2. ブラウザ devtools または curl で `rebuildSearchIndexFn` のエンドポイントを直接叩く
- **期待結果:** `ForbiddenError('FORBIDDEN_ADMIN_ONLY')` 相当の構造化エラー（HTTP 403）が返る

### 2. 0 ノートでの rebuild

- **目的:** 空 corpus でも正常終了すること
- **手順:**
  1. 新規ローカル DB（全 note 削除済み）
  2. admin でログイン → rebuild 実行
- **期待結果:** `processedCount === 0`、エラーなし、`search_documents` は空のまま

### 3. trashed note の除外

- **目的:** active 以外の note が index に流れないこと
- **手順:**
  1. 1 ノートを通常作成、1 ノートを trashed にする
  2. rebuild 実行
  3. `/search?keyword=<trashed のキーワード>` で検索
- **期待結果:** trashed ノートはヒットしない

---

## 既存機能への影響確認

- **migration 内リビルド経路**: 本 Issue では migration を変更しないため影響なし。`pnpm db:migrate` がエラーなく走ることだけ確認
- **個別 upsert / delete 経路**: `searchIndex.upsert` / `delete` の port 契約は変更なし。既存の `consumeIndexJob` integration test が PASS することを `pnpm test:integration` で確認
- **`/search` クエリ**: D1SearchIndex.query は変更なし。既存の search-related integration test が PASS することを確認

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラーなく完了
- [ ] `pnpm lint:fix && pnpm format` で差分なし
- [ ] `pnpm test:unit` 全件 PASS（新規 rebuildSearchIndex unit test 含む）
- [ ] `pnpm test:integration` 全件 PASS（新規 rebuildSearchIndex integration test 含む、他テストとの干渉なし）
- [ ] admin から `/admin/jobs` の rebuild ボタンで `processedCount` が返る
- [ ] rebuild 後 `/search` で active note が hit
- [ ] non-admin で 403 が返る
- [ ] 0 ノートで `processedCount === 0` & エラーなし
- [ ] trashed note が index にない
- [ ] ボタンが実行中 disabled
