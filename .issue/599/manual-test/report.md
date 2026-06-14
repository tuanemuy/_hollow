# ブラウザ検証レポート — Issue #599

**実行日:** 2026-06-14
**ブランチ:** issue/599/rsc-notfound-error-page
**テストソース:** .issue/599/testing.md
**サーバー:** http://localhost:3000（`pnpm dev`, workerd）

## 結果サマリー

| TC | 種別 | URL | 期待 | 実際 | 結果 |
|----|------|-----|------|------|------|
| TC-1 | 異常系(AC-1) | `/notes/public/<存在しないid>` | 410 gone | 410「このノートは公開されていません」 | PASS |
| TC-2 | 異常系(AC-1/4) | `/notes/public/<非公開id>` | TC-1と同一 410 | 410 完全一致（列挙耐性あり） | PASS |
| TC-3 | 異常系(AC-2) | `/u/dev-admin/<存在しないslug>` | 410 gone | 410「このノートは公開されていません」 | PASS |
| TC-4 | 異常系(AC-3) | `/u/<存在しないuser>` | 404 notFound | 404「ページが見つかりません」 | PASS |
| TC-5 | 回帰(AC-5) | 公開ノート詳細（id / slug 両入口） | 正常表示 | タイトル・本文・関連とも正常 | PASS |
| TC-6 | 回帰(AC-5) | `/u/dev-admin` | 正常表示 | プロフィール・一覧とも正常 | PASS |

**合計: 6 件（PASS: 6 / FAIL: 0）**

## 結論

全 TC で 500「予期しないエラーが発生しました」は一切発生せず、RSC 内の notFound が意図どおり `ErrorPage`（410 gone / 404 notFound）に届いている。Issue #599 の根本原因（RSC 二段 loader 内 notFound 非伝播）が、`PublicNoteDetail` / `UserPublicTop` 内で notFound を捕捉して ErrorPage を直接 return する方式（ADR-004）で解消された。`/notes/public/$noteId`・`/u/$username/$noteSlug`・`/u/$username` の3ルートすべてで修正を確認。正常系・列挙耐性の回帰なし。

起票した Issue: なし（全 PASS）。
