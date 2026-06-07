# テスト実行サマリー — Issue #540

**実行日時**: 2026-06-07
**テストソース**: .issue/540/testing.md
**サーバー**: http://localhost:4321（`pnpm exec vite dev --config vite.config.cloudflare.ts --port 4321`）
**テストユーザー**: mt540-user（cookie `__Host-session` = `mt540-session-token` を CDP 注入）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | SHELL サイドバー 件数バッジ + 保存ビュー列挙 | 正常系 | PASS | 「すべてのノート 7」/ 保存したビュー 4件列挙 |
| TC-2 | P10 FilterBar の境界・チップ | 正常系 | PASS | 下線なし・余白区切り・先頭チップ左端揃い |
| TC-3 | P11 詳細 メタ順序 + 場所行 | 正常系 | PASS | プロパティ→バックリンク順、場所「Research / 論文メモ」、公開状態の二重化なし |
| TC-4 | P12 エディタ タイトル document 化 + topbar | 正常系 | PASS | 新規/編集とも borderless 大型タイトル + topbar 集約 |
| TC-5 | P20 保存ビュー 条件 chip 列挙 | 正常系 | PASS | タグ/ソート/ディレクトリ/公開状態/broken chip、適用 + ⋯ メニュー |
| EC-1 | 保存ビュー 0 件（dev-admin） | 異常系 | PASS | 件数バッジ実数(2)、保存ビューセクション非表示、/views 導線常設 |
| EC-2 | 壊れた条件を持つ保存ビュー | 異常系 | PASS | broken chip + バナー + 修復ボタン（TC-5 内で確認） |
| EC-3 | モバイル幅 drawer | 異常系 | PASS | 件数バッジ・保存ビュー列挙が drawer 内でも正常、管理導線維持 |

**合計**: 8 件（PASS: 8 / FAIL: 0）

## 軽微な観察（非ブロッカー・Issue 起票なし）

- TC-5 の broken ビュー「プロジェクト(壊れ)」で、削除済みタグが解決できずタグ chip に raw UUID（`01950540-...00ff`）が表示される（`tagNameById` の id フォールバック）。broken chip「壊れた条件: 1件」+ 警告バナー + 修復ボタンで既に警告されているため致命ではない。削除済みタグのラベル表示改善は別途検討余地あり（本 Issue スコープ外）。
</content>
</invoke>
