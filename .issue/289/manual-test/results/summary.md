# Issue #289 マニュアルテスト サマリー

対象: DirectoryActionsMenu の WAI-ARIA Menu パターン roving tabindex キーボードナビ検証
実行日: 2026-05-29 / セッション: agent-browser verify (http://localhost:3000)

## 結果一覧
| TC番号 | 名前 | 種別 | 結果 | 失敗ステップ |
|--------|------|------|------|--------------|
| TC-001 | 上下矢印移動 | キーボードナビ + roving tabindex | PASS | - |
| TC-002 | ラップ | キーボードナビ（境界） | PASS | - |
| TC-003 | Home/End | キーボードナビ | PASS | - |
| TC-004 | roving tabindex / Tab でクローズ | フォーカス管理 | PASS | - |
| TC-005 | Enter 実行 & Escape 復帰 | アクション実行 + フォーカス復帰 | PASS | - |
| TC-006 | マウス+キーボード混在（エッジ） | 堅牢性 | PASS | - |

## 合計
- PASS: 6
- FAIL: 0

## 主要な確認事項
- メニューを開くと先頭「子ディレクトリを作成」へ自動フォーカス。
- roving tabindex はフォーカス中の menuitem のみ tabIndex=0、他は -1 を全ステップで維持。
- ArrowUp/ArrowDown はラップ（末尾↔先頭）対応。Home/End で先頭/末尾へジャンプ。
- Tab はメニューを閉じ（role=menu 消失、trigger aria-expanded=false）、フォーカスはメニュー外の通常タブ順へ抜ける（トラップなし）。
- Enter（リネーム）でメニューが閉じインライン rename 入力欄が出現・フォーカス。
- Escape はメニューを閉じ、フォーカスを ︙ トリガーボタンへ復帰。
- hover とキーボード混在でクラッシュせず、メニューも閉じず、ナビが継続。

## 備考
TC-005 初回試行で stale ref クリックにより about:blank 遷移→セッション切れ（テスト手順起因、実装不具合ではない）。再ログイン後 fresh ref で再検証し PASS。
