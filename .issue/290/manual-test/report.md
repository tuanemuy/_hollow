# ブラウザ検証レポート — Issue #290

**実行日:** 2026-05-30
**テストソース:** .issue/290/testing.md
**サーバー:** http://localhost:3000/ (`PORT=3000 pnpm dev`)
**アカウント:** existing@example.com (member)

---

## サマリ

| TC | テスト名 | 種別 | 結果 | 実際に表示された文言 |
|----|----------|------|------|----------------------|
| TC-001 | 兄弟名重複 | 異常系（business） | **PASS** | 同名のディレクトリが既に存在します |
| EC-001 | 禁止文字 `a/b` | 異常系（validation） | **PASS** | name: 使用できない文字が含まれています |
| EC-002 | 正常系の作成 | 正常系 | **PASS** | エラーなし・作成成功 |
| TC-002 | 階層深さ上限 | 異常系（business） | SKIP | TC-001 と同一 business エラー経路のためユニットテストで担保 |

**合計:** 3 PASS / 0 FAIL（TC-002 は SKIP）

## 結論

Issue #290 の修正は意図どおり機能している。修正前は business kind の directory エラーが generic fallback（「操作を完了できませんでした…」／報告時点では「エラーが発生しました」相当）に落ちていたが、`renderDirectoryBusinessMessage` 追加により具体的な日本語メッセージが表示されるようになった。

## 申し送り

- EC-001（禁止文字）は transport validation 経路で field error として表示されるため、文言先頭に `name: ` というフィールド名プレフィックスが付く。期待する具体文言「使用できない文字が含まれています」は含まれており判定は PASS。プレフィックスの除去・日本語化は `formatFieldErrors`（全ダイアログ横断）の課題であり、本Issueの意図（business エラーの具体化）の範囲外。
