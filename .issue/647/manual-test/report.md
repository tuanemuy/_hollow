# ブラウザ検証レポート — Issue #647

**実行日:** 2026-06-14
**テストソース:** `.issue/647/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**認証:** seed 済み dev-admin（cookie `__Host-session` を CDP 注入）

## 検証方法

セクション失敗は自然な操作では起こせないため、`app/components/admin/Metrics/index.tsx` の `MetricsSection`（`/admin/metrics` の `SectionErrorBoundary section="利用状況"` 配下 async セクション）へ一時的に `throw` を注入して再現し、検証後に revert した（最終差分なし）。

## 結果サマリー

| TC | 対応AC | 内容 | 結果 |
|----|--------|------|------|
| TC-1 | AC-6 | セクションのみフォールバック表示・ページシェル生存 | PASS |
| TC-2 | AC-1, AC-3 | 報告 server fn への POST 200 | PASS |
| TC-3 | AC-5 | リトライ後の再失敗→UI無事・dedup | PASS |
| ログ確認 | AC-2, AC-3, AC-5 | サーバー構造化ログの中身 | PASS |

**合計:** 4 件すべて PASS。

## 詳細

### TC-1（AC-6）: フォールバック表示・シェル生存 — PASS
`role="alert"` 内に「利用状況を読み込めませんでした。」＋「再読み込み」ボタン。h1「利用状況」・banner・navigation・contentinfo はすべて生存し、全画面エラーにならず当該セクションのみ置換。

### TC-2（AC-1, AC-3）: 報告 POST — PASS
`network requests --filter "_serverFn"` で `POST /_serverFn/<base64>` 200 を1件確認。base64 デコードで `{"file":"/app/components/common/sectionFailureReport.ts...","export":"reportSectionFailure_createServerFn_handler"}`。client→server の配線が実環境で round-trip することを確認。

### TC-3（AC-5）: リトライ後 — PASS
「再読み込み」押下で `renderMetricsPage` が再フェッチ→ throw 残存により再失敗→フォールバック同一構成で再表示。UI は壊れない。2回目の報告 POST はブラウザ網羅ログに出ず＝同一 section+resetKey の **dedup が効いている**（設計どおり。下記ログで count セマンティクスを裏取り）。

### サーバーログ確認（AC-2, AC-3, AC-5）— PASS
サーバーターミナルに以下が1回出力:

```
Section render failed {
  event: 'section_failure',
  section: '利用状況',
  scope: 'page',
  path: '/admin/metrics',
  count: 1
}
```

- meta タグが `event`（`kind` ではない）で構造化されている（AC-3 / ADR-005）。
- ペイロードは `event/section/scope/path/count` のみで、`message`/`stack`/`error` を含まない（AC-2）。
- リトライ（同一 resetKey）では再送されず1回に丸められた。count は「捕捉累積回数」で実送信回数ではないという設計と整合（AC-5）。

## 備考
- 自動テスト（unit 3846 件）が AC-1/AC-2/AC-5/AC-6 をペイロードキー assert・count 増分・dedup・UI 耐性で担保済み。本ブラウザ検証は「実環境での client→server round-trip とサーバー構造化ログの実出力」というユニットでは確認できない E2E 配線を裏取りした。
- serverFn の URL は base64 隠蔽のため、`--filter "_serverFn"` で拾ってデコードする運用が確実。
- 失敗 0 件のため起票なし。
