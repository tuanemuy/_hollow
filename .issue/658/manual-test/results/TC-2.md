# TC-2 トリガーの a11y 属性と title（AC-3）

結果: **PASS**（2026-06-13, セッション verify-tc-001b, http://localhost:3001）

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | トリガー要素の属性を eval で確認 | `aria-haspopup="listbox"` / `aria-label="タグで絞り込み"` / `title="タグで絞り込み"` | outerHTML に `aria-haspopup="listbox" aria-expanded="false" type="button" aria-label="タグで絞り込み" title="タグで絞り込み"` をすべて確認 | PASS |
| 2 | 44px タッチターゲット確保 | TOUCH_TARGET 系クラス or 擬似要素 | class に `max-sm:min-h-[44px]`（`TOUCH_TARGET` 定数, `app/components/common/styles.ts:25`）。実測: デスクトップ高さ 28px（h-7 通り）、viewport 375x812 で `getBoundingClientRect().height === 44` | PASS |

## 備考

- 前回 FAIL は接続先ポート誤り（3000 = 別プロジェクト）による環境問題であり、実装の不具合ではなかった。今回は 3001 で実施し問題なし。
