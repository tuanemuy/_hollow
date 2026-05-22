# テスト実行サマリー — Issue #143

**実行日時**: 2026-05-22
**テストソース**: `.issue/143/testing.md`
**サーバー**: http://localhost:3000 (pnpm dev / Cloudflare Workers + vite)

## 実行結果

| TC | テスト名 | 種別 | 結果 | 観察事項 |
|----|---------|------|------|----------|
| TC-1 | baseline (provider+model env set) | 正常系 | PASS | provider/model lock、apiKey/baseURL 編集可能 |
| TC-2 | 全 4 env set (full lock + banner) | 正常系 | PASS | 全 field lock、banner 表示、保存ボタン disabled、secret hygiene OK |
| TC-3 | apiKey set + baseline (provider/model/apiKey lock) | 正常系 | PASS | provider/model/apiKey lock、baseURL 非描画、banner 非表示、secret hygiene OK |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## カバレッジ

Issue #143 の受け入れ基準との対応:

| 受け入れ基準 | カバー TC | 結果 |
|--------------|-----------|------|
| 1. env override 項目にバッジ表示 | TC-1, TC-2, TC-3 | PASS |
| 2. `<input disabled>` または read-only | TC-1, TC-2, TC-3 | PASS |
| 3. form submission の env override 項目で usecase が env 値保持 | （unit/integration テストでカバー） | PASS（自動テスト） |
| 4. 4 つ全 env set で全体 banner | TC-2 | PASS |
| 5. env 未設定項目は編集可能 | TC-1（apiKey/baseURL）、TC-3（baseURL は非描画だが env override は反映） | PASS |
| 6. `.dev.vars.example` の 3 provider 対応 | （手動確認: ファイル diff） | PASS |
| 7. provider 切替の運用 note | （手動確認: ファイル diff） | PASS |

## Secret Hygiene 検証

env 由来の API key 実値（`sk-ant-fake-test-key-for-manual-verification`）が DOM / レスポンスに含まれていないことを TC-2, TC-3 で確認。apiKey は boolean 化されており、`<input type="password">` の `value` 属性自体が存在しないこと、HTML body 70KB の grep で 0 ヒットを確認。

## 観察事項

1. **baseURL field の描画条件**: 実装上 `provider === "openai"` のときのみ baseURL input が描画される。Anthropic provider 固定の TC-2 / TC-3 では baseURL の lock 表示自体は見えないが、`envOverrides.baseURL` は `allLocked` 判定に正しく寄与する（TC-2 で banner が表示される動作で確認）。
2. **lock badge**: 各 field の lock 表現として「環境変数 `ADMIN_LLM_*` で固定されているため変更できません」という説明文が描画される。バッジは `<span aria-hidden="true">` として実装されているため snapshot には載らないが、スクショで目視確認可。
3. **「環境変数から読み込み中」status** の意味: TC-1 で apiKey 入力欄に表示される「環境変数から読み込み中」は、Issue #101 ADR-007 の `apiKeySource = 'env'` 状態（DB 未保存）を示す既存ステータス。Issue #143 の `envOverrides.apiKey = true`（env 由来）とは別概念で、TC-1 では `envOverrides.apiKey = false` のため入力欄は編集可能。

## スキップしたテストケース

testing.md の以下は agent-browser での実行コストが高いため未実施:
- 確認項目 5（env 由来現値の表示）: TC-1 / TC-2 / TC-3 で env 値表示は確認済みのため、独立 TC として実施せず
- エッジケース 1（直接 POST で env override 項目送信）: DevTools 操作が複雑、unit/integration テスト（`adminSettings.integration.test.ts` の silent skip テスト）でカバー
- エッジケース 2（`ADMIN_LLM_BASE_URL=""`）: TC-1, TC-3 が baseURL="" 状態で baseURL を「override なし」と判定する動作を間接的に確認済み

## 起票したIssue
- なし（全 PASS）
