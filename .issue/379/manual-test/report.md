# ブラウザ検証レポート — Issue #379

**Issue**: #379 ゴミ箱(trashed)ノートの詳細ページがエラーになり表示できない
**実行日**: 2026-05-31
**ブランチ**: issue/379/fix-trashed-note-detail-error
**サーバー**: http://localhost:3179（pnpm dev）
**テストソース**: .issue/379/testing.md

## 結論

Issue #379 の修正は意図どおり機能している。trashed ノートの詳細ページが、通常状態（publication=private）でも trash イベント未処理のエッジ（publication=public + active share_link 残存）でもエラー境界に落ちず描画されることを確認した。active ノートの詳細ページ（ホットパス）も従来どおり動作する。

## 検証結果

| TC | 結果 | 要点 |
|----|------|------|
| TC-001 trashed/非公開 | PASS | 本文表示、状態「ゴミ箱」、アクションは「ゴミ箱を開く」のみ |
| TC-002 trashed/公開状態残存エッジ | PASS | 本文表示、公開系アクションなし。`listShareLinks` の throw を `.catch` が吸収 |
| TC-003 active/公開 | PASS | 公開状態チップ「公開」、編集・公開設定等の通常アクション一式 |
| EC-001 非存在 noteId | FAIL（スコープ外） | 既知の RSC `notFound()` 非伝播挙動。NotFound は握りつぶされていない |

合計 4 件（PASS 3 / FAIL 1）。FAIL は #379 スコープ外の既存・既知挙動（詳細は results/summary.md）。

## 修正内容（検証対象）

`app/components/note/detail/NoteDetail.tsx` の `Promise.all` 内で `loadPublishStateForNote` の promise に `.catch` を付与し、`isBusinessRuleError(e) && e.code === NoteErrorCode.Trashed` のときだけ `{ visibility: "private", publishedAt: null, links: [] }` にフォールバックする。それ以外のエラーは再 throw。

## 成果物

- テスト結果サマリー: .issue/379/manual-test/results/summary.md
- スクリーンショット: .issue/379/manual-test/screenshots/
- シードデータ: .issue/379/manual-test/seed.sql

## 環境後始末

- 検証用ノート（id `019e7900-...`）は seed.sql で再投入可能。検証後にローカル D1 から削除済み。
- dev サーバーは検証後に停止。
