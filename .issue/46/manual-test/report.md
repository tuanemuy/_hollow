# ブラウザ検証レポート — Issue #46

**実行日**: 2026-06-01
**テストソース**: `.issue/46/testing.md`
**サーバー**: http://localhost:8787（`pnpm build && pnpm start` = wrangler dev、local D1 `hollow-local-d1`）
**検証ユーザー**: tester46@example.com（ブラウザでサインアップ → DB で `email_verified=1` 付与してログイン）

## シードデータ

`.issue/46/manual-test/seed.sql`（owner=tester46 の root directory 配下）:

- **Target Note 46**（`019e8200-…-001`）: 被リンク 7 件（active 6 + trashed 1）
- **Lonely Note 46**（`019e8200-…-002`）: 被リンク 0 件
- 被リンク元 Referrer 1〜6（active）/ Referrer 7（trashed、updatedAt 最新）
- `note_internal_links` を `resolved_note_id=Target` で 7 行（ref_kind='id'）

## 結果サマリー

| TC | テスト名 | 結果 | 観測値 |
|----|---------|------|--------|
| TC-1 | 詳細ページ inline backlinks の top-N 絞り込み + 総数表示 | PASS | inline ちょうど5件 / 件数表示「（7 件）」 / preview に trashed Referrer 7 含む（updatedAt 降順 7,6,5,4,3） |
| TC-2 | referrer 0 件のノート | PASS | 「なし」表示 + 「（0 件）」 |
| TC-3 | backlink の title / snippet 表示（DTO 形状不変） | PASS | 各項目に title + 本文 snippet を表示 |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 確認できたこと

- `getNoteDetail` の `BACKLINK_PREVIEW_LIMIT = 5` が効き、inline リストが全件ではなく最大 5 件に絞られる（10000 件 inline 描画を防ぐ Issue の意図を満たす）。
- 件数表示が `backlinks.length`（=preview の5）ではなく `backlinkCount`（=総数7）を示す。loader → `NoteDetail` → `NoteMetaPanel` への `backlinkCount` 透過配線が end-to-end で機能。
- `findReferrers` と `countByOwner({ referencingNoteId })` の母集合一致: **trashed referrer も count・preview の両方に含まれる**（status スコープのズレなし）。
- 0 件ケースの「なし / （0 件）」、backlink の title/snippet 表示（DTO 形状不変）が回帰なし。

## スクリーンショット

- `screenshots/signup-result.png` — サインアップ完了（メール確認画面）
- `screenshots/tc1-backlinks.png` — Target Note のバックリンク（5件 + 「（7 件）」）
- `screenshots/tc2-no-backlinks.png` — Lonely Note（なし + 「（0 件）」）

## 備考（環境）

- このアプリはサインアップ時にメール確認必須。テストでは DB の `users.email_verified` を直接 1 にしてログインを通した（テスト環境のみ）。
- ログインフォームは送信ボタン click では submit が発火せず、password 欄で Enter 押下が必要だった（agent-browser 操作上の知見）。メモの「server-function POST が 403」事象は今回（正規の Enter 送信）では発生せず。

起票した Issue: なし（全 PASS）。
