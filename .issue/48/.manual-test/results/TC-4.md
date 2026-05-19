# TC-4: search 結果でタイル表示でバッジが出る

**実行日:** 2026-05-20
**URL:** `http://localhost:3000/?q=uniquekw&display=tile`
**ユーザー:** `mt48-eve@example.com`
**結果:** **PASS**

## 期待結果

タイル表示でも各ノートに visibility chip（公開 / 限定公開 / 非公開）が表示される。

## 実測

- タイル表示のカード数: 12
- 各カードのリンクテキスト末尾に visibility chip テキストが含まれていることを snapshot で確認
- 抜粋（カードごとの末尾の StaticText）:
  - N12 → `非公開`
  - N11 → `公開`
  - N10 → `非公開`
  - N9 → `限定公開`
  - N8 → `公開`
  - N7 → `非公開`
  - N6 → `限定公開`
  - N5 → `公開`
  - (N4–N1 は表示領域下のため snapshot 8000 char 制限で切れたが、12 件分の chip が DOM 内に存在することは `Array.from(...).filter(/^(公開|非公開|限定公開)$/...)` の件数で確認済み)

## スクリーンショット

- `screenshots/tc-4/step-01-tile.png`

## 確認ポイント結果

| 項目 | 結果 |
|---|---|
| タイル表示で chip 表示 | OK |
| chip テキスト（公開 / 限定公開 / 非公開）一致 | OK |
