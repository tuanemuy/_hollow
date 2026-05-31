# ブラウザ検証レポート — Issue #389: ノート一覧ビューのUI改善

**実行日時**: 2026-06-01
**テストソース**: `.issue/389/testing.md`
**サーバー**: http://localhost:3100/（`pnpm dev --port 3100`、ソース直結）
**検証ブランチ**: `issue/389/note-list-ui-improvements`

## 結果サマリー

**7 件中 7 件 PASS（FAIL 0 / 起票 Issue 0）**

| 受け入れ条件 | 結果 |
|---|---|
| フィルター下端とリスト先頭で罫線が二重に見えない | PASS |
| タイルのサムネイル枠削除・タイトル/抜粋/メタ主体カード | PASS |
| ListView の更新日時重複が解消 | PASS |
| リスト/タイルの表示情報が揃う | PASS |
| visibility 系ユーティリティ重複の解消（共有化、目視で同色チップ確認） | PASS |

## 検証詳細

### TC-001 罫線の二重表示解消（リスト）
FilterBar の `border-b` 1本のみで、リスト先頭行に `border-t` が付かない。行間は `<ul>` の `divide-y divide-hairline` による単線 divider のみ。`tc01-list-top.png` / `tc01-list-rows.png`。

### TC-002 タイルのサムネイル枠廃止
`aspect-[16/9]` のサムネイル枠（`img` とグラデーションフォールバック）が消え、タイトル（2行クランプ）・抜粋・メタ行のカードに。`tc02-tile-top.png` / `tc02-tile-rest.png`。

### TC-003 更新日時の重複解消
リスト各行の更新日時は右カラムに1回のみ。メタ行に重複表示なし。

### TC-004 リスト/タイルの情報量統一
両ビューで「タグ・公開状態チップ・更新日時」を表示。公開＝緑 / 限定公開＝橙 / 非公開＝グレーの色分けが一致（共有 `list/styles.ts` 由来）。

### TC-E01 長いタグ名のタイル折り返し
45文字のタグ名がカード内で `min-w-0 break-words` により折り返し、はみ出しなし（非公開ノートのタイルで確認）。

### TC-E02 タグなし/抜粋なしノート
メタ行レイアウトが崩れない。

### TC-R01 公開プロフィール回帰
`thumbnailUrl` 除去後も `UserPublicTop`（`/u/test389`）が正常表示。公開ノート2件、サムネイル無し・エラー無し。`regression-public-profile.png`。

## 補足

検証開始時、シードのタグ名が57文字で `TagName` の最大長（50文字）不変条件に違反し、ノート一覧が `RehydrationError → SystemError` でエラー表示になった。これは**シードデータ不備**であり実装の問題ではないため、その場でタグ名を45文字に短縮（`seed.sql` も冪等に修正）して再検証し、全項目 PASS を確認した。Issue 起票は不要。

## 成果物

- レポート: `.issue/389/manual-test/report.md`
- サマリー: `.issue/389/manual-test/results/summary.md`
- スクリーンショット: `.issue/389/manual-test/screenshots/`
- シード記録: `.issue/389/manual-test/seed-data.md`, `seed.sql`
- サーバー情報: `.issue/389/manual-test/server-info.md`
