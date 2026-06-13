# ブラウザ検証レポート — Issue #697: FrontMatterモード廃止＋メタデータ下部常設

**実行日時**: 2026-06-13 23:40
**ブランチ**: issue/697/frontmatter-bottom-permanent
**サーバー**: http://localhost:3001
**テストソース**: .issue/697/testing.md

## 結果概要

全 7 テストケース **PASS**（FAIL: 0）。Issue の受け入れ条件をブラウザ上で満たすことを確認。

| AC | 確認内容 | 結果 |
|----|---------|------|
| AC-1 | 編集モードタブに FrontMatter が表示されない（編集=[ビジュアル,WYSIWYG,HTML] / 新規=[WYSIWYG,HTML]） | PASS |
| AC-2 | 本文モード(inline/wysiwyg/html)に関わらず下部でメタデータの追加・編集・削除ができる | PASS |
| AC-3 | 下部領域内で構造編集 ⇔ 生編集(JSON)を切り替えられる | PASS |
| AC-4 | バリデーションと保存時シリアライズが従来どおり維持される | PASS |
| AC-5 | 未保存でモード切替しても FrontMatter 編集内容が失われない | PASS |

## エッジケース・既存機能影響

- **TC-EDGE-1（異常系）**: 生編集JSONが不正だと「JSON が解析できません」エラー＋保存ボタン無効化。正しいJSONに直すと再有効化。本文モードに関わらず常時このゲートが効く（計画どおりの意図的挙動）。PASS。
- **TC-EDGE-2（#696影響）**: WYSIWYG 非対応タグ（section/table）を含むノートで「WYSIWYG」タブに切り替えると装飾消失の警告ダイアログが従来どおり表示。FrontMatter 常設化が #696 のゲートを壊していないことを確認。PASS。

## 起票したIssue

なし（全 PASS）。

## 成果物

- レポート: .issue/697/manual-test/report.md（本ファイル）
- サマリー: .issue/697/manual-test/results/summary.md
- 各テスト結果: .issue/697/manual-test/results/TC-*.md
- シードデータ: .issue/697/manual-test/seed-data.md
- サーバー情報: .issue/697/manual-test/server-info.md

## 検証上の注記

- 認証はセッション cookie 注入で実施（dev-admin）。
- `window.confirm`（未保存変更確認）と一部タブクリックは agent-browser の制約上 eval 経由で発火させた。実ブラウザでは通常操作で動作する想定。判定結果には影響なし。
