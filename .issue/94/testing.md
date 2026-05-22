# 動作確認計画 — Issue #94: saved_views filter application doesn't reflect in note list

**Issue:** #94
**作成日:** 2026-05-22

---

## 確認環境

### 検証環境の起動

```bash
# マイグレーション適用（初回のみ。`predev` でも `wrangler types` は走るがマイグレーションは別）
pnpm db:apply:local

# シード投入（既存データを事前に空にしてから投入する想定。手順は .issue/52/manual-test/seed-data.md 参照）
pnpm db:execute:local .issue/30/manual-test/seed.sql

# 開発サーバー起動
pnpm dev
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. SavedView 適用でノート一覧が tag フィルタで絞り込まれる

- **目的:** Issue 本文の「実際: 全 10 件表示」を「期待: `#work` / `#todo` 付きノートのみ表示」に修正できていることを確認する。
- **手順:**
  1. ブラウザで `http://localhost:5173/` を開く（ポートは `pnpm dev` の出力で確認）
  2. `test-user-001@example.com / TestPassword123!` でログイン
  3. ホーム `/` で保存ビュー dropdown から「作業中のタスク」を選択
  4. URL に `viewId=01938f00-0000-7000-8000-00000000d071` が反映されることを確認
- **期待結果:** ノート一覧が `#work` / `#todo` タグ付きノートのみに絞り込まれる（10 件全部ではない）。
- **確認ポイント:** FilterBar の tag chip 表示と一覧件数が整合していること。

### 2. URL から `viewId` を外すと全件表示に戻る

- **目的:** SavedView 適用の解除が正しく機能することを確認。
- **手順:**
  1. 上記 1 の状態から URL の `viewId` クエリパラメータを削除して再読み込み
- **期待結果:** ノート一覧が再び全 10 件表示される。

### 3. 既存の URL パラメータが SavedView より優先される

- **目的:** `baseSearch = { ...restored, ...search }` の優先順位が壊れていないことを確認。
- **手順:**
  1. URL に `?viewId=01938f00-0000-7000-8000-00000000d071&q=任意のキーワード` を付けて開く
- **期待結果:** SavedView の tag フィルタは適用された上で、URL の `q` がキーワード検索として効く（`searchOwnNotes` path に乗る）。

## エッジケース・異常系

### 1. SavedView が存在しない `viewId`

- **目的:** 不正な `viewId` でホームが壊れないこと。
- **手順:**
  1. URL に `?viewId=00000000-0000-0000-0000-000000000000` を付けて開く
- **期待結果:** SavedView が null として扱われ、`baseSearch = search` のまま全件表示。500 にならない。

## 既存機能への影響確認

- 通常のホーム表示（`viewId` なし）でレイテンシ・件数が回帰していないこと（`loadAllTags` の追加 await は `cache()` ヒットのみで起きるが、`viewId` 分岐内のみ走るので通常 path は無変更）。
- ユニットテスト（`listSelectors.test.ts`）の resolver 経路ケースが引き続きパスすること。

## 確認チェックリスト

- [ ] SavedView「作業中のタスク」適用後、ノート一覧が tag で絞り込まれる
- [ ] URL から `viewId` を外すと全件表示に戻る
- [ ] `viewId` + `q` の同時指定で両方のフィルタが効く
- [ ] 不正な `viewId` でも 500 にならず全件表示にフォールバック
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が通る
- [ ] `pnpm test:unit` が通る
