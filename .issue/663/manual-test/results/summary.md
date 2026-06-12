# テスト実行サマリー

**実行日時**: 2026-06-13
**テストソース**: .issue/663/testing.md
**サーバー**: http://localhost:8787（`pnpm build:local && pnpm start`）/ TC-3 のみ http://localhost:3000（`pnpm dev`）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-1 | ジョブ型一括エクスポートが pnpm start で完走（AC-1） | 正常系 | PASS（Round 2） | Round 1 は FAIL → build:local 導入で解消 |
| TC-2 | 単一ノートの同期エクスポートが従来どおり動く | 正常系 | PASS | - |
| TC-3 | pnpm dev の InlineRelayTrigger 退行なし（AC-4） | 正常系 | PASS | - |
| TC-4 | docs の記述が新挙動と一致（AC-5） | 正常系 | PASS | - |
| EC-1 | DEV_INLINE_RELAY を外すとゲート OFF に戻る | 異常系 | PASS | - |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 特記事項

- TC-1 Round 1 の FAIL は実装バグではなく plan 前提の誤り（`pnpm start` は redirected config 経由で production ビルドを実行するため、DCE で経路が消えていた）。`pnpm build:local`（`NODE_ENV=production vite build --mode development`）の導入で解消し、Phase 2 内で修正済み（Issue 起票なし）。詳細は `.issue/663/adr.md` 参照。
- 既存機能への影響確認: 素の `pnpm build` の DCE grep クリーン（AC-2）、`infra/templates/*.tmpl` 差分なし（AC-3）、`/dev/r2/` ダウンロード経路（#657）は TC-1/TC-2 で同時確認、通常ページ配信も全 TC で正常。
