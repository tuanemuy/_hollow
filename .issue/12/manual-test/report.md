# manual-test レポート — Issue #12

**実行日時**: 2026-05-20
**テストソース**: `.issue/12/testing.md`
**サーバ**: http://localhost:3001 （ポート 3000 は別ワークツリーが使用中だったため）

## サマリー

| TC | テスト名 | 結果 | 備考 |
|----|---------|------|------|
| TC-1 | BulkExportDialog → 詳細遷移 | PASS | `/exports/{jobId}` への遷移確認 |
| TC-2 | ポーリングで状態遷移 | SKIP | Cloudflare Workers + Queues が必要で `pnpm dev` 単独不可 |
| TC-3 | ダウンロードボタン表示 (completed) | PASS | ボタン存在のみ確認、押下は R2 ローカル動作不可で省略 |
| TC-4 | キャンセル (processing) | PASS | 状態 `processing → cancelled` 遷移、DB も更新 |
| TC-5 | 一覧 → 詳細リンク | PASS | 各行のリンクで遷移 |
| TC-6 | 詳細 → 一覧戻り | PASS | `<Link to="/exports">` で戻る |
| TC-7 | 他人ジョブ直叩き (情報リーク防止 + 中立メッセージ) | PASS | ADR-004 達成。h1「ジョブが見つかりません」+ 中立本文表示、生メッセージ非露出 |
| TC-8 | 存在しない jobId 直叩き | PASS | TC-7 と完全に同一表示でオラクル攻撃耐性 |
| TC-9 | failed 状態の表示 | PASS | errorReason + failedNoteIds の表示確認 |
| TC-10 | expired ジョブのダウンロード抑止 | PASS | ボタン非表示 + 期限切れメッセージ表示 |
| TC-11 | バックグラウンドタブで poll 抑制 | SKIP | TC-2 と同じ理由で実機確認不可（コードで担保: ADR-002） |

**合計**: 9 PASS / 2 SKIP / 0 FAIL

## 重要な発見と修正

### Issue: `errorComponent` の `extractSerializedError` で `kind === "unknown"` に倒れる

初回検証で「エラーが発生しました」が表示され、ADR-004 が定義した「ジョブが見つかりません」/「アクセス権限がありません」の中立メッセージが出ない問題を発見。

**根本原因**: `renderServerComponent(<Page>)` 経由でスローされるエラーは server fn の `errorResponseMiddleware` を**経由しない**（React Server Component のレンダリングは server fn handler の return 後に行われるため、middleware の try/catch スコープの外側）。結果として client 側に届くのは `AppServerError` ラップも `serialized` プロパティも持たない素の `NotFoundError` / `BusinessRuleError` で、`extractSerializedError` の `instanceof` / `hasSerializedRemnant` 両判定が成立せず `kind: "unknown"` に倒れる。

**修正**: `app/components/export/ExportJobDetail/Page.tsx`（RSC）の中で `getExportJob` 呼び出しを `try/catch` でラップし、`isNotFoundError` / `isBusinessRuleError + ExportErrorCode.Unauthorized` を直接判定して中立メッセージ JSX を返す。エラーが投げられる位置（server component 内）で処理することで `instanceof` チェックが正しく機能。

ADR-004 を最新の方針に更新済み。

## スキップ項目の補完

TC-2 / TC-11 は実機確認不可だが、実装パターンは以下で担保:
- **TC-2 (poll で状態自動更新)**: `app/components/export/ExportJobDetail/index.tsx` の `useEffect` で `setTimeout` 自己呼出し再帰（ADR-002）。`job.status` が active のときだけ schedule、ターミナル状態到達で停止
- **TC-11 (バックグラウンドタブで抑制)**: 同 `useEffect` 内で `document.visibilityState !== "hidden"` のときだけ `router.invalidate()` を呼び、hidden のときはスキップ。`useRef<boolean>` で in-flight ガード

`pnpm start`（wrangler dev で Queues + R2 をローカルエミュレート）での確認は本 Issue のスコープ外として PR の Test plan に記載。

## 成果物

- 結果ファイル: `.issue/12/manual-test/results/TC-{1,3,4,5,6,7,8,9,10}.md`
- スクリーンショット: `.issue/12/manual-test/screenshots/tc-{1,3,4,5,6,7,8,9,10}/`
  - TC-7 / TC-8 は `final2.png`（最終修正後）
- シードデータ: `.issue/12/manual-test/seed.sql` + `.issue/12/manual-test/seed-data.md`

## 起票したIssue
なし（FAIL がないため）
