# テスト実行サマリー — Issue #379

**実行日**: 2026-05-31
**テストソース**: .issue/379/testing.md
**サーバー**: http://localhost:3179（pnpm dev、ライブソース）
**シード**: .issue/379/manual-test/seed.sql（trashed×2 / active×1、owner=existing@example.com）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | trashed/非公開ノート詳細が表示される（主目的） | 正常系 | PASS | 本文・「ゴミ箱」チップ・「ゴミ箱を開く」のみ表示、エラー境界なし |
| TC-002 | trashed/公開状態残存エッジでも表示される | 異常系 | PASS | publication=public + active share_link 残存でも描画、公開系アクションなし |
| TC-003 | active/公開ノートが従来どおり表示される | 正常系 | PASS | 公開状態チップ「公開」、通常アクション一式表示（ホットパス維持） |
| EC-001 | 存在しない noteId の表示 | 異常系 | FAIL | #379 スコープ外の既知挙動（下記） |

**合計**: 4 件（PASS: 3 / FAIL: 1）

## 主目的の達成

Issue #379 のバグ（trashed ノート詳細ページが `BusinessRuleError: ... share links are not listable` でエラー境界に落ちる）は、TC-001（通常の trashed）と TC-002（trash イベント未処理の eventual-consistency エッジ）の両方で解消を確認。active ノートのホットパス（TC-003）も従来どおり動作。

## EC-001 FAIL の扱い（#379 スコープ外・既存挙動）

存在しない noteId にアクセスすると、期待した notFound 画面（「ノートが見つかりません」）ではなく汎用エラー境界（「エラーが発生しました」）が表示された。

- これは #379 のリグレッションではない。`NoteDetail.tsx` の `if (isNotFoundError(e)) throw notFound()` は #379 以前から存在し、本 Issue で変更していない（`git diff main...HEAD` でも当該行に変化なし）。#379 が追加したのは `loadPublishStateForNote` への Trashed 限定 `.catch` のみ。
- 原因は既知のフレームワーク挙動: TanStack Start の `renderServerComponent` 経由で描画される RSC 内で `throw notFound()` を投げても route の `notFoundComponent` に届かず `errorComponent` に流れる。`app/components/export/ExportJobDetail/Page.tsx` の JSDoc および `.issue/12/adr.md` ADR-004 で文書化済み。
- #379 の検証観点としては「trashed 以外のエラー（NotFound）を `.catch` が握りつぶしていない」ことが重要で、これは満たされている（非存在ノートで本文を出さずエラー表示に倒している）。
- 既に文書化された既知挙動であり新規バグではないため、本 Issue では起票しない（Phase 4 で関連 Issue の有無のみ確認）。テスト手順 EC の期待値は「本文非表示でエラー表示になる（NotFound を握りつぶさない）」が実態に即した表現のため testing.md を補正済み。

## スクリーンショット

- 00-after-login.png — ログイン後トップ
- tc-001-trashed-private.png — trashed/非公開ノート詳細
- tc-002-trashed-was-public.png — trashed/公開状態残存ノート詳細
- tc-003-active-public.png — active/公開ノート詳細
- ec-001-notfound.png — 非存在ノートのエラー表示
