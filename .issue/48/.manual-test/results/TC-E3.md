# TC-E3: cursor pagination 順序の安定

**実行日:** 2026-05-20
**URL:** `http://localhost:3000/?q=uniquekw&limit=5`（2 回ロード）
**結果:** **PASS**

## 期待結果

- 1 ページ目の並び順がリロード前後で完全一致
- `findByIds` を経由しても search の順序（score 降順）が崩れない

## 実測

### 1 回目ロード（page=1, limit=5）

| # | href | title |
|---|---|---|
| 1 | `/notes/019e4148-21df-71fc-9636-b95f5a679a3c` | [private] uniquekw note 12 (2026-02-20) |
| 2 | `/notes/019e4148-21df-71fc-9636-b49488dca5f5` | [public] uniquekw note 11 (2026-03-15) |
| 3 | `/notes/019e4148-21df-71fc-9636-b2a59d1efb70` | [private] uniquekw note 10 (2026-04-10) |
| 4 | `/notes/019e4148-21df-71fc-9636-ac49273f55aa` | [unlisted] uniquekw note 9 (2026-04-20) |
| 5 | `/notes/019e4148-21df-71fc-9636-aa26145d109a` | [public] uniquekw note 8 (2026-04-28) |

### 2 回目ロード（同 URL）

href 順序:
```
/notes/019e4148-21df-71fc-9636-b95f5a679a3c
/notes/019e4148-21df-71fc-9636-b49488dca5f5
/notes/019e4148-21df-71fc-9636-b2a59d1efb70
/notes/019e4148-21df-71fc-9636-ac49273f55aa
/notes/019e4148-21df-71fc-9636-aa26145d109a
```

→ **完全一致**（順序の入れ替わりなし）。

注: 投入時の本文中 `uniquekw` 繰り返し回数は N1=1 〜 N12=12 で、BM25 score は N12 が最高となる設計。
実際に表示された順序も N12 → N11 → N10 → N9 → N8 と score 降順で安定しており、
`findByIds` を経由しても順序が保持されていることを確認。

## スクリーンショット

- `screenshots/tc-e3/step-01-first-load.png`
- `screenshots/tc-e3/step-02-second-load.png`

## 確認ポイント結果

| 項目 | 結果 |
|---|---|
| リロード前後で並び順一致 | OK |
| score 降順で並ぶ | OK |
