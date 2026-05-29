# Issue #215 ブラウザ検証レポート

**実行日時:** 2026-05-29
**テストソース:** `.issue/215/testing.md`
**サーバー:** http://localhost:3001/ （`pnpm dev`、Vite + Cloudflare）
**セッション:** `verify-issue-215`
**検証範囲:** 軽量検証（未ログイン状態で確認できる項目のみ）

---

## 結果サマリー

| TC | テスト名 | 種別 | 結果 | 確認した URL |
|----|---------|------|------|--------------|
| TC-1 | ホーム `/` 初期遷移 | 正常系 | PASS | `http://localhost:3001/` |
| TC-2 | `/u/existing-user` 初期遷移 | 正常系 | PASS | `http://localhost:3001/u/existing-user` |
| TC-3 | 既存 `?page=1&limit=20` URL 互換性 | エッジケース | PASS | `http://localhost:3001/?page=1&limit=20`（保持・エラーなし） |
| TC-4 | ランディング → Hollow ロゴクリック | 正常系 | PASS | `http://localhost:3001/` |

**合計:** 4 件（PASS: 4 / FAIL: 0）

## 観察ポイント

- すべての初期遷移・Link 経由の遷移で URL にデフォルトクエリ（`?page=1&limit=20`）が **付与されないこと** を確認できた。
- 修正方針（`HOME_SEARCH` 等を空オブジェクト化 + schema を input/output 共に optional 化）が意図通り機能している。
- TC-3 で既存の `?page=1&limit=20` 付き URL を直接開いても、ページが正常にレンダリングされてクエリも保持された。schema 側の `.catch()` + `.optional()` で吸収されているため、後方互換性が崩れていない。
- TC-4 で `<Link to="/" search={HOME_SEARCH}>`（`HOME_SEARCH = {}`）を経由したロゴクリックでも、URL にクエリが付与されないことを実機で確認。

## 検証されなかった項目（testing.md からの除外）

ログインを要する以下のフローは、未ログイン状態では確認できないためスキップ：
- `/trash` 初期遷移（項目 2）
- `/notes/$noteId/history` 初期遷移とページ送り（項目 3、項目 7 の一部）
- 表示モード切替（項目 5）
- フィルター変更（項目 6）
- SavedView 選択（エッジケース 2）

これらの項目は以下で挙動が担保されている：
- **unit test** — `DisplayModeSwitch.test.tsx` が表示モード切替の navigate payload で `{display: 'calendar'}` のみであることを検証（`page` / `limit` を含まない）。
- **schema test** — `schema.test.ts` が `noteListSearchSchema.parse({})` で `page` / `limit` が `undefined` になることを検証。
- **structural type check** — `pagination.ts` の `_PaginationSearchSchemaMatches` 型アサーションが output の optional 性を担保。

PR の Test plan セクションに残り項目の手動確認を明記しており、レビュアーが必要に応じて確認できる。

## スクリーンショット

| TC | パス |
|----|------|
| TC-1 | `.issue/215/manual-test/screenshots/tc1-home-initial.png` |
| TC-2 | `.issue/215/manual-test/screenshots/tc2-userpublic-initial.png` |
| TC-3 | `.issue/215/manual-test/screenshots/tc3-home-with-query.png` |
| TC-4 | `.issue/215/manual-test/screenshots/tc4-landing-to-home.png` |

## クリーンアップ

- agent-browser セッション `verify-issue-215` を `close` で終了
- バックグラウンドの dev サーバー（PID `/tmp/manual-test-server-215.pid`）を停止
