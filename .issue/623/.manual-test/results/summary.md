# テスト実行サマリー — Issue #623

**実行日時**: 2026-06-14
**テストソース**: .issue/623/testing.md
**サーバー**: http://localhost:3000（pnpm dev / Vite）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | P34 404 CTA アイコン（AC-3） | 正常系 | PASS | home/search 両 CTA に svg を確認 |
| TC-2 | P34 403/410/500 にアイコン非波及（AC-4） | 正常系 | PASS | 3 バリアントとも「ホームへ戻る」に svg なし |
| TC-3 | P33 expired/gone の gate-foot（AC-1） | 正常系 | PASS | 補足テキスト＋中央寄せ＋1px 上ボーダー、form 消失を確認 |
| TC-4 | P33 インラインエラーアイコン（AC-2） | 正常系 | UNIT | 有効な保護付き共有リンクのシードが必要。ユニットテスト（`role="alert"` 直後の `<svg>`）で構造的にロック済みのためブラウザ検証は省略 |

**合計**: 4 件（PASS: 3 / UNIT 担保: 1 / FAIL: 0）

## 検証詳細

- **TC-1**: `/error?kind=notFound` で `eval` により `{homeHasSvg:true, searchHasSvg:true}` を確認。
- **TC-2**: `/error?kind=forbidden|gone|system` でいずれも `{homeHasSvg:false}` を確認（500 の reload アイコンは別要素のため影響なし）。
- **TC-3**: `/share/nonexistent-token-xyz` にパスワード送信 → `{hasInvalidHeading:true, hasTopCta:true, hasFootText:true, footTextAlign:"center", footBorderTop:"1px", formGone:true}` を確認。
- **TC-4**: ユニットテスト `ShareLinkGate.test.tsx`「password mismatch」で `role="alert"` 直後の `<svg>` をアサート済み。

全ブラウザ検証項目 PASS。実装バグ・デザイン差異なし。起票した Issue なし。
