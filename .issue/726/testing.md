# Issue #726 動作確認

対象は `spec/design/pages/` 配下の静的 HTML モックファイル。
ビルドやサーバー起動は不要で、ファイルをブラウザで直接開いて目視確認する。

## 確認環境

静的 HTML をブラウザで開くだけ（例: `open spec/design/pages/P21-settings-profile.html`）。

## 実行手順

1. `spec/design/pages/P21-settings-profile.html`（desktop）をブラウザで開く。
2. サイドバー最下部 `.sidebar-user` の氏名が「山田 一郎」/ メールが `yumenaut@gmail.com` であることを確認。
3. プロフィール編集フォームを確認:
   - アバター（`.avatar-large`）のイニシャルが **YI** であること。
   - 表示名（`#display-name`）の初期値が **山田 一郎** であること。
   - 「ユーザー名（URL）」セクションの現在の表示が **@ichiro_y** であること。
4. サイドバーとフォームが同一人物（山田 一郎）として一致していることを確認。
5. `spec/design/pages/mobile/P21-settings-profile.html`（mobile）でも 2〜4 を同様に確認。
6. `spec/design/pages/P24-settings-account-delete.html`（desktop）と mobile 版を開き、
   「ユーザー名を入力してください」欄の placeholder が **@ichiro_y** であることを確認（サイドバー山田 一郎と一致）。

## 期待結果

desktop / mobile の両方で、サイドバーとプロフィール編集フォームのアイデンティティが
「山田 一郎」で一致している。「柏木 結衣 / @yui_k / YK」の表記が残っていない。
