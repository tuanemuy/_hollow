# ブラウザ検証レポート — Issue #749

**実行日時**: 2026-06-18
**テストソース**: `.issue/749/testing.md`
**対象**: P10 ノート一覧（`/`）モバイル/デスクトップ寸法

## 結論

全 3 テストケース PASS。今回スコープの3変更（チップ32px・チェック24px・44px床除去）が mock どおり反映され、デスクトップ寸法（28px / 20px）も回帰なく維持されていることをブラウザ実測で確認した。起票すべき失敗なし。

## 環境

- サーバー: `pnpm dev`（workerd）http://localhost:3000
- 認証: `pnpm seed:dev-admin`（cookie `__Host-session=dev-admin-session-token` を CDP 注入）
- データ: 既存ローカル D1（dev-admin: directories 7 / notes 37 / tags 12）
- ブラウザ: agent-browser 0.27.3、viewport 375×812（mobile）/ 1280×900（desktop）

## 結果

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | フィルターチップ高さ（mobile 32 / desktop 28・床なし） | PASS |
| TC-002 | チェックボックス寸法（mobile 24 / desktop 20・床なし） | PASS |
| TC-003 | 横スクロール・折り返し抑止・選択トグル維持 | PASS |

## 計測値

| 対象 | 375px | 1280px |
|---|---|---|
| filter-chip-ghost 高さ | 32px | 28px |
| note-check 幅×高さ | 24×24px | 20×20px |

## 起票した Issue

なし（全 PASS）。
