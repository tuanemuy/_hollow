# TC-1: /upload から「取り込みキュー」見出しが消えていること

**結果**: PASS
**実行時間**: 約30秒
**セッション**: verify-217-tc-1

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` を開き existing@example.com / Password123! でログイン | ホームへリダイレクト | `/?page=1&limit=20` に遷移 | PASS |
| 2 | `/upload` を開く | アップロード画面が表示 | 画面表示成功（URL=`/upload`） | PASS |
| 3 | snapshot のテキストツリーを確認 | `heading "取り込みキュー"` が無いこと | `heading "アップロード" [level=1]` のみ。h2 相当の「取り込みキュー」見出しはツリー中に存在しない | PASS |
| 4 | `document.querySelectorAll('h2')` を評価 | 空配列 | `[]`（h2 要素なし） | PASS |
| 5 | `body.innerText.includes('取り込みキュー')` を評価 | `false` | `false` | PASS |

## 観察

- UploadForm（ドロップゾーン）の直下にキュー一覧（sample.md, sample2.md, …）がそのまま並んでおり、間に見出しテキストが入っていない。
- ページの h1 は「アップロード」のみで、その下の説明文・フォーム・キューが見出しなしで自然に繋がる。

## スクリーンショット
- Step 1: `screenshots/tc-1/step-1.png`
