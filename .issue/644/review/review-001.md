# Review 001 — Issue #644 (PR #725)

対象: `spec/design/pages/` モック 33 ファイルの `.sidebar-user` 磨き込み（avatar 文字 + `.user-meta` CSS）。機械的な一律 sweep + 1 件の設計判断（flex-column）。

## 観点と結果

| # | 観点 | 結果 |
|---|------|------|
| 1 | 変更の局所性 | PASS — 全変更が `spec/design/pages/` 配下。各ファイル `+2/-2`（avatar 1 行 + `.user-meta` 1 行）。アプリ実装コードへの影響なし |
| 2 | 一律性 | PASS — 33 ファイルの新 `.user-meta` ルールが md5 完全一致。avatar はすべて `YI` |
| 3 | スコープ外の保全 | PASS — `P21` の `avatar-large="YK"`、`P45` の `user-avatar="YK"` は未変更（別文脈・別人物） |
| 4 | flex-column の影響範囲 | PASS — 各ファイルで `.user-meta` のセレクタ定義・使用箇所はともに 1 件のみ。縦積み化の影響は `.sidebar-user` 行に限定 |
| 5 | トークン妥当性 | PASS — `--space-2`（8px）は `tokens.css` に定義済み。モック内でも解決（live computed `padding-right = 8px`） |
| 6 | 症状の解消（実機検証） | PASS — P10-home / P21-settings-profile / mobile/P10-home で `stacked: true` / `emailClearOfCaret: true`。Issue の 2 点（イニシャル不一致・メール右端詰まり）が解消 |
| 7 | 退行 | PASS — 追加は CSS 3 プロパティと avatar テキストのみ。氏名・メール・hover・行レイアウトに退行なし |

## ブロッカー

なし。

## ステータス

**APPROVED**（1 ラウンドでクリーン）。低リスクなモック表示修正で、Issue 文面の示唆より踏み込んだ根本原因修正（inline span → flex-column で ellipsis 復元）を実機検証済み。Ready for review に切替可能。
