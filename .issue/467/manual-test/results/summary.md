# テスト実行サマリー — Issue #467

**実行日時**: 2026-06-06
**テストソース**: .issue/467/testing.md
**サーバー**: http://localhost:5175
**検証ユーザー**: dev-admin@example.com（cookie 注入でログイン）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | UserMenu 開閉・roving・focus-visible・info非menuitem | 正常系 | PASS | menuitem=2（設定/ログアウト）、info ヘッダは非 menuitem、tabindex 0/-1、focus-visible 適用 |
| TC-002 | DirectoryActionsMenu 開閉・バグ修正・roving・Esc復帰・ツリー非干渉 | 正常系 | PASS | focus-visible(bareFocus=false)で開時グレー化バグ解消、URL 不変でツリー非遷移 |
| TC-003 | NoteActionsMenu マウス開時無ハイライト/キーボード移動ハイライト/アイコン/区切り/danger/Esc復帰 | 正常系 | PASS | マウス開時=先頭無ハイライト、↓で履歴がグレー＋リング、Esc でトリガー復帰 |
| TC-004a | FilterBar 公開状態（menu/menuitemradio）選択中着地・data-active維持・選択反映クローズ | 正常系 | PASS | initialIndex で「すべて」着地、data-[active] 維持、選択で ?visibility=public 反映＋クローズ |
| TC-004b | FilterBar 期間（dialog）role=dialog・フォーム・Esc復帰 | 正常系 | PASS | aria-haspopup=dialog、プリセット＋date 入力、Esc でトリガー復帰 |
| EDGE-1 | DirectoryActionsMenu ツリー操作非干渉 | 異常系 | PASS | メニュー開閉・矢印で URL 不変（treeitem 遷移なし） |
| EDGE-2 | 外側 mousedown クローズ | 異常系 | PASS | 外側 mousedown でメニュー閉（4→0 menuitemradio） |

**合計**: 7 件（PASS: 7 / FAIL: 0）

## 部分確認・unit test に委譲した項目

- **項目8 shiftX 水平クランプ**: デフォルト幅(1280px)では FilterBar 左寄せでパネルがオーバーフローせず transform=none（正しい no-op）を確認。agent-browser の viewport 縮小コマンドが当バージョン未対応のため、オーバーフロー時のクランプ挙動はブラウザ再現せず。算出ロジックは unit test（`computeShiftX` 純関数＋DOM スタブ）でカバー済み。
- **項目4 UserMenu ログアウト pending 中の disabled**: ブラウザで実行するとログアウトしセッションが切れるため未実行。`aria-disabled`＋focusable＋hover 非適用は unit test（UserMenu.test.tsx）でカバー済み。

## 検証手法の補足

- agent-browser の `click @ref` が React の合成 onClick に届かない既知の偽陽性（manual-test スキル記載）に該当したため、メニュートリガーの起動は `eval` 経由の `element.click()` で実施。これは起動手段の差であり、起動後の構造（role/aria/roving/tabindex）・className・遷移はすべて実 DOM で検証した。
- ハイライトの focus-visible 統一は、入力モダリティ依存の視覚判定が不安定なため、決定的に **menuitem の className 検査**（`focus-visible:bg-surface` あり / 素の `focus:bg-surface` なし）で全メニューを検証した。NoteActionsMenu はスクリーンショットでもマウス開時無ハイライト／キーボード移動ハイライトを目視確認。
