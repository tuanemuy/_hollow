# 動作確認計画 — Issue #52: saved_views seed の query_json 構造とリポジトリデコーダの不整合

**Issue:** #52
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更は manual-test 用シードファイルの修正のみ。コードの挙動には変更がない。`saved_views` 行を含むシードを投入した状態でホーム `/` を開いて 500 が出ないことを確認する。

### 検証環境の起動

```bash
pnpm db:execute:local --file=.issue/30/manual-test/seed.sql
pnpm dev
```

`http://localhost:3000` で TanStack Start アプリが起動する。

> 既に saved_views 行が古い形で投入された local D1 がある場合、再投入の前に手動で `DELETE FROM saved_views;` するか、`wrangler d1 execute tanstack-start-template-d1 --local --command 'DELETE FROM saved_views;'` を実行する。

### デプロイ方法

なし（シードファイルは manual-test 専用で、ステージング・本番に投入されることはない）。

## 確認項目

### 1. saved_views 行を含むシードを投入した状態でホームが 200 を返す

- **目的:** 修正後の `query_json` / `sort_json` が `decodeQueryJson` / `decodeSortJson` を通り、`renderHome` が SavedView の rehydrate に成功すること
- **手順:**
  1. `.issue/30/manual-test/seed.sql` を local D1 に投入
  2. `pnpm dev` で起動
  3. `test-user-001@example.com / TestPassword123!` でログイン
  4. ホーム `/` を開く
- **期待結果:** 500 にならずホームが表示される
- **確認ポイント:** ブラウザの DevTools / サーバーログに `Saved view ... query_json.directoryId is not a string|null` が出ないこと

### 2. 保存ビュー「作業中のタスク」が UI 上で読み出せる

- **目的:** decode 後の `SavedView` が正しい `ViewQuery` で復元され、UI から扱えること
- **手順:**
  1. ホーム `/` で保存ビュー一覧 UI を開く（サイドバーやドロップダウンなど、実装に応じて）
  2. 「作業中のタスク」を選択 / 適用する
- **期待結果:** ビューが適用され、`work` / `todo` タグに紐づくノートが絞り込まれて表示される（タグフィルタが効いている）

## エッジケース・異常系

### 1. 他の seed.sql（.issue/1, .issue/8, .issue/29）でも同様に 200 になる

- **目的:** 4 ファイルすべてに同じ修正を適用したことを確認
- **手順:**
  1. local D1 を `DELETE FROM saved_views;` でクリア
  2. `.issue/1/manual-test/seed.sql` の saved_views ブロックだけを `wrangler d1 execute ... --command` で投入し直す（または別 DB で）
  3. ホームを開く
  4. `.issue/8/manual-test/seed.sql`、`.issue/29/.manual-test/seed.sql` も同様に確認
- **期待結果:** いずれも 500 にならない

## 既存機能への影響確認

- **コード変更なし** — `app/` 配下に変更は入らないため、自動テスト・既存機能への regression リスクはなし
- **シード以外の seed.sql ファイル** — `.issue/32/manual-test/seed.sql` には saved_views 行がない（影響なし）、`.issue/12/manual-test/seed.sql` の `view_query_json` は `research_sessions` テーブルの別カラムでスコープ外

## 確認チェックリスト

- [ ] `.issue/30/manual-test/seed.sql` 投入後にホームが 200
- [ ] ホームに「作業中のタスク」saved view が表示・適用できる
- [ ] `.issue/1/manual-test/seed.sql` の saved_views でも 200
- [ ] `.issue/8/manual-test/seed.sql` の saved_views でも 200
- [ ] `.issue/29/.manual-test/seed.sql` の saved_views でも 200
- [ ] サーバーログに DataIntegrityError が出ない
