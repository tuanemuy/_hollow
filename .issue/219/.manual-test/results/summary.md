# テスト実行サマリー — Issue #219

**実行日時**: 2026-05-28
**テストソース**: `.issue/219/testing.md`
**サーバー**: http://localhost:3000 (`pnpm dev`)

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-001 | `_serverFn` が display 切替で発火しない | 正常系 | PASS |
| TC-002 | 切替即時性（体感遅延の消失） | 正常系 | PASS |
| TC-003 | ローディングのチラつき/空白の消失 | 正常系 | PASS |
| TC-004 | URL `?display=` の反映とリロード維持 | 正常系 | PASS |
| TC-005 | SavedView 復元との整合性 | 正常系 | PASS |
| TC-edge-1 | 無効な viewId で redirect ループ無し | 異常系 | PASS |
| TC-edge-2 | `/?display=tile` 直アクセスでタイル表示 | 異常系 | PASS |

**合計**: 7 件（PASS: 7 / FAIL: 0）

## 完了条件の達成根拠

- **条件 1（同じデータならクライアント即時反映）**: `window.fetch` フック観測で display 切替時に `renderHome` server fn が **0 件発火**。TC-001/TC-002 で確認。
- **条件 2（ローディング表示のチラつきが消える）**: `MutationObserver` で `aria-busy` / `data-pending` / spinner 追加を全期間監視 → display 切替に伴う変化 **0 件**。TC-003 で確認。
- **条件 3（URL 反映でリロード／共有可能）**: 切替直後に URL の `?display=...` が反映、リロード後も維持、`history.length` が 3 連続切替で増えない（`replace: true` 機能確認）。TC-004 で確認。

## DEV モード固有の補足

`/_serverFn/.../__root.tsx/loadAppContext`（root layout の context fetch）は切替時に毎回発火するが、`Route.staleTime: import.meta.env.DEV ? 0 : Infinity` の DEV 設定によるもので本 Issue スコープ外（本番では発火しない）。

## 起票が必要そうな失敗

なし。
