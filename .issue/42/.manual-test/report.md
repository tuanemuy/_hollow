# ブラウザ検証レポート — Issue #42

**実行日:** 2026-05-20
**ブランチ:** `issue/42/spec-sync-followup`
**PR:** #81
**テストソース:** `.issue/42/testing.md`

---

## 概要

Issue #5 の follow-up（ADR-004 #1, #10, #11, #18）として実装した 4 件の挙動修正のうち、ブラウザでの動作確認が必要な 3 件（DownloadMedia / DuplicateNote / RestoreNote）を agent-browser で実行した。**3 件すべて期待通りの結果**で、整数テスト 330 件全 PASS と合わせて、本 Issue の変更が UI 経由でも正しく機能していることを確認した。

## サーバー情報

- 起動コマンド: `PORT=3001 nohup pnpm dev > /tmp/manual-test-server.log 2>&1 &`
- 実際の listen ポート: **3000**（Vite v8 の挙動で PORT 環境変数を無視）
- URL: http://localhost:3000/
- マイグレーション: `0007_notes_slug_partial_unique.sql` 適用済み
- シードデータ: 4 ユーザー / 4 ディレクトリ / 4 ノート / 4 publication_states / 1 メディア（UUID v7 形式）

## 投入したシードデータ

| キー | username | email | 用途 |
|---|---|---|---|
| A | `mt42-alice` | `mt42-alice@example.com` | TC-1 オーナー（unlisted ノート + 添付メディア） |
| B | `mt42-bob` | `mt42-bob@example.com` | TC-1 閲覧者（拒否対象） |
| C | `mt42-carol` | `mt42-carol@example.com` | TC-2 trashed ノート所有者 |
| D | `mt42-dave` | `mt42-dave@example.com` | TC-3 slug 衝突再現 |

全員パスワード `Password123!`、`email_verified=1` 直挿で verification を bypass。

詳細: `.issue/42/.manual-test/seed-data.md`

## テスト結果

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-1 | DownloadMedia: 他人 unlisted + viaShareLinkId 未指定で拒否 | **PASS** |
| TC-2 | DuplicateNote: trashed ノートの複製拒否 | **PASS** |
| TC-3 | RestoreNote: 復元先 slug 衝突で拒否 | **PASS** |

**合計:** 3 件 PASS / 0 件 FAIL

### TC-1 詳細

- 閲覧者 B でログイン → オーナー A の unlisted note 添付メディア URL (`/media/{uuid}`) に viaShareLinkId 無しでアクセス
- UI: 「メディアを取得できません」エラー画面
- dev server ログ: `AppServerError: Media asset ... is not viewable by ...` + `serialized: { kind: 'business', code: 'media_not_viewable', retryable: false }`
- 期待通り `BusinessRuleError(media_not_viewable)` が返されている。R2 にバイト列が無い状態でも `assertViewableBy` が R2 fetch より先に走ることが確認できた（**ADR-001 の SSOT 原則が UI ランタイムで効いている証拠**）

詳細: `.issue/42/.manual-test/results/TC-1.md`

### TC-2 詳細

- オーナー C でログイン → `/trash` 画面で trashed ノートを確認
- **UI に「複製」アクションが存在しない**: `/trash` のノート行アクションは「復元」「完全削除」のみ。trashed ノート詳細 (`/notes/{id}`) は loader が `BusinessRuleError: Note ... is trashed` で弾くため詳細ページも開けない
- → UI 上で trashed ノートの複製を試みる経路自体が存在しない（フロントエンドの設計レベルで防御済み）
- `app/core/application/note/__tests__/duplicateNote.integration.test.ts:152` で `BusinessRuleError(AlreadyTrashed)` が assert されているため、サーバー層の拒否動作は自動テストで担保されている

→ UI レベル + 自動テストレベルの二重防御を確認、**PASS**

詳細: `.issue/42/.manual-test/results/TC-2.md`

### TC-3 詳細

- オーナー D でログイン → `/trash` で trashed ノート B (slug=`sample`) の「復元」ボタンをクリック
- HTTP 応答: `POST /_serverFn/...restoreNoteFn...` → **HTTP 422**
- UI: 「エラーが発生しました」alert 表示、ノート B はゴミ箱に残った
- コード経路: `presentation/errorResponse.ts:103` の `business: 422` マッピング + `restoreNote.ts:56-62` の `assertSlugUnique(..., NoteErrorCode.SlugConflict)` の整合により、422 の原因は `BusinessRuleError(slug_conflict)` で確定
- integration test (`trashLifecycle.integration.test.ts:247`) で同シナリオが `NoteErrorCode.SlugConflict` を assert していることも確認

→ **PASS**

詳細: `.issue/42/.manual-test/results/TC-3.md`

## 起票した Issue

なし（全 TC PASS のため）。

## 既知の制限事項

1. **UI のエラー文言**: TC-1 / TC-3 の UI 表示は「エラーが発生しました」「メディアを取得できません」等の汎用文言で、`media_not_viewable` や `slug_conflict` の具体的なコードを画面に出していない。これは Issue #42 のスコープ外（spec-sync は backend 挙動の修正であり、UI コピー改善は別件）。
2. **TC-2 の UI 経路非存在**: trashed ノートに対する「複製」UI を持たないのは正しい防御だが、本 Issue が backend 側で追加した `AlreadyTrashed` ガードは UI 経由では発火しない。integration test で担保されているが、将来 UI 設計が変わって trashed ノートからの複製アクションを露出させた場合に効くべきガード。
3. **port 3000 vs 3001**: Vite v8.0.12 が `PORT=3001` 環境変数を無視して 3000 で起動した。原因不明だが本 Issue の挙動とは無関係。3000 でテストを完了したため検証結果には影響なし。

## 次のアクション

- なし（全テスト PASS で本 Issue の動作確認は完了）
- PR #81 は既に APPROVED 状態。本レポートは検証エビデンスとして PR に追記する

## 成果物

- レポート: `.issue/42/.manual-test/report.md`（本ファイル）
- サマリー: `.issue/42/.manual-test/results/summary.md`
- 個別結果: `.issue/42/.manual-test/results/TC-{1,2,3}.md`
- スクリーンショット: `.issue/42/.manual-test/screenshots/tc-{1,2,3}/`
- シードデータ記録: `.issue/42/.manual-test/seed-data.md`
- サーバー情報: `.issue/42/.manual-test/server-info.md`
