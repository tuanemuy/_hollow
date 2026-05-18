# TC-2: 取り込みジョブ一覧の表示

**結果:** PASS

## 確認内容

`/admin/jobs` の「取り込みジョブ」セクションを観察:

| # | jobId | status | kind | owner | updatedAt | errorCode |
|---|---|---|---|---|---|---|
| 1 | 01938f03…0301 | 失敗 | markdown | 01938f00…00c1 (admin) | 2026/05/18 20:00 | INGESTION_TEMP_STORAGE_ERROR |
| 2 | 01938f03…0302 | 失敗 | html | 01938f00…00a1 (member) | 2026/05/18 19:30 | INGESTION_PARSE_ERROR |
| 3 | 01938f03…0303 | 失敗 | markdown | 01938f00…00c1 (admin) | 2026/05/18 18:00 | INGESTION_TEMP_STORAGE_ERROR |
| 4 | 01938f03…0304 | 待機中 | markdown | 01938f00…00a1 (member) | 2026/05/18 16:30 | — |

## 期待値との対応

- [x] 全ユーザー横断表示: admin (00c1) と member (00a1) のジョブが混在
- [x] failed が先頭にピン留め: failed 3 件が pending 1 件より先頭にある
- [x] 行に jobId / ownerId / status / kind / updatedAt / errorCode の列が見える
- [x] 件数は 4 件で 50 件の limit 内に収まる

## スクリーンショット

- `screenshots/tc-2/step-01-ingestion-list.png`
