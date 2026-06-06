# テスト実行サマリー — Issue #496

**実行日時**: 2026-06-06
**テストソース**: .issue/496/testing.md
**サーバー**: http://127.0.0.1:8787（`pnpm build && pnpm start` = wrangler dev）
**ログインユーザー**: test-user-001@example.com（既存シードユーザー、`__Host-session` cookie でセッション注入）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | private ノート詳細の公開状態表示 | 正常系 | PASS | - |
| TC-002 | public ノート詳細の visibility・公開日時 | 正常系 | PASS | - |
| TC-003 | 共有リンク一覧の表示（公開設定ダイアログ） | 正常系 | PASS | - |
| TC-004 | trashed ノート詳細のフォールバック表示 | 異常系 | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## 証拠について

agent-browser のアクセシビリティツリースナップショットを各ケースの証拠として取得した（本文に転記）。スクリーンショットファイル（PNG）は agent-browser デーモンの cwd 解決の都合で保存に失敗したが、テキストスナップショットで公開状態・公開日・共有リンク・フォールバックの各表示を確認済み。

## 補足（ブラウザ未検証だが他手段で担保済みの項目）

- **他人のノートアクセス拒否（testing.md エッジケース2）**: `getPublicationState.integration.test.ts` の ForbiddenError ケースで担保。
- **FilterBar の参照チップ表示（loadReferencingNoteTitle）**: 本Issueで未変更のため挙動不変（判断B）。
