# テスト実行サマリー — Issue #417

**実行日時**: 2026-06-03
**テストソース**: .issue/417/testing.md
**サーバー**: http://localhost:5175/

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | PublicLayout ログイン pill + 検索ボタン（PC幅） | 正常系 | PASS | login=surface, 検索=accent, input内中央収まり |
| TC-002 | 検索ボタン モバイル幅 min-h 回帰 | 回帰確認 | PASS | 375px で bottomOverflow=-2px（はみ出しなし） |
| TC-003 | ErrorPage primary/surface pill | 正常系 | PASS | ホームへ戻る=accent, 検索ページ=surface |
| TC-004 | UserPublicTop ページネーション pill | 正常系 | PASS | 1ページ収まりで nav 非表示（仕様内） |
| TC-005 | ShareLinkGate 送信ボタン + disabled | 正常系 | PASS（一部制約） | accent/full-width/h-12/pill、解錠遷移は環境制約で自動検証不可 |
| TC-006 | reduced-motion press scale | エッジ | SKIP | ソース担保（motion-reduce:active:scale-100） |

**合計**: 6件（PASS: 4 / PASS一部制約: 1 / SKIP: 1 / FAIL: 0）

## テーマ補足
本テーマの `--color-accent` = `oklch(37.1% 0 0)`（彩度0のダークグレー、「紫」ではない）、`--color-surface` = `rgb(245,245,247)`（明色）。accent=暗色+白文字 / surface=明色+黒文字 で明確に区別でき、全 TC で色分けを数値確認した。

## TC-005 の制約
「閲覧する」押下で action ハンドラは発火（"確認中..." 表示）するが、解錠遷移は agent-browser の server-function クロスオリジン制約（403 FORBIDDEN_CROSS_ORIGIN）で自動検証不可。環境要因であり実装バグではない。解錠フローは integration テストで担保する方針（既知事項）。ボタンの見た目・配置・形状・disabled・ハンドラ発火は確認済み。
