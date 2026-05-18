# TC-3: エクスポートジョブ一覧の表示

**結果:** PASS

## 確認内容

`/admin/jobs` の「エクスポートジョブ」セクションを観察:

| # | jobId | status | format · scope | progress | owner | createdAt | errorReason |
|---|---|---|---|---|---|---|---|
| 1 | 01938f03…0311 | 失敗 | markdown · single | 3/5 | 01938f00…00c1 (admin) | 2026/05/18 19:00 | failed to render note 01938f04-...0001 |
| 2 | 01938f03…0312 | 失敗 | html · multiple | 1/2 | 01938f00…00a1 (member) | 2026/05/18 18:30 | partial render failure |
| 3 | 01938f03…0313 | 待機中 | markdown · single | — | 01938f00…00a1 (member) | 2026/05/18 17:00 | — |
| 4 | 01938f03…0314 | 完了 | pdf · single | 1/1 | 01938f00…00c1 (admin) | 2026/05/18 15:00 | — |

## 期待値との対応

- [x] 全ユーザー横断表示: admin と member のジョブが混在
- [x] failed が先頭にピン留め
- [x] format / scope が表示される（"markdown · single" 等の組み合わせ表現）
- [x] progress（processed/total）と作成日が読み取れる

## スクリーンショット

- `screenshots/tc-3/step-01-export-list.png`
