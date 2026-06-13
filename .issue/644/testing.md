# Issue #644 動作確認

## 確認環境

モック HTML の静的配信のみ。アプリのビルド・DB は不要。

## 実行手順

1. リポジトリルートで以下を実行（`serve` は `npx` 経由で取得）:

   ```bash
   npx serve spec/design/pages
   ```

2. 表示された URL で以下のページを開き、サイドバー最下部の `.sidebar-user` 行を確認する:
   - `P10-home.html`（確定形）
   - `P21-settings-profile.html`（サイドバーとプロフィールフォームが同居するページ）
   - `mobile/P10-home.html`（モバイル版）

## 確認観点

| # | 観点 | 期待 |
|---|------|------|
| 1 | アバターのイニシャル | 「YI」と表示される |
| 2 | 氏名との整合 | 「山田 一郎」(Yamada Ichiro) と頭文字 YI が一致 |
| 3 | 氏名とメールの縦積み | 氏名が上段、`yumenaut@gmail.com` が下段に縦に積まれている（横一列でない） |
| 4 | メールアドレスの余白 | メール末尾と caret の間に余白があり、右端に接していない・被っていない |
| 5 | 退行がないこと | アバター・hover・行の高さ・レイアウトが崩れていない |

## 検証結果（agent-browser 自動実行）

実測（P10-home / P21-settings-profile / mobile/P10-home）で全観点 PASS:

- avatar = `YI`、name = `山田 一郎`、sub = `yumenaut@gmail.com`
- `stacked: true`（sub の top が name の top より下）
- `emailClearOfCaret: true`（sub の右端 ≤ caret の右端、被りなし）
- `.user-meta` の computed `padding-right = 8px`（`var(--space-2)`）

## 対象外（変更しない）

- `P45-admin-users.html` の `user-avatar="YK"`（別人「森崎 結」、意図的に正しい）
- `P21-settings-profile.html` の `avatar-large="YK"`（プロフィール編集フォーム、別文脈）
