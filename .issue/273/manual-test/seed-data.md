# シードデータ — Issue #273

**作成日:** 2026-05-29

Issue #298 / #283 の manual-test seed（`.issue/283/manual-test/seed-283.sql`、`INSERT OR IGNORE` で冪等）を再利用。ローカル D1 に投入済み。

## 投入コマンド

```bash
pnpm db:apply:local
pnpm db:execute:local .issue/283/manual-test/seed-283.sql
```

## テストアカウント

| 項目 | 値 |
|---|---|
| email | `test-298@example.com` |
| password | `TestPass298!` |
| role | member |

## 検証対象データ

ローカル D1 には累積シードにより users 15 / notes 11 / tags 8 / directories 17 が存在。pill ボタンの全 variant を確認できる画面:

- **Header**: 新規作成（primary） / アップロード（plain）
- **ノート詳細 `NoteActions`**: 編集（primary） / 公開設定・移動・複製・履歴（plain） / 削除（danger=pillBtnDanger）
- **タグ管理 `TagActions`**: リネーム・統合（plain） / 削除（danger） / 保存（primary, 編集モード）
- **ゴミ箱 `TrashRowActions`**: 復元（plain） / 完全削除（danger）

## サーバー

- `pnpm dev`（Vite, 既定 localhost:3000。使用中なら空きポートを使用）
