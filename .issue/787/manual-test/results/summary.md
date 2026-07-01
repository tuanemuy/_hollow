# テスト実行サマリー — Issue #787

**実行日時**: 2026-06-30
**テストソース**: .issue/787/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-1 | モバイルモックの縮小 (AC-1/6) | 正常系 | PASS | - |
| TC-2 | 実装とモックの一致 390px (AC-3/6) | 正常系 | PASS | - |
| TC-3 | タッチ床 44px 維持 (AC-4) | 正常系 | PASS | - |
| TC-4 | a11y / レール挙動 (AC-5) | 正常系 | PASS | - |
| TC-5a | デスクトップ非回帰 800px | 既存機能 | PASS | - |
| TC-5b | 公開ノート 390px 縮小（任意） | 正常系 | PASS | - |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 主要計測値

- モバイル 390px（実装・非公開ノート）: gap **4px** / margin-top **12px** / margin-bottom **16px** / icon-only グリフ svg **18px** / icon-only ピル box **44x44px**（ラベル付き 104x44）。`role="toolbar"`・全6ピルに aria-label・レール `overflow-x: auto` を確認。
- デスクトップ 800px（非回帰）: gap **8px** / margin-top **16px** / margin-bottom **24px** / svg **20px** / ピル **40x40px**。据え置き確認。
- 公開ノート 390px: gap 4px / mt 12px / mb 16px / svg 18px / 44x44 で同様に縮小。

## 留意点

- `agent-browser open --viewport` が初回ナビゲーションに反映されず innerWidth=1280 のままになる事象を確認。`set viewport <w> <h>` で明示設定し `matchMedia('(max-width: 639px)')` が true になることを確認してから計測した。実装の問題ではなくツール挙動。
- svg 一覧に 16px が1つ含まれるが、これはラベル付き「公開状態」ピル内の小型ステータスアイコンで、本Issue対象の icon-only グリフではない（対象グリフは全て 18px）。
