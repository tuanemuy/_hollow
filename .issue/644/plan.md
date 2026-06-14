# Issue #644 計画: モック sidebar-user 行のダミーデータ磨き込み

## 意図

`spec/design/pages/` のアプリページモックに複製された `.sidebar-user`（サイドバー最下部のユーザー行）の細部を整える。機能・実装には影響しないモック表示の磨き込み。

## スコープ判定

純粋にモック HTML（`spec/design/pages/`）のダミーデータ・余白調整のみ。アプリ実装コード（`app/`）・ドメイン・ユースケースには一切触れない。新規 UI 画面の追加・レイアウト変更もなし（既存の確定形に対する微修正）。

## 現状調査

- `.sidebar-user` を含むファイルは 33（desktop 19 + mobile 14）。全ファイルで `avatar="YK"` / `user-name="山田 一郎"` / `user-sub="yumenaut@gmail.com"` が完全一致。
- 33 ファイルの `.user-row` 〜 `.user-row .caret` の CSS ブロックは md5 一致（完全同一）。一律 sweep が可能。
- `class="avatar">YK<` という文字列は 33 ファイルの sidebar-user 内にのみ出現（各 1 回）。他文脈の "YK" は別クラス・別人物なので衝突しない:
  - `P45-admin-users.html` の `user-avatar="YK"` → 別人「森崎 結」(@yk_morisaki)。意図的に正しい。**対象外**
  - `P21-settings-profile.html` の `avatar-large="YK"` → プロフィール編集フォーム（表示名「柏木 結衣」）。別文脈。**対象外**

## 変更内容（2 点・一律 sweep）

1. **イニシャル不一致の解消**: 「山田 一郎」(Yamada Ichiro) に対し avatar が "YK" → 不自然。`class="avatar">YK<` → `class="avatar">YI<`（33 ファイル）。
2. **メール右端の詰まり解消**: 調査の結果、根本原因は `.user-name` / `.user-sub` が **inline span** のままで、CSS に書かれた `overflow:hidden; text-overflow:ellipsis` が無効化されていたこと（ellipsis は block / inline-block でしか効かない）。そのため氏名とメールが横一列に並び、メールが `.user-meta` ボックスをはみ出して caret・サイドバー右端に被っていた（実測: email 右端 234px が caret 左端 221px に重なる）。`.user-meta` に `display: flex; flex-direction: column;` を追加して本来意図された縦積みを復元し、子 span を blockify して ellipsis を有効化。あわせて `padding-right: var(--space-2)` で caret 手前の余白を確保。確定形 P10-home.html で検証してから全 33 ファイルへ同形展開。詳細は [adr.md](adr.md) 参照。

## 確認方法

`npx serve spec/design/pages` で P10-home.html ほかアプリページを開き、サイドバー最下部の `.sidebar-user` 行を確認:
- アバターが「YI」になっている
- 氏名「山田 一郎」と頭文字が一致している
- メール末尾と caret の間に余白があり、右端に詰まっていない

## ワークフロー規模の判断

変更は 2 プロパティの機械的な一律 sweep（モックのダミーデータ・CSS のみ）。issue-implement の重量級フェーズ（issue-planner 多重レビューループ・design-guide による新規デザイン作成・10 ラウンド PR レビュー）は規模に対し過剰なため、計画はこの軽量版で確定し、レビューは単発の集中レビューで担保する。
