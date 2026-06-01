# ブラウザ検証レポート — Issue #382

**実行日**: 2026-06-01
**テストソース**: .issue/382/testing.md
**サーバー**: http://localhost:3003（`pnpm dev --port 3003`）
**ブラウザ**: agent-browser 0.27.0
**ログイン**: admin@example.com（Better Auth credential、ログイン成功）

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | ホームツールバーのアイコンのみ化（新規作成 / アップロード） | PASS |
| TC-002 | ノート詳細アクション行のアイコンのみ化（編集 / 複製） | PASS |

**合計 2 件 / 確認項目 11 件すべて PASS（FAIL 0）**

## 確認できたこと

- ホーム `/` ツールバー: 「新規作成」(Plus)・「アップロード」(Upload) がアイコンのみ表示。accessible name は aria-label で担保、可視テキストなし。新規作成は title 付き。
- ノート詳細 `/notes/{id}`: 「編集」(Pencil・プライマリ配色維持)・「複製」(Copy) がアイコンのみ表示。aria-label / title 付き、可視テキストなし。
- 中・低優先度ボタン（公開設定 / 移動 / URLコピー / エクスポート / 履歴 / 削除）はテキスト併記のまま。削除は赤系配色維持。

## 起票した Issue
なし（全 PASS）

## スクリーンショット
- TC-001: `screenshots/tc-001/step-01.png`
- TC-002: `screenshots/tc-002/step-01.png`
