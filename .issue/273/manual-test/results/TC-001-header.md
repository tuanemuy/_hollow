# TC-001 ヘッダーの pill ボタン

結果: PASS

## 対象
全画面共通ヘッダー右上の「新規作成」（primary）と「アップロード」（plain）。

## 操作ログ

| 手順 | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | /login でログイン | ノート一覧へ遷移 | / に遷移 | PASS |
| 2 | ヘッダーを screenshot | 両ボタン表示 | 新規作成（緑背景・白文字）/ アップロード（surface背景）表示 | PASS |
| 3 | 新規作成の class/属性取得 | data-primary 属性あり + pillBtnPrimary | data-primary="" あり, data-[primary]:bg-accent 系あり | PASS |
| 4 | アップロードの class取得 | plain（bg-surface） | bg-surface, data-primary なし | PASS |

## class 検証（期待 vs 実際）

- 新規作成（primary）:
  - 期待: `data-[primary]:bg-accent` 系を含み、要素に `data-primary` 属性
  - 実際: `data-[primary]:bg-accent data-[primary]:text-white ...` を含み `data-primary=""` あり → 一致
- 両ボタン共通:
  - 期待: `active:scale-[0.985]` + `motion-reduce:active:scale-100`
  - 実際: 両方含む → 一致
- `PILL_BTN` 等の未解決定数名: 残存なし
- enabled: 両ボタンともリンク（A要素）で押下可能

## スクリーンショット
- screenshots/header.png
