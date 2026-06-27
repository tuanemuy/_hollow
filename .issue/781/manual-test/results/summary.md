# テスト実行サマリー — Issue #781

**実行日時**: 2026-06-27 04:23
**テストソース**: .issue/781/testing.md
**サーバー**: http://localhost:5176/（`pnpm dev --port 5176` / ローカル D1）
**ツール**: agent-browser 0.28.0
**認証**: dev-admin（cookie `__Host-session`=`dev-admin-session-token` を CDP 注入）

| TC | テスト名 | 種別 | AC | 結果 | 失敗ステップ |
|----|---------|------|------|------|-------------|
| TC-001 | 連続矢印キーでフォーカス保持 | 正常系 | AC-1 | PASS | - |
| TC-002 | 単発選択後のフォーカス復元 | 正常系 | AC-2 | PASS | - |
| TC-003 | ホーム表示モード segmented の後方互換 | 正常系 | AC-3 | PASS | - |
| TC-EDGE-1 | 非操作時に焦点を奪わない | 異常系 | AC-4 | PASS | - |

**合計**: 4 件（PASS: 4 / FAIL: 0 / INCONCLUSIVE: 0）

## TC-001 の核心事実（連続矢印操作の成立）

| ステップ | activeElement (role / text / aria-checked) | location.search |
|---|---|---|
| 初期（選択中 radio に focus） | radio / 名前 / true | "" |
| ArrowRight #1 | radio / ノート数 / true | `?sort=noteCount` |
| ArrowRight #2（再フォーカスなし） | radio / 作成日時 / true | `?sort=createdAt` |
| ArrowLeft（逆方向） | radio / ノート数 / true | `?sort=noteCount` |

2回目の ArrowRight が無視されず sort が2段目（`createdAt`）まで進行。各押下後、フォーカスは選択中 radio（`aria-checked=true`）に保持・復元され、`<body>` への脱落なし。

## 偽陽性リスクについて

Issue #781 / `.issue/776/manual-test/report.md` は「連続矢印のフォーカス挙動は agent-browser でタイミング再現できず偽陽性リスクあり」と注記していたが、本検証では復元 effect の post-commit タイミングが正しく観測でき、INCONCLUSIVE は発生しなかった。focus 保持の確実な判定材料として `eval` で `document.activeElement` の role / aria-checked を直接読み、URL の sort 変化と併せて二重に確認した。
