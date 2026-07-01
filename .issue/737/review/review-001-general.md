# レビュー: PR #808 — Issue #737 取り込み系 POST に CSRF 保護を追加

レビュー観点: General Review
対象 PR: #808
対象計画: `.issue/737/plan.md`

## 受け入れ基準の検証

| AC | 内容 | 判定 | 根拠 |
|----|------|------|------|
| AC-1 | POST 5本が `[errorResponseMiddleware, csrfMiddleware]` | OK | `actions.ts` L26 / L100 / L227 / L245 / L263 |
| AC-2 | GET 4本に csrfMiddleware を追加しない | OK | `actions.ts` L141 / L166 / L180 / L198 はすべて `[errorResponseMiddleware]` のまま |
| AC-3 | cross-origin POST を 403、same-origin は従来通り | OK | `csrfMiddleware` のロジックは未変更で配線のみ。手動テスト（TC-001 / TC-002 / EDGE-001）も全 PASS |
| AC-4 | 品質ゲート | 部分確認 | `pnpm biome check` クリーン。typecheck/test はこのレビューでは未実行だが、変更は admin 系と同一パターンの配線追加のみで回帰リスクは極小 |

### General Review

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** POST 5本すべてに漏れなく `csrfMiddleware` が付与されている。`grep` でも `uploadFileFn` / `commitIngestionPreviewFn` / `discardIngestionPreviewFn` / `regenerateIngestionPreviewFn` / `ownerRetryIngestionJobFn` の 5 箇所すべてを確認（`app/components/ingestion/actions.ts:26,100,227,245,263`）。
- **[N-002]** GET 4本（`getEffectiveIngestionPromptsFn` / `getIngestionQueueCountFn` / `getIngestionJobFn` / `getIngestionJobsFn`）は `[errorResponseMiddleware]` のままで、誤適用なし。Issue 方針（GET 系は対象外）に正しく従っている。
- **[N-003]** middleware の順序が `[errorResponseMiddleware, csrfMiddleware]` で、参照実装 `app/components/admin/SpeechSettingsForm/action.ts:21` および他 admin 系（`UsersTable/action.ts`, `PromptsForm/action.ts` 等）と完全に対称。`csrfMiddleware.ts` の JSDoc（L36「errorResponseMiddleware ... must wrap this middleware (i.e. appear first in the array)」）の要件も満たす。
- **[N-004]** import の追加・配置は biome のルールに適合（`pnpm biome check app/components/ingestion/actions.ts` がノーフィックスでパス）。`@/core/presentation/csrfMiddleware` → `errorResponse` → `errorResponseMiddleware` のアルファベット順も正しい。
- **[N-005]** 取り込み系で他に CSRF が必要な POST server function の漏れは無い。`createServerFn` は `app/components/ingestion/` 配下で `actions.ts` のみに存在し（テストのスタブを除く）、`loaders.ts` は `cache` + `serverData` のローダー（state-changing でない）のみ。漏れた POST エンドポイントは存在しない。
- **[N-006]** PR には plan.md / testing.md / 手動テストレポート（全 3 件 PASS）も同梱されており、ドキュメントと検証が揃っている。
